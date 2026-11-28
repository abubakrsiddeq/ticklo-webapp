import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Event day", robots: { index: false } };

// D-086: choosing an event and a job happens on the Event day page now.
export default async function ScanHomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  if (sp.list) q.set("list", "1");
  if (sp.joined) q.set("joined", "1");
  redirect(q.size ? `/event-day?${q}` : "/event-day");
}
