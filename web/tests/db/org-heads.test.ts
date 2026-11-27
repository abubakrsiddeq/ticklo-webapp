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
