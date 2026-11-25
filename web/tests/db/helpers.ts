import { Client } from "pg";
import { randomUUID, createHash } from "node:crypto";

export const DB_URL = process.env.TEST_DATABASE_URL ?? `postgres:///${process.env.TEST_DB_NAME ?? "ticklo_test"}`;

export const SEED = {
  admin: "00000000-0000-4000-8000-000000000001",
  organizer: "00000000-0000-4000-8000-000000000002",
  student: "00000000-0000-4000-8000-000000000003",
  scanner: "00000000-0000-4000-8000-000000000004",
  member: "00000000-0000-4000-8000-000000000005",
  org: "20000000-0000-4000-8000-000000000001",
  pendingOrg: "20000000-0000-4000-8000-000000000002",
  bankAccount: "30000000-0000-4000-8000-000000000001",
  gala: "40000000-0000-4000-8000-000000000001",
  galaFree: "50000000-0000-4000-8000-000000000001",
  galaStudent: "50000000-0000-4000-8000-000000000002",
  galaVip: "50000000-0000-4000-8000-000000000003",
} as const;

export async function connect(): Promise<Client> {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  return c;
}

type Role = "anon" | "authenticated" | "service_role";

/**
 * Run `fn` inside a transaction as a Supabase role with JWT claims, the same
 * way PostgREST does it. Rolls back on error and re-throws.
 */
export async function as<T>(
  c: Client,
  role: Role,
  userId: string | null,
  fn: () => Promise<T>,
  email?: string,
): Promise<T> {
  await c.query("begin");
  try {
    const claims: Record<string, string> = { role };
    if (userId) claims.sub = userId;
    if (email) claims.email = email;
    await c.query("select set_config('role', $1, true), set_config('request.jwt.claims', $2, true)", [
      role,
      JSON.stringify(claims),
    ]);
    const result = await fn();
    await c.query("commit");
    return result;
  } catch (e) {
    await c.query("rollback");
    throw e;
  }
}

export const asUser = <T>(c: Client, userId: string, fn: () => Promise<T>, email?: string) =>
  as(c, "authenticated", userId, fn, email);
export const asService = <T>(c: Client, fn: () => Promise<T>) => as(c, "service_role", null, fn);
export const asAnon = <T>(c: Client, fn: () => Promise<T>) => as(c, "anon", null, fn);

export async function rpc<T = unknown>(c: Client, fn: string, args: unknown[], casts: string[] = []): Promise<T> {
  const params = args.map((_, i) => `$${i + 1}${casts[i] ? `::${casts[i]}` : ""}`).join(", ");
  const r = await c.query(`select public.${fn}(${params}) as r`, args);
  return r.rows[0]?.r as T;
}

/** Expect a TL:<CODE> error from a promise. */
export async function expectTL(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    const msg = (e as Error).message;
    if (!msg.includes(`TL:${code}`)) {
      throw new Error(`Expected TL:${code} but got: ${msg}`);
    }
    return;
  }
  throw new Error(`Expected TL:${code} but the call succeeded`);
}

/** Superuser helper: create a confirmed user with a complete profile. */
export async function createUser(c: Client, name = "Test User"): Promise<{ id: string; email: string }> {
  const id = randomUUID();
  const email = `${id.slice(0, 8)}@test.local`;
  await c.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, jsonb_build_object('full_name', $3::text))",
    [id, email, name],
  );
  await c.query("update public.profiles set phone = '+923001112233' where id = $1", [id]);
  return { id, email };
}

interface TypeSpec {
  name?: string;
  price?: number; // paisa
  quantity?: number;
  requiresCard?: boolean;
  saleEndsAt?: string | null;
}

/** Superuser helper: a published event (starts in 7 days) of the seed society. */
export async function createEvent(
  c: Client,
  types: TypeSpec[],
  opts: { capacity?: number; maxPerOrder?: number; status?: string } = {},
): Promise<{ eventId: string; typeIds: string[] }> {
  const eventId = randomUUID();
  const slug = `ev-${eventId.slice(0, 8)}`;
  await c.query(
    `insert into public.events (id, org_id, slug, name, venue, starts_at, ends_at, capacity, max_tickets_per_order, status, published_at, created_by)
     values ($1, $2, $3, 'Test Event', 'Test Venue', now() + interval '7 days', now() + interval '7 days 4 hours', $4, $5, $6, now(), $7)`,
    [eventId, SEED.org, slug, opts.capacity ?? 1000, opts.maxPerOrder ?? 5, opts.status ?? "published", SEED.organizer],
  );
  const typeIds: string[] = [];
  for (const [i, t] of types.entries()) {
    const r = await c.query(
      `insert into public.ticket_types (event_id, name, price_paisa, quantity, requires_student_card, sale_ends_at, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [eventId, t.name ?? `Type ${i + 1}`, t.price ?? 100000, t.quantity ?? 100, t.requiresCard ?? false, t.saleEndsAt ?? null, i],
    );
    typeIds.push(r.rows[0].id);
  }
  await c.query("insert into public.event_payment_accounts (event_id, payment_account_id) values ($1, $2)", [
    eventId,
    SEED.bankAccount,
  ]);
  return { eventId, typeIds };
}

export const items = (...pairs: [string, number][]) =>
  JSON.stringify(pairs.map(([ticket_type_id, quantity]) => ({ ticket_type_id, quantity })));

export const fakeHash = (seed: string) => createHash("sha256").update(seed).digest("hex");

export interface OrderResult {
  order_id: string;
  ref_code: string;
  status: string;
  total_paisa: number;
  existing: boolean;
}

export async function book(c: Client, userId: string, eventId: string, its: string): Promise<OrderResult> {
  return asUser(c, userId, () => rpc<OrderResult>(c, "create_order", [eventId, its], ["uuid", "jsonb"]));
}

export async function submitProof(
  c: Client,
  userId: string,
  orderId: string,
  opts: { txn?: string; hash?: string; card?: string | null; account?: string | null } = {},
) {
  return asService(c, () =>
    rpc<{ proof_id: string; is_possible_duplicate: boolean; duplicate_reasons: string[] }>(
      c,
      "submit_payment_proof",
      [
        userId,
        orderId,
        `x/${orderId}/shot.jpg`,
        opts.hash ?? fakeHash(orderId),
        opts.txn ?? `TXN-${orderId.slice(0, 8)}`,
        "Sender Name",
        opts.card ?? null,
        opts.account ?? null,
      ],
      ["uuid", "uuid", "text", "text", "text", "text", "text", "uuid"],
    ),
  );
}
