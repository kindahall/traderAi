import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OpenClawRolePolicy } from "@/types/openclaw";

const RUNTIME_DIR = path.join(process.cwd(), ".agent-trader-runtime");
const POLICY_FILE = path.join(RUNTIME_DIR, "openclaw-policy.json");

type StoredPolicy = {
  version: 1;
  updatedAt: string;
  rolePolicy: OpenClawRolePolicy[];
};

export function getDefaultOpenClawRolePolicy(): OpenClawRolePolicy[] {
  return [
    {
      id: "scanner",
      label: "Scanner marché",
      enabled: true,
      riskAuthority: "proposal_only",
      description: "OpenClaw peut observer les marchés, détecter des signaux et enrichir le journal.",
    },
    {
      id: "analyst",
      label: "Analyste opportunités",
      enabled: true,
      riskAuthority: "proposal_only",
      description: "OpenClaw peut produire une thèse structurée et proposer un trade au backend.",
    },
    {
      id: "auditor",
      label: "Auditeur décisions",
      enabled: true,
      riskAuthority: "none",
      description: "OpenClaw peut relire les décisions, logs et post-mortems sans autorité d'exécution.",
    },
    {
      id: "executor",
      label: "Exécuteur direct",
      enabled: false,
      locked: true,
      riskAuthority: "requires_risk_engine",
      description: "Verrouillé : toute exécution doit passer par le Risk Engine et la validation humaine.",
    },
  ];
}

export async function readOpenClawRolePolicy() {
  try {
    const raw = await readFile(POLICY_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoredPolicy>;
    return normalizeRolePolicy(parsed.rolePolicy);
  } catch {
    return getDefaultOpenClawRolePolicy();
  }
}

export async function writeOpenClawRolePolicy(rolePolicy: unknown) {
  const normalized = normalizeRolePolicy(rolePolicy);
  const payload: StoredPolicy = {
    version: 1,
    updatedAt: new Date().toISOString(),
    rolePolicy: normalized,
  };

  await mkdir(RUNTIME_DIR, { recursive: true });
  await writeFile(POLICY_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return payload;
}

function normalizeRolePolicy(value: unknown) {
  const defaults = getDefaultOpenClawRolePolicy();
  const incoming = Array.isArray(value) ? value : [];

  return defaults.map((defaultRole) => {
    const match = incoming.find((item) => item && typeof item === "object" && "id" in item && item.id === defaultRole.id);
    const enabled = match && typeof match === "object" && "enabled" in match && typeof match.enabled === "boolean" ? match.enabled : defaultRole.enabled;

    return {
      ...defaultRole,
      enabled: defaultRole.locked ? defaultRole.enabled : enabled,
    };
  });
}
