import { NextResponse } from "next/server";
import { getAppData, invalidateAppDataCache } from "@/server/app-data";
import { guardSensitiveMutation } from "@/server/security/sensitive-api";
import {
  approveStrategyImprovementNote,
  dismissStrategyImprovementNote,
  runDailyStrategyImprovementReview,
} from "@/server/strategies/strategy-improvement-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ImprovementRequest = {
  action?: "review" | "approve" | "dismiss";
  noteId?: string;
  force?: boolean;
};

export async function GET() {
  const snapshot = await getAppData({ bypassCache: true });
  const state = await runDailyStrategyImprovementReview(snapshot.strategies);
  return NextResponse.json({ ok: true, state });
}

export async function POST(request: Request) {
  const blocked = guardSensitiveMutation(request, "strategy-improvement-review");
  if (blocked) return blocked;

  const body = (await request.json().catch(() => ({}))) as ImprovementRequest;
  const snapshot = await getAppData({ bypassCache: true });

  if (body.action === "approve") {
    if (typeof body.noteId !== "string" || !body.noteId.trim()) {
      return NextResponse.json({ ok: false, error: "invalid_improvement_note" }, { status: 400 });
    }
    const state = await approveStrategyImprovementNote(body.noteId, snapshot.strategies);
    invalidateAppDataCache();
    return NextResponse.json({ ok: true, state });
  }

  if (body.action === "dismiss") {
    if (typeof body.noteId !== "string" || !body.noteId.trim()) {
      return NextResponse.json({ ok: false, error: "invalid_improvement_note" }, { status: 400 });
    }
    const state = await dismissStrategyImprovementNote(body.noteId, snapshot.strategies);
    invalidateAppDataCache();
    return NextResponse.json({ ok: true, state });
  }

  const state = await runDailyStrategyImprovementReview(snapshot.strategies, { force: body.force ?? true, useCodex: true });
  invalidateAppDataCache();
  return NextResponse.json({ ok: true, state });
}
