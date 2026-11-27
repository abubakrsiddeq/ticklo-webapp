import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { SEED, asAnon, asUser, connect, createUser, expectTL, rpc } from "./helpers";

const LUMS = "10000000-0000-4000-8000-000000000001";
const T = ["text", "text"];

let c: Client;
beforeAll(async () => {
  c = await connect();
});
afterAll(async () => {
  await c.end();
});

const request = (userId: string, name: string, city = "Sargodha") =>
  asUser(c, userId, () => rpc<string>(c, "request_university", [name, city], T));
const visibleTo = async (userId: string | null, id: string) => {
  const q = () => c.query("select id from public.universities where id = $1", [id]);
  return ((userId ? await asUser(c, userId, q) : await asAnon(c, q)).rowCount ?? 0) > 0;
};

describe("'Other' university requests (D-057)", () => {
  it("files a pending university that only the requester and admins see", async () => {
    const u = await createUser(c);
    const id = await request(u.id, "  University   of Sargodha ");
    const row = await c.query("select name, status, requested_by from public.universities where id = $1", [id]);
    expect(row.rows[0]).toMatchObject({ name: "University of Sargodha", status: "pending", requested_by: u.id });
    expect(await visibleTo(u.id, id)).toBe(true);
    expect(await visibleTo(SEED.admin, id)).toBe(true);
    expect(await visibleTo(null, id)).toBe(false);
    expect(await visibleTo((await createUser(c)).id, id)).toBe(false);
  });

  it("reuses an existing university by name or short name, and a pending one by name", async () => {
    const u = await createUser(c);
    expect(await request(u.id, "lums")).toBe(LUMS);
    expect(await request(u.id, "Lahore University of Management Sciences")).toBe(LUMS);
    const first = await request(u.id, "Government College Sahiwal", "Sahiwal");
    expect(await request((await createUser(c)).id, "government college sahiwal", "Sahiwal")).toBe(first);
  });

  it("lets people who picked a pending university see it", async () => {
    const a = await createUser(c);
    const b = await createUser(c);
    const id = await request(a.id, "Thal University Bhakkar", "Bhakkar");
    await c.query("update public.profiles set university_id = $1 where id = $2", [id, b.id]);
    expect(await visibleTo(b.id, id)).toBe(true);
  });

  it("validates input and caps open requests per person", async () => {
    const u = await createUser(c);
    await expectTL(request(u.id, "ab"), "INVALID_UNIVERSITY");
    await expectTL(request(u.id, "Real University", ""), "INVALID_UNIVERSITY");
    await expect(asAnon(c, () => rpc(c, "request_university", ["Some University", "Multan"], T))).rejects.toThrow(/permission denied/);
    for (const n of ["Uni Alpha One", "Uni Beta Two", "Uni Gamma Three"]) await request(u.id, n);
    await expectTL(request(u.id, "Uni Delta Four"), "TOO_MANY_PENDING");
  });

  it("admin approval makes it public with the corrected name", async () => {
    const u = await createUser(c);
    const id = await request(u.id, "univ of okara", "Okara");
    const A = ["uuid", "text", "text", "text", "text"];
    await expectTL(asUser(c, u.id, () => rpc(c, "admin_approve_university", [id, "University of Okara", "UO", "Okara", ""], A)), "FORBIDDEN");
    await asUser(c, SEED.admin, () => rpc(c, "admin_approve_university", [id, "University of Okara", "UO", "Okara", "uo.edu.pk"], A));
    const row = await c.query("select name, short_name, status, email_domain from public.universities where id = $1", [id]);
    expect(row.rows[0]).toEqual({ name: "University of Okara", short_name: "UO", status: "approved", email_domain: "uo.edu.pk" });
    expect(await visibleTo(null, id)).toBe(true);
    await expectTL(asUser(c, SEED.admin, () => rpc(c, "admin_approve_university", [id, "X Univ", "", "Okara", ""], A)), "NOT_FOUND");
  });

  it("admin merge moves profiles and societies onto the existing university", async () => {
    const u = await createUser(c);
    const id = await request(u.id, "Lahore Univ of Mgmt Sciences", "Lahore");
    await c.query("update public.profiles set university_id = $1 where id = $2", [id, u.id]);
    await c.query("update public.organizations set university_id = $1 where id = $2", [id, SEED.pendingOrg]);
    const M = ["uuid", "uuid"];
    await expectTL(asUser(c, u.id, () => rpc(c, "admin_merge_university", [id, LUMS], M)), "FORBIDDEN");
    await expectTL(asUser(c, SEED.admin, () => rpc(c, "admin_merge_university", [LUMS, id], M)), "INVALID_STATE");
    await asUser(c, SEED.admin, () => rpc(c, "admin_merge_university", [id, LUMS], M));
    expect((await c.query("select university_id from public.profiles where id = $1", [u.id])).rows[0].university_id).toBe(LUMS);
    expect((await c.query("select university_id from public.organizations where id = $1", [SEED.pendingOrg])).rows[0].university_id).toBe(LUMS);
    expect((await c.query("select 1 from public.universities where id = $1", [id])).rowCount).toBe(0);
  });
});
