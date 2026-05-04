import { NextResponse } from "next/server";
import { testConfiguredLlmProvider } from "@/server/adapters/llm";
import { guardSensitiveMutation } from "@/server/security/sensitive-api";

export const dynamic = "force-dynamic";

type TestRequest = {
  providerId?: string;
};

export async function POST(request: Request) {
  const blocked = guardSensitiveMutation(request, "llm-provider-test");
  if (blocked) return blocked;

  const body = (await request.json().catch(() => ({}))) as TestRequest;

  if (!body.providerId) {
    return NextResponse.json({ ok: false, status: "error", message: "providerId requis." }, { status: 400 });
  }

  const result = await testConfiguredLlmProvider(body.providerId);
  return NextResponse.json({ providerId: body.providerId, ...result, testedAt: new Date().toISOString() });
}
