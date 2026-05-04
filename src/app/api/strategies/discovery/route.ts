import { NextResponse } from "next/server";
import { invalidateAppDataCache } from "@/server/app-data";
import { guardSensitiveMutation } from "@/server/security/sensitive-api";
import {
  addStrategyDiscoveryCandidate,
  readStrategyDiscoveryState,
  recordStrategyDiscoveryScan,
  runControlledStrategyDiscoveryScan,
  updateStrategyDiscoveryCandidateStage,
  type StrategyDiscoveryStage,
} from "@/server/strategies/discovery-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DiscoveryRequest = {
  action?: "add" | "import-pine" | "stage" | "scan" | "scan-public";
  id?: string;
  stage?: StrategyDiscoveryStage;
  title?: string;
  sourceUrl?: string;
  visibility?: "open-source" | "public-idea" | "unknown" | "protected" | "invite-only";
  timeframe?: string;
  assets?: string[];
  tags?: string[];
  notes?: string;
  pineCode?: string;
};

function isStage(value: unknown): value is StrategyDiscoveryStage {
  return value === "source_watch" || value === "codex_review" || value === "backtest_queue" || value === "paper_incubation" || value === "live_candidate" || value === "blocked";
}

export async function GET() {
  return NextResponse.json({ ok: true, state: await readStrategyDiscoveryState() });
}

export async function POST(request: Request) {
  const blocked = guardSensitiveMutation(request, "strategy-discovery-update");
  if (blocked) return blocked;

  const body = (await request.json().catch(() => ({}))) as DiscoveryRequest;

  if (body.action === "scan") {
    const state = await recordStrategyDiscoveryScan();
    invalidateAppDataCache();
    return NextResponse.json({ ok: true, state });
  }

  if (body.action === "scan-public") {
    const result = await runControlledStrategyDiscoveryScan();
    invalidateAppDataCache();
    return NextResponse.json({ ok: true, ...result });
  }

  if (body.action === "stage") {
    if (typeof body.id !== "string" || !isStage(body.stage)) {
      return NextResponse.json({ ok: false, error: "invalid_stage_update" }, { status: 400 });
    }

    const state = await updateStrategyDiscoveryCandidateStage(body.id, body.stage);
    invalidateAppDataCache();
    return NextResponse.json({ ok: true, state });
  }

  const state = await addStrategyDiscoveryCandidate({
    title: body.title,
    sourceUrl: body.sourceUrl,
    visibility: body.visibility,
    timeframe: body.timeframe,
    assets: body.assets,
    tags: body.tags,
    notes: body.notes,
    pineCode: body.pineCode,
  });
  invalidateAppDataCache();

  return NextResponse.json({ ok: true, state });
}
