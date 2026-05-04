import { NextResponse } from "next/server";
import { providerIdFromSelection, readLocalAnalysisProviderConfig, writeLocalAnalysisProviderConfig } from "@/server/analysis/local-provider";
import { guardSensitiveMutation } from "@/server/security/sensitive-api";

export const dynamic = "force-dynamic";

type ProviderPatch = {
  selection?: string;
  providerId?: string | null;
};

export async function GET() {
  const config = await readLocalAnalysisProviderConfig();
  return NextResponse.json({ ok: true, config });
}

export async function POST(request: Request) {
  const guard = guardSensitiveMutation(request, "local_analysis_provider_update");
  if (guard) return guard;

  let body: ProviderPatch;
  try {
    body = await request.json() as ProviderPatch;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const selection = providerIdFromSelection(body.selection ?? body.providerId ?? "codex");
  const config = await writeLocalAnalysisProviderConfig(selection);
  return NextResponse.json({ ok: true, config });
}
