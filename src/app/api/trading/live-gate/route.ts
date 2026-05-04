import { NextResponse } from "next/server";
import { invalidateAppDataCache } from "@/server/app-data";
import { setLiveTradingEnv } from "@/server/config/local-env";
import { guardSensitiveMutation } from "@/server/security/sensitive-api";
import { getLiveTradingEligibility } from "@/server/trading/live-eligibility";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONFIRMATION = "ACTIVER LIVE LLM";

type LiveGateUpdate = {
  enabled?: boolean;
  confirmation?: string;
};

export async function GET() {
  const eligibility = await getLiveTradingEligibility();
  return NextResponse.json({ ok: true, eligibility });
}

export async function POST(request: Request) {
  const blocked = guardSensitiveMutation(request, "live-trading-gate");
  if (blocked) return blocked;

  const body = (await request.json().catch(() => ({}))) as LiveGateUpdate;
  const enabled = body.enabled === true;

  if (!enabled) {
    const config = await setLiveTradingEnv(false);
    invalidateAppDataCache();
    const eligibility = await getLiveTradingEligibility();
    return NextResponse.json({ ok: true, config, eligibility, status: "live_disabled" });
  }

  if (body.confirmation !== CONFIRMATION) {
    return NextResponse.json({
      ok: false,
      error: "confirmation_required",
      confirmation: CONFIRMATION,
      message: "Activation live LLM refusée: confirmation explicite manquante.",
    }, { status: 400 });
  }

  const eligibility = await getLiveTradingEligibility();
  if (!eligibility.eligible) {
    return NextResponse.json({
      ok: false,
      error: "live_gate_blocked",
      eligibility,
      message: "Activation live LLM refusée: les conditions de promotion ne sont pas remplies.",
    }, { status: 409 });
  }

  const config = await setLiveTradingEnv(true);
  invalidateAppDataCache();
  const nextEligibility = await getLiveTradingEligibility();
  return NextResponse.json({ ok: true, config, eligibility: nextEligibility, status: "live_armed_llm" });
}
