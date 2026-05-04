import { NextResponse } from "next/server";
import { invalidateAppDataCache } from "@/server/app-data";
import { connectExchangeEnv, disconnectExchangeEnv, readExchangeEnvConfig, type ExchangeEnvUpdate } from "@/server/config/local-env";
import { guardSensitiveMutation } from "@/server/security/sensitive-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const providerIds = new Set(["dydx", "binance", "kraken", "coinbase"]);

export async function GET() {
  return NextResponse.json({ ok: true, config: readExchangeEnvConfig() });
}

export async function POST(request: Request) {
  const blocked = guardSensitiveMutation(request, "exchange-settings-connect");
  if (blocked) return blocked;

  const body = (await request.json().catch(() => ({}))) as ExchangeEnvUpdate;
  if (body.providerId && !providerIds.has(body.providerId)) {
    return NextResponse.json({ ok: false, error: "invalid_exchange_provider" }, { status: 400 });
  }

  const config = await connectExchangeEnv(body);
  invalidateAppDataCache();
  return NextResponse.json({ ok: true, config });
}

export async function DELETE(request: Request) {
  const blocked = guardSensitiveMutation(request, "exchange-settings-disconnect");
  if (blocked) return blocked;

  const config = await disconnectExchangeEnv();
  invalidateAppDataCache();
  return NextResponse.json({ ok: true, config });
}
