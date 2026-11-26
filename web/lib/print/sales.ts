/**
 * Printed ticket sales – the "hisaab" (D-041). Pure functions so the numbers
 * on the sales page, the report and the CSV are always the same (unit-tested).
 */
import { serialLabel } from "./design";

export const SALE_METHODS = [
  { key: "cash", label: "Cash" },
  { key: "jazzcash", label: "JazzCash" },
  { key: "easypaisa", label: "EasyPaisa" },
  { key: "bank", label: "Bank transfer" },
  { key: "card", label: "Card" },
  { key: "other", label: "Other" },
] as const;
export type SaleMethod = (typeof SALE_METHODS)[number]["key"];
export const methodLabel = (m: string | null | undefined) => SALE_METHODS.find((x) => x.key === m)?.label ?? (m ? m : "Not recorded");

export interface SaleTicket {
  serial_no: number;
  prefix: string;
  status: "valid" | "checked_in" | "cancelled";
  sale_status: "in_stock" | "sold" | "comp" | "returned" | null;
  sale_source: "marked" | "scan" | null;
  sale_method: string | null;
  sale_price_paisa: number | null;
  sold_at: string | null;
  seller_id: string | null;
  type_name: string;
  price_paisa: number;
}

export interface SaleSeller {
  id: string;
  name: string;
  phone: string | null;
  user_id: string | null;
  settled_at: string | null;
}

export interface CashEntry {
  id: string;
  seller_id: string | null;
  amount_paisa: number;
  method: string;
  note: string | null;
  created_at: string;
}

export interface Bucket {
  id: string | null; // null = organizer (no seller)
  name: string;
  phone: string | null;
  userId: string | null;
  settledAt: string | null;
  given: number;
  inStock: number;
  sold: number;
  soldAtGate: number;
  comp: number;
  returned: number;
  voided: number;
  used: number; // sold or free pass, scanned at the gate
  noShow: number; // sold or free pass, not scanned
  expected: number; // paisa: sold × price
  cash: number; // paisa received
  difference: number; // cash − expected (negative = still owed)
  ranges: string;
  changedAfterSettle: boolean;
  byMethod: { method: string; count: number; amount: number }[];
}

export interface SalesSummary {
  sellers: Bucket[]; // organizer bucket first when it has tickets or cash
  totals: Omit<Bucket, "id" | "name" | "phone" | "userId" | "settledAt" | "ranges" | "changedAfterSettle"> & {
    printed: number;
    printingCost: number;
    outstanding: number; // expected − cash, if positive
  };
  byType: { name: string; price: number; printed: number; sold: number; comp: number; returned: number; inStock: number; revenue: number }[];
}

/** [1,2,3,7,8] with prefix QWL → "QWL-0001–0003, QWL-0007–0008" */
export function compressSerials(items: { prefix: string; serial_no: number }[]): string {
  const sorted = [...items].sort((a, b) => a.prefix.localeCompare(b.prefix) || a.serial_no - b.serial_no);
  const parts: string[] = [];
  let start: (typeof sorted)[number] | null = null;
  let prev: (typeof sorted)[number] | null = null;
  const flush = () => {
    if (!start || !prev) return;
    parts.push(start.serial_no === prev.serial_no ? serialLabel(start.prefix, start.serial_no) : `${serialLabel(start.prefix, start.serial_no)}–${serialLabel(prev.prefix, prev.serial_no).split("-").pop()}`);
  };
  for (const it of sorted) {
    if (prev && it.prefix === prev.prefix && it.serial_no === prev.serial_no + 1) {
      prev = it;
      continue;
    }
    flush();
    start = it;
    prev = it;
  }
  flush();
  return parts.join(", ");
}

function emptyBucket(id: string | null, name: string, s?: SaleSeller): Bucket {
  return {
    id,
    name,
    phone: s?.phone ?? null,
    userId: s?.user_id ?? null,
    settledAt: s?.settled_at ?? null,
    given: 0,
    inStock: 0,
    sold: 0,
    soldAtGate: 0,
    comp: 0,
    returned: 0,
    voided: 0,
    used: 0,
    noShow: 0,
    expected: 0,
    cash: 0,
    difference: 0,
    ranges: "",
    changedAfterSettle: false,
    byMethod: [],
  };
}

