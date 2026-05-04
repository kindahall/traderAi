import { NextResponse } from "next/server";
import { readPaperAgentRoutingConfig, writePaperAgentRoutingConfig } from "@/server/paper-trading/agent-routing-store";
import type { PaperAgentRuntimeMode, PaperAgentRuntimeRole } from "@/server/paper-trading/agent-routing-store";
import { guardSensitiveMutation } from "@/server/security/sensitive-api";

export const dynamic = "force-dynamic";

type RoutingPatch = {
  roles?: Partial<Record<PaperAgentRuntimeRole, PaperAgentRuntimeMode>>;
};

export async function GET() {
  const config = await readPaperAgentRoutingConfig();
  return NextResponse.json({ ok: true, config });
}

export async function POST(request: Request) {
  const guard = guardSensitiveMutation(request, "paper_agent_routing_update");
  if (guard) return guard;

  let body: RoutingPatch;
  try {
    body = await request.json() as RoutingPatch;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const config = await writePaperAgentRoutingConfig(body.roles ?? {});
  return NextResponse.json({ ok: true, config });
}
