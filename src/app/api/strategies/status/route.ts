import { NextResponse } from "next/server";
import { invalidateAppDataCache } from "@/server/app-data";
import { guardSensitiveMutation } from "@/server/security/sensitive-api";
import { updateStrategyLibraryStatus, type StrategyLibraryStatus } from "@/server/strategies/strategy-library-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type StrategyStatusRequest = {
  id?: string;
  status?: StrategyLibraryStatus;
};

function isStrategyStatus(value: unknown): value is StrategyLibraryStatus {
  return value === "active" || value === "inactive" || value === "draft";
}

export async function POST(request: Request) {
  const blocked = guardSensitiveMutation(request, "strategy-status-update");
  if (blocked) return blocked;

  const body = (await request.json().catch(() => ({}))) as StrategyStatusRequest;
  if (typeof body.id !== "string" || !body.id.trim() || !isStrategyStatus(body.status)) {
    return NextResponse.json({ ok: false, error: "invalid_strategy_status" }, { status: 400 });
  }

  const state = await updateStrategyLibraryStatus(body.id, body.status);
  invalidateAppDataCache();

  return NextResponse.json({ ok: true, state });
}
