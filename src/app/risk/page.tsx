export const dynamic = "force-dynamic";

import { RiskPage } from "@/components/trading/pages";

type SearchParams = Promise<{ tab?: string | string[] }>;

function tabParam(value: string | string[] | undefined) {
  const tab = Array.isArray(value) ? value[0] : value;
  if (tab === "alerts" || tab === "rules" || tab === "validation" || tab === "stress" || tab === "kill") return tab;
  return "limits";
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return <RiskPage defaultTab={tabParam(params.tab)} />;
}
