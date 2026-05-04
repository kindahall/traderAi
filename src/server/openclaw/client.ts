import type {
  OpenClawAgentSummary,
  OpenClawAuthMode,
  OpenClawConnectorConfig,
  OpenClawRuntimeSnapshot,
  OpenClawRuntimeStatus,
} from "@/types/openclaw";
import { getOpenClawContextSources } from "@/server/openclaw/context";
import { readOpenClawRolePolicy } from "@/server/openclaw/policy-store";

type OpenClawConfigOverrides = {
  gatewayUrl?: string;
  authMode?: string;
  token?: string;
  password?: string;
  defaultAgentId?: string;
};

type InternalOpenClawConfig = OpenClawConnectorConfig & {
  token?: string;
  password?: string;
  configured: boolean;
};

type GatewayFrame =
  | { type: "event"; event: string; payload?: unknown; seq?: number; stateVersion?: number }
  | { type: "res"; id: string; ok: boolean; payload?: unknown; error?: unknown };

type GatewaySession = {
  hello: unknown;
  protocol?: number;
  latencyMs: number;
  call: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  close: () => void;
};

const DEFAULT_GATEWAY_URL = "ws://127.0.0.1:18789";
const DEFAULT_TIMEOUT_MS = 5000;

export function getOpenClawConnectorConfig(overrides: OpenClawConfigOverrides = {}): OpenClawConnectorConfig {
  const config = readInternalConfig(overrides);

  return {
    gatewayUrl: config.gatewayUrl,
    authMode: config.authMode,
    tokenConfigured: config.tokenConfigured,
    passwordConfigured: config.passwordConfigured,
    defaultAgentId: config.defaultAgentId,
    requestTimeoutMs: config.requestTimeoutMs,
  };
}

export async function getOpenClawRuntimeSnapshot(overrides: OpenClawConfigOverrides = {}): Promise<OpenClawRuntimeSnapshot> {
  const config = readInternalConfig(overrides);
  const baseStatus = buildBaseStatus(config);
  const rolePolicy = await readOpenClawRolePolicy();
  const dataSources = getOpenClawContextSources();
  const logs: OpenClawRuntimeSnapshot["logs"] = [];

  if (!config.configured) {
    logs.push({
      time: new Date().toISOString(),
      level: "warning",
      message: "Configuration OpenClaw incomplète. Renseignez le Gateway et le mode d'authentification.",
    });

    return {
      config: publicConfig(config),
      status: baseStatus,
      agents: [],
      rolePolicy,
      dataSources,
      logs,
    };
  }

  try {
    const snapshot = await probeGateway(config);

    return {
      config: publicConfig(config),
      status: snapshot.status,
      agents: snapshot.agents,
      rolePolicy,
      dataSources,
      logs: [
        {
          time: new Date().toISOString(),
          level: "success",
          message: `Gateway OpenClaw joignable en ${snapshot.status.latencyMs ?? 0} ms.`,
        },
      ],
    };
  } catch (error) {
    const details = error instanceof Error ? error.message : "Erreur inconnue";

    return {
      config: publicConfig(config),
      status: {
        ...baseStatus,
        state: "unavailable",
        message: "Gateway OpenClaw indisponible",
        details,
      },
      agents: [],
      rolePolicy,
      dataSources,
      logs: [
        {
          time: new Date().toISOString(),
          level: "danger",
          message: details,
        },
      ],
    };
  }
}

