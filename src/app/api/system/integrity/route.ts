import { NextResponse } from "next/server";
import { getSystemIntegrity } from "@/server/system/integrity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getSystemIntegrity());
}
