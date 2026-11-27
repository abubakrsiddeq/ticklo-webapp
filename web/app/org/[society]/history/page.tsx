import type { Metadata } from "next";
import { requireOrgStaff } from "@/lib/auth";
import { OrgDecisionHistory } from "../../decision-history";

export const metadata: Metadata = { title: "History" };

// D-077: the society's record of approvals and rejections
export default async function OrgHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ society: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { society } = await params;
  const { org } = await requireOrgStaff(society, `/org/${society}/history`);
  return <OrgDecisionHistory orgId={org.id} orgSlug={org.slug} basePath={`/org/${org.slug}/history`} searchParams={await searchParams} />;
}
