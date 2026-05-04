import { getOpenClawAgentContext } from "@/server/openclaw/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const context = await getOpenClawAgentContext();
  return Response.json(context);
}
