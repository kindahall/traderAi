import { NextResponse } from "next/server";
import { getPaperStateFilePath, readPaperTradingState } from "@/server/paper-trading/event-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const state = await readPaperTradingState();
  return NextResponse.json({
    ...state,
    source: "local-paper-runtime",
    file: getPaperStateFilePath(),
  });
}