function readInternalConfig(overrides: OpenClawConfigOverrides): InternalOpenClawConfig {
  const authMode = normalizeAuthMode(overrides.authMode || process.env.OPENCLAW_AUTH_MODE || "token");
  const token = overrides.token?.trim() || process.env.OPENCLAW_GATEWAY_TOKEN?.trim() || "";
  const password = overrides.password?.trim() || process.env.OPENCLAW_GATEWAY_PASSWORD?.trim() || "";
  const gatewayUrl = normalizeGatewayUrl(overrides.gatewayUrl?.trim() || process.env.OPENCLAW_GATEWAY_URL?.trim() || DEFAULT_GATEWAY_URL);
  const defaultAgentId = overrides.defaultAgentId?.trim() || process.env.OPENCLAW_DEFAULT_AGENT_ID?.trim() || "alpha-01";
  const requestTimeoutMs = parsePositiveNumber(process.env.OPENCLAW_REQUEST_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const tokenConfigured = Boolean(token);
  const passwordConfigured = Boolean(password);
  const authReady = authMode === "none" || (authMode === "token" && tokenConfigured) || (authMode === "password" && passwordConfigured);

  return {
    gatewayUrl,
    authMode,
    token,
    password,
    tokenConfigured,
    passwordConfigured,
    defaultAgentId,
    requestTimeoutMs,
    configured: Boolean(gatewayUrl && authReady),
  };
}

function publicConfig(config: InternalOpenClawConfig): OpenClawConnectorConfig {
  return {
    gatewayUrl: config.gatewayUrl,
    authMode: config.authMode,
    tokenConfigured: config.tokenConfigured,
    passwordConfigured: config.passwordConfigured,
    defaultAgentId: config.defaultAgentId,
    requestTimeoutMs: config.requestTimeoutMs,
  };
}

function buildBaseStatus(config: InternalOpenClawConfig): OpenClawRuntimeStatus {
  return {
    state: config.configured ? "configured" : "missing_config",
    configured: config.configured,
    gatewayUrl: config.gatewayUrl,
    authMode: config.authMode,
    defaultAgentId: config.defaultAgentId,
    message: config.configured ? "Configuration prête à tester" : "Configuration OpenClaw incomplète",
  };
}

async function probeGateway(config: InternalOpenClawConfig): Promise<{ status: OpenClawRuntimeStatus; agents: OpenClawAgentSummary[] }> {
  try {
    return await probeGatewayHttp(config);
  } catch {
    return await probeGatewayWebSocket(config);
  }
}

async function probeGatewayHttp(config: InternalOpenClawConfig): Promise<{ status: OpenClawRuntimeStatus; agents: OpenClawAgentSummary[] }> {
  const startedAt = Date.now();
  const statusPayload = await fetchGatewayJson(config, "/status");
  let agentsPayload: unknown = [];

  try {
    agentsPayload = await fetchGatewayJson(config, "/agents");
  } catch {
    agentsPayload = [];
  }

  const latencyMs = Date.now() - startedAt;
  const status = statusFromPayload(statusPayload, config, latencyMs, "HTTP Gateway probe connecté");

  return {
    status,
    agents: normalizeAgents(agentsPayload),
  };
}

async function probeGatewayWebSocket(config: InternalOpenClawConfig): Promise<{ status: OpenClawRuntimeStatus; agents: OpenClawAgentSummary[] }> {
  const session = await openGatewaySession(config);

  try {
    const [health, statusPayload, heartbeatPayload, agentsPayload] = await Promise.allSettled([
      session.call("health"),
      session.call("status"),
      session.call("last-heartbeat"),
      session.call("agents.list"),
    ]);

    const statusSource = statusPayload.status === "fulfilled" ? statusPayload.value : health.status === "fulfilled" ? health.value : session.hello;
    const status = statusFromPayload(statusSource, config, session.latencyMs, "WebSocket Gateway RPC connecté");
    const heartbeat = heartbeatPayload.status === "fulfilled" ? extractHeartbeat(heartbeatPayload.value) : undefined;

    return {
      status: {
        ...status,
        protocol: session.protocol ?? status.protocol,
        heartbeat,
      },
      agents: agentsPayload.status === "fulfilled" ? normalizeAgents(agentsPayload.value) : [],
    };
  } finally {
    session.close();
  }
}

function openGatewaySession(config: InternalOpenClawConfig): Promise<GatewaySession> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const ws = new WebSocket(config.gatewayUrl);
    const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
    let connectSent = false;
    let challengeSeen = false;
    let settled = false;
    let protocol: number | undefined;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        ws.close();
      } catch {
        // The socket may already be closed by the runtime.
      }
      reject(error);
    };

    const connectTimer = setTimeout(() => fail(new Error("Timeout pendant la connexion WebSocket OpenClaw.")), config.requestTimeoutMs);

    const cleanup = () => {
      clearTimeout(connectTimer);
      pending.forEach((entry) => clearTimeout(entry.timer));
      pending.clear();
    };

    const sendJson = (payload: unknown) => {
      ws.send(JSON.stringify(payload));
    };

    const sendConnect = (nonce?: string) => {
      if (connectSent) return;
      connectSent = true;
      const id = createRequestId("connect");
      const auth = buildAuthParams(config);
      sendJson({
        type: "req",
        id,
        method: "connect",
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: "agent-trader-ai",
            version: "0.1.0",
            platform: "nextjs",
            mode: "operator",
          },
          role: "operator",
          scopes: ["operator.read"],
          caps: [],
          commands: [],
          permissions: {},
          auth,
          locale: "fr-FR",
          userAgent: "agent-trader-ai/openclaw-connector",
          device: {
            id: "agent-trader-ai-server",
            publicKey: "agent-trader-ai-server",
            signature: "agent-trader-ai-server-probe",
            signedAt: Date.now(),
            nonce,
          },
        },
      });
    };

    ws.addEventListener("open", () => {
      setTimeout(() => {
        if (!challengeSeen) sendConnect();
      }, 1200);
    });

    ws.addEventListener("error", () => {
      fail(new Error("Impossible d'ouvrir le WebSocket OpenClaw."));
    });

    ws.addEventListener("close", () => {
      if (!settled) fail(new Error("WebSocket OpenClaw fermé avant la fin du handshake."));
    });

    ws.addEventListener("message", (event) => {
      const frame = parseGatewayFrame(event.data);
      if (!frame) return;

      if (frame.type === "event" && frame.event === "connect.challenge") {
        challengeSeen = true;
        const nonce = getObjectValue(frame.payload, "nonce");
        sendConnect(typeof nonce === "string" ? nonce : undefined);
        return;
      }

      if (frame.type !== "res") return;

      if (frame.id.startsWith("connect-")) {
        if (!frame.ok) {
          fail(new Error(formatGatewayError(frame.error)));
          return;
        }

        settled = true;
        clearTimeout(connectTimer);
        const hello = frame.payload;
        const maybeProtocol = getObjectValue(hello, "protocol");
        protocol = typeof maybeProtocol === "number" ? maybeProtocol : undefined;

        resolve({
          hello,
          protocol,
          latencyMs: Date.now() - startedAt,
          call: (method, params) => callGateway(ws, pending, method, params, config.requestTimeoutMs),
          close: () => {
            cleanup();
            ws.close();
          },
        });
        return;
      }

      const entry = pending.get(frame.id);
      if (!entry) return;

      clearTimeout(entry.timer);
      pending.delete(frame.id);

      if (frame.ok) {
        entry.resolve(frame.payload);
      } else {
        entry.reject(new Error(formatGatewayError(frame.error)));
      }
    });
  });
}

