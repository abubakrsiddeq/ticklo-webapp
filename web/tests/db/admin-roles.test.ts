import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { SEED, asUser, connect, createUser, expectTL, rpc } from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await connect();
});
afterAll(async () => {
  await c.end();
});

async function createOrg(ownerId: string) {
  const id = randomUUID();
  await c.query(
    `insert into public.organizations (id, slug, name, university_id, type, status, created_by)
     values ($1, $2, 'Role Test Society', '10000000-0000-4000-8000-000000000001', 'society', 'approved', $3)`,
    [id, `role-test-${id.slice(0, 8)}`, ownerId],
  );
  await c.query("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'owner')", [id, ownerId]);
  return id;
}

const roleOf = async (orgId: string, userId: string) =>
  (await c.query("select role from public.organization_members where org_id = $1 and user_id = $2", [orgId, userId])).rows[0]?.role ?? null;

describe("Admin role management (D-037)", () => {
  it("lets only admins change platform admin access, never their own", async () => {
    const u = await createUser(c);
    await expectTL(asUser(c, SEED.organizer, () => rpc(c, "admin_set_platform_admin", [u.id, true])), "FORBIDDEN");
    await asUser(c, SEED.admin, () => rpc(c, "admin_set_platform_admin", [u.id, true]));
    expect((await c.query("select is_admin from public.profiles where id = $1", [u.id])).rows[0].is_admin).toBe(true);
    await asUser(c, SEED.admin, () => rpc(c, "admin_set_platform_admin", [u.id, false]));
    expect((await c.query("select is_admin from public.profiles where id = $1", [u.id])).rows[0].is_admin).toBe(false);
    await expectTL(asUser(c, SEED.admin, () => rpc(c, "admin_set_platform_admin", [SEED.admin, false])), "INVALID_STATE");
    const log = await c.query("select action from public.audit_log where target_id = $1 order by created_at", [u.id]);
    expect(log.rows.map((r) => r.action)).toEqual(["user.make_admin", "user.remove_admin"]);
  });

  it("adds people to a society, changes roles and transfers ownership", async () => {
    const owner = await createUser(c);
    const u = await createUser(c);
    const org = await createOrg(owner.id);
    await expectTL(asUser(c, owner.id, () => rpc(c, "admin_set_org_role", [org, u.id, "member"])), "FORBIDDEN");

    await asUser(c, SEED.admin, () => rpc(c, "admin_set_org_role", [org, u.id, "scanner"]));
    expect(await roleOf(org, u.id)).toBe("scanner");
    await asUser(c, SEED.admin, () => rpc(c, "admin_set_org_role", [org, u.id, "member"]));
    expect(await roleOf(org, u.id)).toBe("member");

    // owner cannot be demoted directly
    await expectTL(asUser(c, SEED.admin, () => rpc(c, "admin_set_org_role", [org, owner.id, "member"])), "CANNOT_CHANGE_OWNER");
    // making someone owner moves the old owner to member
    await asUser(c, SEED.admin, () => rpc(c, "admin_set_org_role", [org, u.id, "owner"]));
    expect(await roleOf(org, u.id)).toBe("owner");
    expect(await roleOf(org, owner.id)).toBe("member");
  });

  it("removes members but not the owner", async () => {
    const owner = await createUser(c);
    const u = await createUser(c);
    const org = await createOrg(owner.id);
    await asUser(c, SEED.admin, () => rpc(c, "admin_set_org_role", [org, u.id, "scanner"]));
    await expectTL(asUser(c, SEED.admin, () => rpc(c, "admin_remove_org_member", [org, owner.id])), "CANNOT_CHANGE_OWNER");
    await asUser(c, SEED.admin, () => rpc(c, "admin_remove_org_member", [org, u.id]));
    expect(await roleOf(org, u.id)).toBeNull();
    await expectTL(asUser(c, SEED.admin, () => rpc(c, "admin_remove_org_member", [org, u.id])), "NOT_A_MEMBER");
  });

  it("still blocks users from making themselves admin through the profile table", async () => {
    const u = await createUser(c);
    await expect(asUser(c, u.id, () => c.query("update public.profiles set is_admin = true where id = $1", [u.id]))).rejects.toThrow(
      /permission denied/,
    );
  });
});
