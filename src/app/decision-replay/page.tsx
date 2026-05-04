export const dynamic = "force-dynamic";

import { DecisionReplayPage } from "@/components/trading/pages";

type SearchParams = Promise<{ trade?: string | string[] }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const trade = Array.isArray(params.trade) ? params.trade[0] : params.trade;
  return <DecisionReplayPage initialTradeId={trade} />;
}
