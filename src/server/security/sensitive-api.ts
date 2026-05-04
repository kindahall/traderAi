import { NextResponse } from "next/server";

const TOKEN_ENV_KEYS = ["TRADERAI_API_TOKEN", "ADMIN_API_TOKEN"] as const;

function configuredToken() {
  for (const key of TOKEN_ENV_KEYS) {
    const token = process.env[key]?.trim();
    if (token) return token;
  }

  return "";
}

function providedToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || request.headers.get("x-traderai-admin-token")?.trim() || "";
}

export function isLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function isSameOrigin(request: Request, requestUrl: URL) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).origin === requestUrl.origin;
  } catch {
    return false;
  }
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

export function guardSensitiveMutation(request: Request, action: string) {
  const requestUrl = new URL(request.url);
  const expectedToken = configuredToken();
  const token = providedToken(request);

  if (expectedToken && token === expectedToken) return null;

  const localRequest = isLocalHostname(requestUrl.hostname);
  const sameOrigin = isSameOrigin(request, requestUrl);

  if (!isProductionRuntime() && localRequest && sameOrigin) return null;

  return NextResponse.json(
    {
      ok: false,
      error: "sensitive_api_forbidden",
      action,
      message: expectedToken
        ? "Cette action sensible requiert un token administrateur valide."
        : "Cette action sensible est bloquée hors localhost tant que TRADERAI_API_TOKEN n'est pas configuré.",
    },
    { status: expectedToken ? 401 : 403 },
  );
}

export function trustedRequestOrigin(request: Request) {
  const url = new URL(request.url);
  return url.origin;
}

export function isAllowedOpenClawGatewayOverride(gatewayUrl: string) {
  if (process.env.OPENCLAW_ALLOW_REMOTE_OVERRIDES === "true") return true;

  try {
    const url = new URL(gatewayUrl);
    return isLocalHostname(url.hostname);
  } catch {
    return false;
  }
}
