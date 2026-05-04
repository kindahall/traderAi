import { NextResponse } from "next/server";
import { fetchCandles, getMarketProviderConfig } from "@/server/adapters/market-data";

export const dynamic = "force-dynamic";

const ALLOWED_INTERVALS = new Set(["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d"]);

function liveJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate");
  return response;
}

function normalizeSymbol(value: string | null) {
  return (value || process.env.PRIMARY_MARKET_SYMBOL || "BTC-USD").toUpperCase().replace(/[^A-Z0-9/-]/g, "");
}

function normalizeInterval(value: string | null) {
  const interval = value || "1m";
  return ALLOWED_INTERVALS.has(interval) ? interval : "1m";
}

function normalizeLimit(value: string | null) {
  const parsed = Number(value || 180);
  if (!Number.isFinite(parsed)) return 180;
  return Math.min(1000, Math.max(20, Math.round(parsed)));
}

export async function GET(request: Request) {
  const provider = getMarketProviderConfig();
  const { searchParams } = new URL(request.url);
  const symbol = normalizeSymbol(searchParams.get("symbol"));
  const interval = normalizeInterval(searchParams.get("interval"));
  const limit = normalizeLimit(searchParams.get("limit"));

  try {
    const candles = await fetchCandles(symbol, interval, limit);
    return liveJson({ source: provider.source, exchange: provider.label, marketType: provider.instrumentType, symbol, interval, candles, updatedAt: new Date().toISOString() });
  } catch (error) {
    return liveJson(
      { source: provider.source, exchange: provider.label, marketType: provider.instrumentType, symbol, interval, candles: [], error: error instanceof Error ? error.message : "Candles unavailable" },
      { status: 503 },
    );
  }
}
