import { NextResponse } from "next/server";
import { invalidateAppDataCache } from "@/server/app-data";
import { getPaperRuntimeProcessStatus, startPaperRuntimeDaemon, stopPaperRuntimeDaemon } from "@/server/paper-trading/runtime-process";
import { guardSensitiveMutation, trustedRequestOrigin } from "@/server/security/sensitive-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RuntimeControlRequest = {
  action?: "start" | "stop" | "restart";
};

const runtimeActions = new Set(["start", "stop", "restart"]);

export async function GET() {
  const status = await getPaperRuntimeProcessStatus();
  return NextResponse.json({ ok: true, status });
}

export async function POST(request: Request) {
  const blocked = guardSensitiveMutation(request, "paper-runtime-control");
  if (blocked) return blocked;

  const body = (await request.json().catch(() => ({}))) as RuntimeControlRequest;
  const action = body.action ?? "start";
  const baseUrl = trustedRequestOrigin(request);

  if (!runtimeActions.has(action)) {
    return NextResponse.json({ ok: false, error: "invalid_runtime_action" }, { status: 400 });
  }

  if (action === "stop") {
    const status = await stopPaperRuntimeDaemon();
    invalidateAppDataCache();
    return NextResponse.json({ ok: true, action, status });
  }

  if (action === "restart") {
    await stopPaperRuntimeDaemon();
    const status = await startPaperRuntimeDaemon(baseUrl);
    invalidateAppDataCache();
    return NextResponse.json({ ok: true, action, status });
  }

  const status = await startPaperRuntimeDaemon(baseUrl);
  invalidateAppDataCache();
  return NextResponse.json({ ok: true, action: "start", status });
}
