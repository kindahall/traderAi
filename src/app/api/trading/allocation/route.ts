import { NextResponse } from "next/server";
import { invalidateAppDataCache } from "@/server/app-data";
import { readPaperTradingState, writePaperTradingState } from "@/server/paper-trading/event-store";
import { guardSensitiveMutation } from "@/server/security/sensitive-api";
import { readTradingAllocationConfig, writeTradingAllocationConfig, type TradingAllocationPatch } from "@/server/trading/allocation-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AllocationRequest = TradingAllocationPatch;

function hasPaperCapitalPatch(body: AllocationRequest) {
  return typeof body.paper?.capitalUsd === "number" && Number.isFinite(body.paper.capitalUsd);
}

async function allocationPayload() {
  const [config, paperState] = await Promise.all([readTradingAllocationConfig(), readPaperTradingState()]);
  return {
    ok: true,
    config,
    paperState: {
      capitalUsd: paperState.capitalUsd,
      equityUsd: paperState.metrics.equityUsd,
      openPositions: paperState.metrics.openPositions,
      closedPositions: paperState.metrics.closedPositions,
    },
  };
}

export async function GET() {
  return NextResponse.json(await allocationPayload());
}

export async function POST(request: Request) {
  const guard = guardSensitiveMutation(request, "trading-allocation-update");
  if (guard) return guard;

  let body: AllocationRequest;
  try {
    body = await request.json() as AllocationRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const config = await writeTradingAllocationConfig({ paper: body.paper, live: body.live });
  let paperState = await readPaperTradingState();

  if (hasPaperCapitalPatch(body)) {
    paperState = await writePaperTradingState({
      ...paperState,
      capitalUsd: config.paper.capitalUsd,
    });
  }

  invalidateAppDataCache();
  return NextResponse.json({
    ok: true,
    config,
    paperState: {
      capitalUsd: paperState.capitalUsd,
      equityUsd: paperState.metrics.equityUsd,
      openPositions: paperState.metrics.openPositions,
      closedPositions: paperState.metrics.closedPositions,
    },
  });
}
