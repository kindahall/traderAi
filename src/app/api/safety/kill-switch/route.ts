import { NextResponse } from "next/server";
import { invalidateAppDataCache } from "@/server/app-data";
import { readKillSwitchState, writeKillSwitchState } from "@/server/safety/kill-switch-store";
import { guardSensitiveMutation } from "@/server/security/sensitive-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type KillSwitchRequest = {
  active?: boolean;
  reason?: string;
};

export async function GET() {
  return NextResponse.json(await readKillSwitchState());
}

export async function POST(request: Request) {
  const blocked = guardSensitiveMutation(request, "kill-switch");
  if (blocked) return blocked;

  const body = (await request.json().catch(() => ({}))) as KillSwitchRequest;
  if (typeof body.active !== "boolean") {
    return NextResponse.json({ ok: false, message: "active must be boolean" }, { status: 400 });
  }

  const state = await writeKillSwitchState({ active: body.active, reason: body.reason });
  invalidateAppDataCache();
  return NextResponse.json({ ok: true, ...state });
}
