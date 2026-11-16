import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { migrateAll, MigrateError, seedWithoutDemo, type MigrateClient } from "../../scripts/db-migrate";

const dbs: PGlite[] = [];
afterEach(async () => {
  for (const d of dbs.splice(0)) await d.close();
});

function client(): { pg: PGlite; c: MigrateClient } {
  const pg = new PGlite();
  dbs.push(pg);
  return {
    pg,
    c: {
      exec: async (sql) => void (await pg.exec(sql)),
      query: async <T>(sql: string, params?: readonly unknown[]) => (await pg.query<T>(sql, params as unknown[])).rows,
    },
  };
}

/** A tiny supabase folder: empty bootstrap, the given migrations. */
function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "mig-"));
  mkdirSync(join(dir, "bootstrap"));
  mkdirSync(join(dir, "migrations"));
  writeFileSync(join(dir, "bootstrap", "00.sql"), "select 1;");
  for (const [n, s] of Object.entries(files)) writeFileSync(join(dir, "migrations", n), s);
  return dir;
}

describe("migrate runner", () => {
  it("applies in order, records checksums, and is idempotent", async () => {
    const dir = fixture({ "001_a.sql": "create table a(id int);", "002_b.sql": "create table b(id int);" });
    const { pg, c } = client();
    const r1 = await migrateAll(c, { supabaseDir: dir });
    expect(r1.applied).toEqual(["001_a.sql", "002_b.sql"]);
    const rows = (await pg.query<{ name: string; sha256: string }>("select name, sha256 from public.schema_migrations order by name")).rows;
    expect(rows.map((x) => x.name)).toEqual(["001_a.sql", "002_b.sql"]);
    expect(rows[0]!.sha256).toMatch(/^[0-9a-f]{64}$/);
    const r2 = await migrateAll(c, { supabaseDir: dir });
    expect(r2.applied).toEqual([]);
    expect(r2.skipped).toHaveLength(2);
  });

  it("refuses a file whose checksum changed", async () => {
    const dir = fixture({ "001_a.sql": "create table a(id int);" });
    const { c } = client();
    await migrateAll(c, { supabaseDir: dir });
    writeFileSync(join(dir, "migrations", "001_a.sql"), "create table a(id int, x int);");
    await expect(migrateAll(c, { supabaseDir: dir })).rejects.toThrow(/changed after it was applied/);
  });

  it("refuses a new migration named earlier than the last applied one", async () => {
    const dir = fixture({ "002_b.sql": "create table b(id int);" });
    const { c } = client();
    await migrateAll(c, { supabaseDir: dir });
    writeFileSync(join(dir, "migrations", "001_a.sql"), "create table a(id int);");
    await expect(migrateAll(c, { supabaseDir: dir })).rejects.toThrow(/older than the last applied/);
  });

  it("rolls back a failing file and leaves no record of it", async () => {
    const dir = fixture({ "001_a.sql": "create table a(id int);", "002_bad.sql": "create table c(id int); select 1/0;" });
    const { pg, c } = client();
    await expect(migrateAll(c, { supabaseDir: dir })).rejects.toBeInstanceOf(MigrateError);
    const names = (await pg.query<{ name: string }>("select name from public.schema_migrations")).rows.map((x) => x.name);
    expect(names).toEqual(["001_a.sql"]);
    const t = (await pg.query<{ n: string }>("select to_regclass('public.c')::text as n")).rows[0]!;
    expect(t.n).toBeNull();
  });

  it("status only changes nothing", async () => {
    const dir = fixture({ "001_a.sql": "create table a(id int);" });
    const { c } = client();
    const r = await migrateAll(c, { supabaseDir: dir, statusOnly: true });
    expect(r.pending).toEqual(["001_a.sql"]);
    expect(r.applied).toEqual([]);
  });

  it("the real bootstrap and migrations apply on empty Postgres, twice", async () => {
    const dir = mkdtempSync(join(tmpdir(), "real-"));
    cpSync(join(process.cwd(), "supabase"), dir, { recursive: true });
    const { pg, c } = client();
    const r1 = await migrateAll(c, { supabaseDir: dir, seed: true });
    expect(r1.applied.length).toBeGreaterThan(20);
    const levels = (await pg.query<{ n: number }>("select count(*)::int as n from public.levels")).rows[0]!.n;
    expect(levels).toBeGreaterThan(0);
    const demo = (await pg.query<{ n: number }>("select count(*)::int as n from public.regions where provider_region_code like 'DEMO-%'")).rows[0]!.n;
    expect(demo).toBe(0);
    const r2 = await migrateAll(c, { supabaseDir: dir, seed: true });
    expect(r2.applied).toEqual([]);
  });

  it("seedWithoutDemo cuts the DEMO block", () => {
    expect(seedWithoutDemo("a;\n-- DEMO DATA: x\ninsert 1;")).toBe("a;\n");
  });
});
