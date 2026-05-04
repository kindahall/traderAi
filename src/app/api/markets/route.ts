import { NextResponse } from "next/server";
import { fetchMarketAssets, fetchPriceSeries, getMarketProviderConfig } from "@/server/adapters/market-data";

export const dynamic = "force-dynamic";

function liveJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate");
  return response;
}

export async function GET() {
  const provider = getMarketProviderConfig();
  try {
    const [assets, priceSeries] = await Promise.all([fetchMarketAssets(), fetchPriceSeries()]);
    return liveJson({ source: provider.source, exchange: provider.label, marketType: provider.instrumentType, assets, priceSeries, updatedAt: new Date().toISOString() });
  } catch (error) {
    return liveJson(
      { source: provider.source, exchange: provider.label, marketType: provider.instrumentType, assets: [], priceSeries: [], error: error instanceof Error ? error.message : "Market data unavailable" },
      { status: 503 },
    );
  }
}
