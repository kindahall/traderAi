import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const RUNTIME_DIR = path.join(process.cwd(), ".agent-trader-runtime");
const KILL_SWITCH_FILE = path.join(RUNTIME_DIR, "kill-switch.json");

export type KillSwitchState = {
  active: boolean;
  activatedAt: string | null;
  updatedAt: string;
  reason: string;
  source: "local-safety-store";
};

function defaultKillSwitchState(): KillSwitchState {
  return {
    active: false,
    activatedAt: null,
    updatedAt: new Date().toISOString(),
    reason: "inactive",
    source: "local-safety-store",
  };
}

function isKillSwitchState(value: unknown): value is KillSwitchState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<KillSwitchState>;
  return typeof state.active === "boolean" && typeof state.updatedAt === "string";
}

async function ensureRuntimeDir() {
  await mkdir(RUNTIME_DIR, { recursive: true });
}

export async function readKillSwitchState(): Promise<KillSwitchState> {
  try {
    const raw = await readFile(KILL_SWITCH_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return isKillSwitchState(parsed)
      ? {
          ...defaultKillSwitchState(),
          ...parsed,
          source: "local-safety-store",
        }
      : defaultKillSwitchState();
  } catch {
    return defaultKillSwitchState();
  }
}

export async function writeKillSwitchState(input: { active: boolean; reason?: string }) {
  const previous = await readKillSwitchState();
  const now = new Date().toISOString();
  const state: KillSwitchState = {
    active: input.active,
    activatedAt: input.active ? previous.activatedAt ?? now : null,
    updatedAt: now,
    reason: input.reason?.trim() || (input.active ? "manual activation" : "manual release"),
    source: "local-safety-store",
  };

  await ensureRuntimeDir();
  await writeFile(KILL_SWITCH_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return state;
}

export function getKillSwitchFilePath() {
  return KILL_SWITCH_FILE;
}