function addTicket(b: Bucket, t: SaleTicket, methods: Map<string, { count: number; amount: number }>) {
  b.given++;
  if (t.sale_status === "returned") b.returned++;
  else if (t.sale_status === "sold" || t.sale_status === "comp") {
    if (t.sale_status === "sold") {
      b.sold++;
      if (t.sale_source === "scan") b.soldAtGate++;
      const amount = t.sale_price_paisa ?? t.price_paisa;
      b.expected += amount;
      const key = t.sale_method ?? "unknown";
      const m = methods.get(key) ?? { count: 0, amount: 0 };
      m.count++;
      m.amount += amount;
      methods.set(key, m);
    } else b.comp++;
    if (t.status === "checked_in") b.used++;
    else b.noShow++;
    if (b.settledAt && t.sold_at && t.sold_at > b.settledAt) b.changedAfterSettle = true;
  } else if (t.status === "cancelled") b.voided++;
  else b.inStock++;
}

export function computeSalesSummary(tickets: SaleTicket[], sellers: SaleSeller[], cash: CashEntry[], printingCost = 0): SalesSummary {
  const buckets = new Map<string | null, Bucket>();
  const methodMaps = new Map<string | null, Map<string, { count: number; amount: number }>>();
  const ticketsOf = new Map<string | null, SaleTicket[]>();
  buckets.set(null, emptyBucket(null, "Organizer (no seller)"));
  for (const s of sellers) buckets.set(s.id, emptyBucket(s.id, s.name, s));
  for (const t of tickets) {
    const key = t.seller_id && buckets.has(t.seller_id) ? t.seller_id : null;
    if (!methodMaps.has(key)) methodMaps.set(key, new Map());
    addTicket(buckets.get(key)!, t, methodMaps.get(key)!);
    if (!ticketsOf.has(key)) ticketsOf.set(key, []);
    ticketsOf.get(key)!.push(t);
  }
  for (const e of cash) {
    const key = e.seller_id && buckets.has(e.seller_id) ? e.seller_id : null;
    buckets.get(key)!.cash += Number(e.amount_paisa);
  }
  for (const [key, b] of buckets) {
    b.difference = b.cash - b.expected;
    b.ranges = compressSerials((ticketsOf.get(key) ?? []).filter((t) => t.sale_status !== "returned" && t.status !== "cancelled"));
    b.byMethod = [...(methodMaps.get(key) ?? new Map()).entries()].map(([method, v]) => ({ method, ...v })).sort((a, z) => z.amount - a.amount);
  }

  const org = buckets.get(null)!;
  const list = [...buckets.values()].filter((b) => b.id !== null);
  const sellersOut = org.given || org.cash ? [org, ...list] : list;

  const all = [...buckets.values()];
  const sum = (k: keyof Bucket) => all.reduce((s, b) => s + (b[k] as number), 0);
  const allMethods = new Map<string, { count: number; amount: number }>();
  for (const m of methodMaps.values())
    for (const [k, v] of m) {
      const x = allMethods.get(k) ?? { count: 0, amount: 0 };
      x.count += v.count;
      x.amount += v.amount;
      allMethods.set(k, x);
    }
  const expected = sum("expected");
  const cashTotal = sum("cash");

  const types = new Map<string, SalesSummary["byType"][number]>();
  for (const t of tickets) {
    const x = types.get(t.type_name) ?? { name: t.type_name, price: t.price_paisa, printed: 0, sold: 0, comp: 0, returned: 0, inStock: 0, revenue: 0 };
    x.printed++;
    if (t.sale_status === "sold") {
      x.sold++;
      x.revenue += t.sale_price_paisa ?? t.price_paisa;
    } else if (t.sale_status === "comp") x.comp++;
    else if (t.sale_status === "returned") x.returned++;
    else if (t.status !== "cancelled") x.inStock++;
    types.set(t.type_name, x);
  }

  return {
    sellers: sellersOut,
    totals: {
      printed: tickets.length,
      given: sum("given"),
      inStock: sum("inStock"),
      sold: sum("sold"),
      soldAtGate: sum("soldAtGate"),
      comp: sum("comp"),
      returned: sum("returned"),
      voided: sum("voided"),
      used: sum("used"),
      noShow: sum("noShow"),
      expected,
      cash: cashTotal,
      difference: cashTotal - expected,
      outstanding: Math.max(0, expected - cashTotal),
      printingCost,
      byMethod: [...allMethods.entries()].map(([method, v]) => ({ method, ...v })).sort((a, z) => z.amount - a.amount),
    },
    byType: [...types.values()],
  };
}

/** "QWL-0012", "qwl-12", "12" → 12 */
export function parseSerial(v: string | null | undefined): number | null {
  const m = /(\d+)\s*$/.exec(String(v ?? "").trim());
  return m ? Number(m[1]) : null;
}
