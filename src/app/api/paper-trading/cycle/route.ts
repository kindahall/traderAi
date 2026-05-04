import { NextResponse } from "next/server";
import { invalidateAppDataCache } from "@/server/app-data";
import { runPaperTradingCycle } from "@/server/paper-trading/engine";
import { guardSensitiveMutation } from "@/server/security/sensitive-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CycleRequest = {
  targetAgentId?: string;
  targetPair?: string;
};

export async function POST(request: Request) {
  const blocked = guardSensitiveMutation(request, "paper-runtime-cycle");
  if (blocked) return blocked;

  const body = (await request.json().catch(() => ({}))) as CycleRequest;
  const result = await runPaperTradingCycle({
    targetAgentId: body.targetAgentId,
    targetPair: body.targetPair,
  });
  invalidateAppDataCache();

  return NextResponse.json({
    ok: true,
    source: "local-paper-runtime",
    cycleId: result.cycleId,
    eventsCreated: result.events.length,
    state: result.state,
  });
}
