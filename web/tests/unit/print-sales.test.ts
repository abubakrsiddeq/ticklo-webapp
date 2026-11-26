import { describe, expect, it } from "vitest";
import { compressSerials, computeSalesSummary, parseSerial, type SaleTicket } from "@/lib/print/sales";
import { staticTicketToken, verifyStaticTicketToken } from "@/lib/qr-token";

const t = (n: number, over: Partial<SaleTicket> = {}): SaleTicket => ({
  serial_no: n,
  prefix: "QWL",
  status: "valid",
  sale_status: "in_stock",
  sale_source: null,
  sale_method: null,
  sale_price_paisa: null,
  sold_at: null,
  seller_id: "ali",
  type_name: "General",
  price_paisa: 200000,
  ...over,
});

describe("printed sales hisaab (D-041)", () => {
  it("50 printed, 40 sold (2 found at the gate), 38 used, 10 returned, Rs 78,000 received", () => {
    const tickets: SaleTicket[] = [];
    for (let n = 1; n <= 50; n++) {
      if (n <= 38) tickets.push(t(n, { sale_status: "sold", sale_source: "marked", sale_method: n <= 35 ? "cash" : "jazzcash", sale_price_paisa: 200000, status: n <= 36 ? "checked_in" : "valid", sold_at: "2026-12-12T15:00:00Z" }));
      else if (n <= 40) tickets.push(t(n, { sale_status: "sold", sale_source: "scan", sale_price_paisa: 200000, status: "checked_in", sold_at: "2026-12-12T16:00:00Z" }));
      else tickets.push(t(n, { sale_status: "returned", status: "cancelled" }));
    }
    const s = computeSalesSummary(tickets, [{ id: "ali", name: "Ali", phone: null, user_id: null, settled_at: null }], [
      { id: "c1", seller_id: "ali", amount_paisa: 7800000, method: "cash", note: null, created_at: "" },
    ], 300000);
    const ali = s.sellers.find((b) => b.id === "ali")!;
    expect(ali).toMatchObject({ given: 50, sold: 40, soldAtGate: 2, returned: 10, used: 38, noShow: 2, inStock: 0, expected: 8000000, cash: 7800000, difference: -200000 });
    expect(ali.ranges).toBe("QWL-0001–0040");
    expect(ali.byMethod[0]).toEqual({ method: "cash", count: 35, amount: 7000000 });
    expect(s.totals).toMatchObject({ printed: 50, sold: 40, expected: 8000000, cash: 7800000, outstanding: 200000, printingCost: 300000 });
    expect(s.byType[0]).toMatchObject({ printed: 50, sold: 40, returned: 10, revenue: 8000000 });
    expect(s.sellers[0].id).toBe("ali"); // no organizer bucket when it is empty
  });

  it("free passes, organizer stock, voids and changes after settlement", () => {
    const s = computeSalesSummary(
      [
        t(1, { seller_id: null, sale_status: "comp", sale_price_paisa: 0, status: "checked_in" }),
        t(2, { seller_id: null }),
        t(3, { seller_id: null, status: "cancelled" }),
        t(4, { sale_status: "sold", sale_source: "scan", sale_price_paisa: 200000, status: "checked_in", sold_at: "2026-12-13T00:00:00Z" }),
      ],
      [{ id: "ali", name: "Ali", phone: null, user_id: null, settled_at: "2026-12-12T23:00:00Z" }],
      [],
    );
    const org = s.sellers[0];
    expect(org).toMatchObject({ id: null, comp: 1, inStock: 1, voided: 1, expected: 0, ranges: "QWL-0001–0002" });
    expect(s.sellers[1].changedAfterSettle).toBe(true);
  });

  it("compresses serial ranges and parses serial input", () => {
    expect(compressSerials([5, 1, 2, 3, 7].map((n) => ({ prefix: "A", serial_no: n })))).toBe("A-0001–0003, A-0005, A-0007");
    expect(parseSerial("QWL-0012")).toBe(12);
    expect(parseSerial(" 7 ")).toBe(7);
    expect(parseSerial("abc")).toBeNull();
  });

  it("verifies scanned QR tokens", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    const secret = "s".repeat(32);
    const token = staticTicketToken(id, secret);
    expect(verifyStaticTicketToken(token, secret)).toBe(id);
    expect(verifyStaticTicketToken(token, "x".repeat(32))).toBeNull();
    expect(verifyStaticTicketToken(token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"), secret)).toBeNull();
    expect(verifyStaticTicketToken("hello", secret)).toBeNull();
  });
});
