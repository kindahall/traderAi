import { NextResponse } from "next/server";
import { readKillSwitchState } from "@/server/safety/kill-switch-store";
import { guardSensitiveMutation } from "@/server/security/sensitive-api";
import { getLiveTradingEligibility } from "@/server/trading/live-eligibility";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const blocked = guardSensitiveMutation(request, "live-order");
  if (blocked) return blocked;

  const killSwitch = await readKillSwitchState();
  if (killSwitch.active) {
    return NextResponse.json(
      {
        status: "kill_switch_active",
        message: "Emergency stop is active. Order execution is blocked before any live trading check.",
        reason: killSwitch.reason,
      },
      { status: 423 },
    );
  }

  if (process.env.LIVE_TRADING_ENABLED !== "true") {
    return NextResponse.json(
      {
        status: "locked",
        message: "Live trading is disabled. This endpoint refuses real orders until the live LLM gate is explicitly armed.",
      },
      { status: 423 },
    );
  }

  const eligibility = await getLiveTradingEligibility();
  if (!eligibility.eligible) {
    return NextResponse.json(
      {
        status: "live_gate_blocked",
        message: "Live trading is enabled in config but suspended because the 80% promotion gate is not currently satisfied.",
        eligibility,
      },
      { status: 423 },
    );
  }

  return NextResponse.json(
    {
      status: "adapter_not_configured",
      message: "Live LLM gate is armed, but no exchange order adapter/signer is configured in this codebase yet. The order is refused before transmission.",
      eligibility,
    },
    { status: 501 },
  );
}
