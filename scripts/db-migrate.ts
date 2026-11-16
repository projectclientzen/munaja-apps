/**
 * Applies the database schema to plain PostgreSQL (VPS). Same files the tests use.
 *   pnpm db:migrate              bootstrap, then every new file in supabase/migrations
 *   pnpm db:migrate --seed       also load the app content (levels, activities, settings). No DEMO regions.
 *   pnpm db:migrate --status     list applied and pending files, change nothing
 * Connects with MIGRATE_DATABASE_URL, or DATABASE_URL when that is not set. Use the OWNER role (munaja_owner), not
 * munaja_app: the owner creates the tables, so the default privileges in the bootstrap apply to them.
 * Rules: one transaction per file; a file whose checksum changed after it was applied is refused; a new file named
 * earlier than the last applied one is refused. Safe to run again: applied files are skipped.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool, type PoolClient } from "pg";

const ROOT = join(import.meta.dirname, "..", "supabase");

/** The least a driver must do. PGlite and node-postgres both fit through `makeClient*`. */
export interface MigrateClient {
  /** Run SQL that may hold several statements. */
  exec(sql: string): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T[]>;
}

export interface MigrateOptions {
  supabaseDir?: string;
  seed?: boolean;
  /** true = report only. */
  statusOnly?: boolean;
  log?: (line: string) => void;
}

export interface MigrateResult {
  applied: string[];
  skipped: string[];
  pending: string[];
}

export class MigrateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrateError";
  }
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const sqlFiles = (dir: string) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

/** Seed without the DEMO regions block: a real server must not carry sample regions. */
export function seedWithoutDemo(sql: string): string {
  const i = sql.indexOf("-- DEMO DATA");
  return i === -1 ? sql : sql.slice(0, i);
}

const ADVISORY_LOCK_KEY = 7_315_001;

export async function runMigrations(db: MigrateClient, opts: MigrateOptions = {}): Promise<MigrateResult> {
  const dir = opts.supabaseDir ?? ROOT;
  const log = opts.log ?? (() => undefined);
  const result: MigrateResult = { applied: [], skipped: [], pending: [] };

  await db.exec("create table if not exists public.schema_migrations (name text primary key, sha256 text not null, applied_at timestamptz not null default now())");
  const done = new Map<string, string>();
  for (const r of await db.query<{ name: string; sha256: string }>("select name, sha256 from public.schema_migrations")) {
    done.set(r.name, r.sha256);
  }
  const lastApplied = [...done.keys()].sort().pop() ?? null;

  const files = sqlFiles(join(dir, "migrations"));
  const todo: { name: string; sql: string; sum: string }[] = [];
  for (const name of files) {
    const sql = readFileSync(join(dir, "migrations", name), "utf8");
    const sum = sha256(sql);
    const had = done.get(name);
    if (had !== undefined) {
      if (had !== sum) {
        throw new MigrateError(`${name} was changed after it was applied. Never edit an applied migration; add a new file.`);
      }
      result.skipped.push(name);
    } else {
      if (lastApplied !== null && name < lastApplied) {
        throw new MigrateError(`${name} is older than the last applied migration (${lastApplied}). Rename it to a later timestamp.`);
      }
      todo.push({ name, sql, sum });
    }
  }
  for (const name of done.keys()) {
    if (!files.includes(name)) throw new MigrateError(`${name} is recorded as applied but the file is missing from supabase/migrations.`);
  }
  result.pending = todo.map((t) => t.name);
  if (opts.statusOnly) return result;

  for (const t of todo) {
    await db.exec("begin");
    try {
      await db.exec(t.sql);
      await db.query("insert into public.schema_migrations (name, sha256) values ($1, $2)", [t.name, t.sum]);
      await db.exec("commit");
    } catch (e) {
      await db.exec("rollback").catch(() => undefined);
      throw new MigrateError(`${t.name} failed and was rolled back: ${e instanceof Error ? e.message : String(e)}`);
    }
    result.applied.push(t.name);
    log(`applied ${t.name}`);
  }
  result.pending = [];

  if (opts.seed) {
    await db.exec("begin");
    try {
      await db.exec(seedWithoutDemo(readFileSync(join(dir, "seed.sql"), "utf8")));
      await db.exec("commit");
    } catch (e) {
      await db.exec("rollback").catch(() => undefined);
      throw new MigrateError(`seed failed and was rolled back: ${e instanceof Error ? e.message : String(e)}`);
    }
    log("seed applied (content only, no DEMO regions)");
  }
  return result;
}

/** Bootstrap first (idempotent, needs CREATEROLE), then the migrations. */
export async function migrateAll(db: MigrateClient, opts: MigrateOptions = {}): Promise<MigrateResult> {
  const dir = opts.supabaseDir ?? ROOT;
  if (!opts.statusOnly) {
    for (const f of sqlFiles(join(dir, "bootstrap"))) {
      await db.exec(readFileSync(join(dir, "bootstrap", f), "utf8"));
      opts.log?.(`bootstrap ${f}`);
    }
  }
  return runMigrations(db, opts);
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const url = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("Set MIGRATE_DATABASE_URL (or DATABASE_URL) to the owner connection string.");
    return 2;
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  let conn: PoolClient | null = null;
  try {
    conn = await pool.connect();
    const c = conn;
    const client: MigrateClient = {
      exec: async (sql) => void (await c.query(sql)),
      query: async (sql, params) => (await c.query(sql, params as unknown[])).rows,
    };
    // One runner at a time, even if two terminals start it.
    await c.query("select pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
    const r = await migrateAll(client, { seed: args.includes("--seed"), statusOnly: args.includes("--status"), log: console.log });
    if (args.includes("--status")) {
      console.log(`applied: ${r.skipped.length}, pending: ${r.pending.length}`);
      for (const p of r.pending) console.log(`  pending ${p}`);
    } else {
      console.log(`done: ${r.applied.length} applied, ${r.skipped.length} already there`);
    }
    return 0;
  } catch (e) {
    console.error(e instanceof MigrateError ? e.message : `Failed: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  } finally {
    conn?.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!)) {
  main().then((c) => process.exit(c));
}