function callGateway(
  ws: WebSocket,
  pending: Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>,
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs: number,
) {
  return new Promise<unknown>((resolve, reject) => {
    const id = createRequestId(method);
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout OpenClaw RPC: ${method}`));
    }, timeoutMs);

    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ type: "req", id, method, params }));
  });
}

async function fetchGatewayJson(config: InternalOpenClawConfig, path: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetch(`${toHttpBaseUrl(config.gatewayUrl)}${path}`, {
      cache: "no-store",
      headers: buildHttpHeaders(config),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function buildHttpHeaders(config: InternalOpenClawConfig) {
  const headers: Record<string, string> = { Accept: "application/json" };

  if (config.authMode === "token" && config.token) {
    headers.Authorization = `Bearer ${config.token}`;
  }

  if (config.authMode === "password" && config.password) {
    headers["x-openclaw-password"] = config.password;
  }

  return headers;
}

function buildAuthParams(config: InternalOpenClawConfig) {
  if (config.authMode === "token") return { token: config.token };
  if (config.authMode === "password") return { password: config.password };
  return {};
}

function statusFromPayload(payload: unknown, config: InternalOpenClawConfig, latencyMs: number, message: string): OpenClawRuntimeStatus {
  const version = pickString(payload, ["version", "gatewayVersion", "appVersion"]);
  const protocol = pickNumber(payload, ["protocol", "protocolVersion"]);
  const heartbeat = extractHeartbeat(payload);

  return {
    state: "connected",
    configured: true,
    gatewayUrl: config.gatewayUrl,
    authMode: config.authMode,
    defaultAgentId: config.defaultAgentId,
    version,
    protocol,
    heartbeat,
    latencyMs,
    message,
  };
}

function normalizeAgents(payload: unknown): OpenClawAgentSummary[] {
  const rawAgents = getArrayPayload(payload, ["agents", "entries", "items", "data"]);

  return rawAgents.map((agent, index) => {
    const object = isRecord(agent) ? agent : {};
    const id = String(object.id || object.agentId || object.key || `openclaw-agent-${index + 1}`);
    const name = String(object.name || object.label || id);
    const status = normalizeAgentStatus(String(object.status || object.state || "unknown"));

    return {
      id,
      name,
      status,
      runtime: "OpenClaw",
      role: String(object.role || object.type || "Agent OpenClaw"),
      workspace: typeof object.workspace === "string" ? object.workspace : typeof object.workspacePath === "string" ? object.workspacePath : undefined,
      model: typeof object.model === "string" ? object.model : typeof object.modelId === "string" ? object.modelId : undefined,
      lastHeartbeat: typeof object.lastHeartbeat === "string" ? object.lastHeartbeat : undefined,
      memory: "unknown",
      workflow: typeof object.workflow === "string" ? object.workflow : undefined,
    };
  });
}

function normalizeAgentStatus(status: string): OpenClawAgentSummary["status"] {
  if (["active", "running", "connected", "ready"].includes(status.toLowerCase())) return "active";
  if (["paused", "idle"].includes(status.toLowerCase())) return "paused";
  if (["inactive", "stopped", "disabled"].includes(status.toLowerCase())) return "inactive";
  return "unknown";
}

function parseGatewayFrame(data: unknown): GatewayFrame | null {
  if (typeof data !== "string") return null;

  try {
    const parsed = JSON.parse(data);
    if (isRecord(parsed) && typeof parsed.type === "string") return parsed as GatewayFrame;
  } catch {
    return null;
  }

  return null;
}

function normalizeAuthMode(value: string): OpenClawAuthMode {
  if (value === "password" || value === "none") return value;
  return "token";
}

function normalizeGatewayUrl(value: string) {
  if (!value) return DEFAULT_GATEWAY_URL;

  if (value.startsWith("http://")) return `ws://${value.slice("http://".length)}`.replace(/\/$/, "");
  if (value.startsWith("https://")) return `wss://${value.slice("https://".length)}`.replace(/\/$/, "");
  if (value.startsWith("ws://") || value.startsWith("wss://")) return value.replace(/\/$/, "");

  return `ws://${value}`.replace(/\/$/, "");
}

function toHttpBaseUrl(gatewayUrl: string) {
  if (gatewayUrl.startsWith("wss://")) return `https://${gatewayUrl.slice("wss://".length)}`;
  if (gatewayUrl.startsWith("ws://")) return `http://${gatewayUrl.slice("ws://".length)}`;
  return gatewayUrl;
}

function createRequestId(method: string) {
  const safeMethod = method.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  return `${safeMethod}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parsePositiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getObjectValue(payload: unknown, key: string) {
  return isRecord(payload) ? payload[key] : undefined;
}

function pickString(payload: unknown, keys: string[]) {
  if (!isRecord(payload)) return undefined;
  for (const key of keys) {
    if (typeof payload[key] === "string") return payload[key];
  }
  return undefined;
}

function pickNumber(payload: unknown, keys: string[]) {
  if (!isRecord(payload)) return undefined;
  for (const key of keys) {
    if (typeof payload[key] === "number") return payload[key];
  }
  return undefined;
}

function extractHeartbeat(payload: unknown) {
  if (!isRecord(payload)) return undefined;
  const heartbeat = payload.heartbeat || payload.lastHeartbeat || payload.last_heartbeat;
  if (typeof heartbeat === "string") return heartbeat;
  if (isRecord(heartbeat) && typeof heartbeat.time === "string") return heartbeat.time;
  if (isRecord(heartbeat) && typeof heartbeat.createdAt === "string") return heartbeat.createdAt;
  return undefined;
}

function getArrayPayload(payload: unknown, keys: string[]) {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];

  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }

  return [];
}

function formatGatewayError(error: unknown) {
  if (typeof error === "string") return error;
  if (isRecord(error)) {
    const message = typeof error.message === "string" ? error.message : undefined;
    const code = isRecord(error.details) && typeof error.details.code === "string" ? error.details.code : undefined;
    return [message, code].filter(Boolean).join(" · ") || JSON.stringify(error);
  }
  return "OpenClaw Gateway a refusé la requête.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
