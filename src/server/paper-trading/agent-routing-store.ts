import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { configuredLocalAnalysisProvider } from "@/server/analysis/local-provider";
import type { LocalAnalysisProviderId } from "@/server/analysis/local-provider";

export const PAPER_AGENT_RUNTIME_ROLES = ["scanner", "analyst", "risk", "auditor", "executor"] as const;

export type PaperAgentRuntimeRole = typeof PAPER_AGENT_RUNTIME_ROLES[number];
export type PaperAgentRuntimeMode = "deterministic" | "ai";

export type PaperAgentRoutingConfig = {
  version: 1;
  updatedAt: string;
  roles: Record<PaperAgentRuntimeRole, PaperAgentRuntimeMode>;
  providerId: LocalAnalysisProviderId | null;
  failClosed: boolean;
  source: "file" | "env" | "defaults";
};

const RUNTIME_DIR = path.join(process.cwd(), ".agent-trader-runtime");
const ROUTING_FILE = path.join(RUNTIME_DIR, "paper-agent-routing.json");

const DEFAULT_ROLES: Record<PaperAgentRuntimeRole, PaperAgentRuntimeMode> = {
  scanner: "deterministic",
  analyst: "deterministic",
  risk: "deterministic",
  auditor: "deterministic",
  executor: "deterministic",
};

function isRuntimeRole(value: string): value is PaperAgentRuntimeRole {
  return PAPER_AGENT_RUNTIME_ROLES.includes(value as PaperAgentRuntimeRole);
}

function normalizeMode(value: unknown): PaperAgentRuntimeMode {
  return value === "ai" ? "ai" : "deterministic";
}

function roleSetFromEnv() {
  return new Set((process.env.TRADERAI_CODEX_AGENT_ROLES || process.env.TRADERAI_AI_AGENT_ROLES || "")
    .split(/[,\s]+/)
    .map((role) => role.trim().toLowerCase())
    .filter(Boolean));
}

function failClosed() {
  return process.env.TRADERAI_CODEX_AGENT_FAIL_CLOSED === "true" || process.env.TRADERAI_ANALYSIS_FAIL_CLOSED === "true";
}

function rolesFromEnvDefaults() {
  const roles = { ...DEFAULT_ROLES };
  const envRoles = roleSetFromEnv();
  const allAnalysis = envRoles.has("all") || envRoles.has("analysis");

  for (const role of PAPER_AGENT_RUNTIME_ROLES) {
    if (allAnalysis || envRoles.has(role)) roles[role] = "ai";
  }

  return roles;
}

function normalizeRoles(value: unknown, fallback: Record<PaperAgentRuntimeRole, PaperAgentRuntimeMode>) {
  if (!value || typeof value !== "object") return { ...fallback };

  const input = value as Record<string, unknown>;
  const roles = { ...fallback };
  for (const role of PAPER_AGENT_RUNTIME_ROLES) {
    roles[role] = normalizeMode(input[role]);
  }
  return roles;
}

function withRuntimeFields(config: Omit<PaperAgentRoutingConfig, "providerId" | "failClosed">): PaperAgentRoutingConfig {
  return {
    ...config,
    providerId: configuredLocalAnalysisProvider(),
    failClosed: failClosed(),
  };
}

async function ensureRuntimeDir() {
  await mkdir(RUNTIME_DIR, { recursive: true });
}

export async function readPaperAgentRoutingConfig(): Promise<PaperAgentRoutingConfig> {
  try {
    const raw = await readFile(ROUTING_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") throw new Error("invalid routing config");
    const candidate = parsed as Partial<PaperAgentRoutingConfig>;

    return withRuntimeFields({
      version: 1,
      updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date().toISOString(),
      roles: normalizeRoles(candidate.roles, DEFAULT_ROLES),
      source: "file",
    });
  } catch {
    const envRoles = rolesFromEnvDefaults();
    const source = PAPER_AGENT_RUNTIME_ROLES.some((role) => envRoles[role] === "ai") ? "env" : "defaults";
    return withRuntimeFields({
      version: 1,
      updatedAt: new Date().toISOString(),
      roles: envRoles,
      source,
    });
  }
}

export async function writePaperAgentRoutingConfig(roles: Partial<Record<PaperAgentRuntimeRole, PaperAgentRuntimeMode>>) {
  const current = await readPaperAgentRoutingConfig();
  const normalizedRoles = { ...current.roles };

  for (const [role, mode] of Object.entries(roles)) {
    if (isRuntimeRole(role)) normalizedRoles[role] = normalizeMode(mode);
  }

  await ensureRuntimeDir();
  const persisted = {
    version: 1 as const,
    updatedAt: new Date().toISOString(),
    roles: normalizedRoles,
  };
  await writeFile(ROUTING_FILE, `${JSON.stringify(persisted, null, 2)}\n`, "utf8");

  return withRuntimeFields({ ...persisted, source: "file" });
}

export async function paperRoleUsesAi(role: PaperAgentRuntimeRole) {
  const config = await readPaperAgentRoutingConfig();
  return config.roles[role] === "ai";
}

export function getPaperAgentRoutingFilePath() {
  return ROUTING_FILE;
}
