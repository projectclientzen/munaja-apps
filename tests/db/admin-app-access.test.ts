/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, rows } from "./harness";

const NOW = "2026-11-18T03:00:00Z";

describe("ADMIN-APP-ACCESS: admin accounts can use the app (owner report 18 Nov 2026)", () => {
  let pg: PGlite;
  beforeAll(async () => {
    pg = await createTestDb();
  }, 60_000);
  afterAll(async () => pg.close());

  const account = async (email: string): Promise<string> => {
    const id = (await rows<{ id: string }>(pg, "insert into auth.users (email) values ($1) returning id::text", [email]))[0]!.id;
    await pg.query("insert into public.profiles (user_id, email_normalized, program_start_date) values ($1::uuid, $2, '2026-11-01')", [id, email]);
    return id;
  };
  const staffRows = (id: string) =>
    rows<any>(pg, "select status, granted_by::text as granted_by, revoke_reason from public.access_entitlements where user_id = $1::uuid and entitlement_type = 'staff_comp' order by created_at", [id]);

  it("granting the first role gives active app access, once, with every level open and an audit row", async () => {
    const id = await account("admin@ngajigaes.test");
    await pg.query("insert into public.user_roles (user_id, role, granted_at) values ($1::uuid, 'super_admin', $2::timestamptz)", [id, NOW]);
    await pg.query("insert into public.user_roles (user_id, role, granted_at) values ($1::uuid, 'support_admin', $2::timestamptz)", [id, NOW]);
    const ents = await staffRows(id);
    expect(ents).toHaveLength(1);
    expect(ents[0]).toMatchObject({ status: "active", granted_by: id });
    expect((await rows<{ b: boolean }>(pg, "select app_private.has_all_levels($1::uuid) as b", [id]))[0]!.b).toBe(true);
    expect(await rows(pg, "select 1 from public.admin_audit_logs where action = 'staff.auto_for_admin'")).toHaveLength(1);
    // Not listed as a staff account made from the staff screen.
    const list = (await rows<{ j: any[] }>(pg, "select app_private.admin_staff_list($1::uuid, '{super_admin}') as j", [id]))[0]!.j;
    expect(list.find((s: any) => s.user_id === id)).toBeUndefined();
  });

  it("removing one role keeps access; removing the last role revokes only the automatic access", async () => {
    const id = (await rows<{ id: string }>(pg, "select user_id::text as id from public.profiles where email_normalized = 'admin@ngajigaes.test'"))[0]!.id;
    await pg.query("delete from public.user_roles where user_id = $1::uuid and role = 'support_admin'", [id]);
    expect((await staffRows(id))[0]).toMatchObject({ status: "active" });
    await pg.query("delete from public.user_roles where user_id = $1::uuid", [id]);
    expect((await staffRows(id))[0]).toMatchObject({ status: "revoked", revoke_reason: "admin_role_removed" });
    expect((await rows<{ b: boolean }>(pg, "select app_private.has_all_levels($1::uuid) as b", [id]))[0]!.b).toBe(false);
  });

  it("an account that already has staff access made by another admin is not touched", async () => {
    const boss = await account("boss@ngajigaes.test");
    const id = await account("staf-lama@ngajigaes.test");
    await pg.query(
      "insert into public.access_entitlements (user_id, email_normalized, entitlement_type, status, starts_at, granted_by) values ($1::uuid, 'staf-lama@ngajigaes.test', 'staff_comp', 'active', $2::timestamptz, $3::uuid)",
      [id, NOW, boss],
    );
    await pg.query("insert into public.user_roles (user_id, role) values ($1::uuid, 'content_admin')", [id]);
    expect(await staffRows(id)).toHaveLength(1);
    await pg.query("delete from public.user_roles where user_id = $1::uuid", [id]);
    expect((await staffRows(id))[0]).toMatchObject({ status: "active", granted_by: boss });
  });
});
