import { NextResponse } from "next/server";
import { getConfiguredLlmProviders, getConfiguredLlmRoles } from "@/server/adapters/llm";

export const dynamic = "force-dynamic";

export async function GET() {
  const providers = getConfiguredLlmProviders();
  const roles = getConfiguredLlmRoles();
  return NextResponse.json({ providers, roles, updatedAt: new Date().toISOString() });
}
