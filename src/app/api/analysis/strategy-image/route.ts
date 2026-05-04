import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { guardSensitiveMutation } from "@/server/security/sensitive-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RUNTIME_DIR = path.join(process.cwd(), ".agent-trader-runtime");
const IMAGE_DIR = path.join(RUNTIME_DIR, "strategy-images");
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type StrategyImageUpload = {
  name?: string;
  type?: string;
  dataUrl?: string;
};

function safeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "strategy-image";
}

function extensionFromType(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

export async function POST(request: Request) {
  const blocked = guardSensitiveMutation(request, "strategy-image-upload");
  if (blocked) return blocked;

  const body = (await request.json().catch(() => ({}))) as StrategyImageUpload;
  const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/);
  if (!match) return NextResponse.json({ ok: false, error: "invalid_image_data" }, { status: 400 });

  const mimeType = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    return NextResponse.json({ ok: false, error: "image_too_large", maxBytes: MAX_IMAGE_BYTES }, { status: 413 });
  }

  await mkdir(IMAGE_DIR, { recursive: true });
  const originalName = safeName(body.name || "strategy-image").replace(/\.(png|jpe?g|webp)$/i, "");
  const id = `IMG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const filename = `${id}-${originalName}.${extensionFromType(mimeType)}`;
  const filePath = path.join(IMAGE_DIR, filename);
  await writeFile(filePath, buffer);

  return NextResponse.json({
    ok: true,
    image: {
      id,
      name: body.name || originalName,
      mimeType,
      sizeBytes: buffer.length,
      path: filePath,
      uploadedAt: new Date().toISOString(),
    },
  });
}
