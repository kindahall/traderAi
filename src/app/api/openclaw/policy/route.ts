import { readOpenClawRolePolicy, writeOpenClawRolePolicy } from "@/server/openclaw/policy-store";
import { guardSensitiveMutation } from "@/server/security/sensitive-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rolePolicy = await readOpenClawRolePolicy();
  return Response.json({ rolePolicy });
}

export async function POST(request: Request) {
  const blocked = guardSensitiveMutation(request, "openclaw-policy");
  if (blocked) return blocked;

  const body = await request.json().catch(() => ({}));
  const stored = await writeOpenClawRolePolicy(body.rolePolicy);

  return Response.json({
    rolePolicy: stored.rolePolicy,
    updatedAt: stored.updatedAt,
  });
}
