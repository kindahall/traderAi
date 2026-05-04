import { getOpenClawRuntimeSnapshot } from "@/server/openclaw/client";
import { guardSensitiveMutation, isAllowedOpenClawGatewayOverride } from "@/server/security/sensitive-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getOpenClawRuntimeSnapshot();
  return Response.json({
    status: snapshot.status,
    agents: snapshot.agents,
    logs: snapshot.logs,
  });
}

export async function POST(request: Request) {
  const blocked = guardSensitiveMutation(request, "openclaw-agents");
  if (blocked) return blocked;

  const body = await request.json().catch(() => ({}));
  if (typeof body.gatewayUrl === "string" && !isAllowedOpenClawGatewayOverride(body.gatewayUrl)) {
    return Response.json({ ok: false, error: "openclaw_gateway_not_allowed", message: "Les overrides Gateway distants sont bloqués. Configurez OPENCLAW_GATEWAY_URL côté serveur ou OPENCLAW_ALLOW_REMOTE_OVERRIDES=true." }, { status: 400 });
  }

  const snapshot = await getOpenClawRuntimeSnapshot(body);

  return Response.json({
    status: snapshot.status,
    agents: snapshot.agents,
    logs: snapshot.logs,
  });
}
