import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { SEED, asAnon, asUser, connect, createUser, expectTL, rpc } from "./helpers";

const T = ["text", "text", "uuid", "org_type", "text", "text", "jsonb", "text", "boolean", "text", "text", "text"];

let c: Client;
beforeAll(async () => {
  c = await connect();
});
afterAll(async () => {
  await c.end();
});

let n = 0;
const create = (userId: string, head: [boolean | null, string | null, string | null, string | null]) =>
  asUser(c, userId, () =>
    rpc<string>(c, "create_organization", [`Head Society ${++n}`, `head-soc-${n}-${userId.slice(0, 6)}`, null, "society", "", null, "{}", null, ...head], T),
  );
const headOf = async (orgId: string) =>
  (await c.query("select is_submitter, name, phone, email from public.organization_heads where org_id = $1", [orgId])).rows[0];

describe("society head details (D-060)", () => {
  it("'I am the head' uses the account's name and email, not typed ones", async () => {
    const u = await createUser(c, "Ayesha Khan");
    const orgId = await create(u.id, [true, "Someone Else", "+923214445566", "fake@evil.pk"]);
    expect(await headOf(orgId)).toEqual({ is_submitter: true, name: "Ayesha Khan", phone: "+923214445566", email: u.email });
  });

  it("'someone else' stores the typed details", async () => {
    const u = await createUser(c);
    const orgId = await create(u.id, [false, "  Ali   Raza ", "+923001234567", "Ali@Uni.edu.pk"]);
    expect(await headOf(orgId)).toEqual({ is_submitter: false, name: "Ali Raza", phone: "+923001234567", email: "ali@uni.edu.pk" });
  });

  it("refuses missing or invalid details and creates nothing", async () => {
    const u = await createUser(c);
    await expectTL(create(u.id, [false, "A", "+923001234567", "a@b.pk"]), "INVALID_HEAD");
    await expectTL(create(u.id, [false, "Ali Raza", "0300", "a@b.pk"]), "INVALID_HEAD");
    await expectTL(create(u.id, [false, "Ali Raza", "+923001234567", "not-an-email"]), "INVALID_HEAD");
    await expectTL(create(u.id, [true, null, "", null]), "INVALID_HEAD");
    const left = await c.query("select count(*)::int n from public.organizations where created_by = $1", [u.id]);
    expect(left.rows[0].n).toBe(0);
  });

  it("still works without head details (web build that is live during the migration)", async () => {
    const u = await createUser(c);
    const orgId = await create(u.id, [null, null, null, null]);
    expect(await headOf(orgId)).toBeUndefined();
  });

  it("only admins and the society's owners can read it; nobody writes it directly", async () => {
    const owner = await createUser(c);
    const orgId = await create(owner.id, [false, "Sara Ahmed", "+923331234567", "sara@uni.pk"]);
    const read = (userId: string | null) => {
      const q = () => c.query("select name from public.organization_heads where org_id = $1", [orgId]);
      return userId ? asUser(c, userId, q) : asAnon(c, q);
    };
    expect((await read(owner.id)).rowCount).toBe(1);
    expect((await read(SEED.admin)).rowCount).toBe(1);
    expect((await read((await createUser(c)).id)).rowCount).toBe(0);
    await expect(read(null)).rejects.toThrow(/permission denied/);
    await expect(
      asUser(c, owner.id, () => c.query("update public.organization_heads set phone = '+923000000000' where org_id = $1", [orgId])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("changing the society head from Settings (D-061)", () => {
  const H = ["uuid", "boolean", "text", "text", "text"];
  const setHead = (userId: string, orgId: string, args: [boolean | null, string, string, string]) =>
    asUser(c, userId, () => rpc(c, "set_organization_head", [orgId, ...args], H));

  it("the owner can change it; 'self' still uses the account's name and email", async () => {
    const owner = await createUser(c, "Hamza Tariq");
    const orgId = await create(owner.id, [false, "Old Head", "+923001234567", "old@uni.pk"]);
    await setHead(owner.id, orgId, [false, "New Head", "+923111234567", "New@Uni.pk"]);
    expect(await headOf(orgId)).toEqual({ is_submitter: false, name: "New Head", phone: "+923111234567", email: "new@uni.pk" });
    await setHead(owner.id, orgId, [true, "Fake Name", "+923121234567", "fake@evil.pk"]);
    expect(await headOf(orgId)).toEqual({ is_submitter: true, name: "Hamza Tariq", phone: "+923121234567", email: owner.email });
    const log = await c.query("select count(*)::int n from public.audit_log where action = 'organization.head_change' and target_id = $1", [orgId]);
    expect(log.rows[0].n).toBe(2);
  });

  it("adds it for a society that has none", async () => {
    const owner = await createUser(c);
    const orgId = await create(owner.id, [null, null, null, null]);
    await setHead(owner.id, orgId, [false, "Zara Malik", "+923331112222", "zara@uni.pk"]);
    expect((await headOf(orgId)).name).toBe("Zara Malik");
  });

  it("members, other users and logged-out visitors cannot change it; bad input is refused", async () => {
    const owner = await createUser(c);
    const orgId = await create(owner.id, [false, "Real Head", "+923001234567", "real@uni.pk"]);
    const member = await createUser(c);
    await c.query("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member')", [orgId, member.id]);
    await expectTL(setHead(member.id, orgId, [false, "Hijack", "+923001234567", "x@y.pk"]), "FORBIDDEN");
    await expectTL(setHead((await createUser(c)).id, orgId, [false, "Hijack", "+923001234567", "x@y.pk"]), "FORBIDDEN");
    await expect(asAnon(c, () => rpc(c, "set_organization_head", [orgId, false, "Hijack", "+923001234567", "x@y.pk"], H))).rejects.toThrow(
      /permission denied/,
    );
    await expectTL(setHead(owner.id, orgId, [null, "Real Head", "+923001234567", "real@uni.pk"]), "INVALID_HEAD");
    await expectTL(setHead(owner.id, orgId, [false, "Real Head", "03001234567", "real@uni.pk"]), "INVALID_HEAD");
    expect((await headOf(orgId)).name).toBe("Real Head");
  });
});
