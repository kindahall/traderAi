import { constants } from "node:fs";
import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const RUNTIME_DIR = path.join(process.cwd(), ".agent-trader-runtime");
const PID_FILE = path.join(RUNTIME_DIR, "paper-runtime.pid");
const LOG_FILE = path.join(RUNTIME_DIR, "paper-runtime.log");
const HEALTH_FILE = path.join(RUNTIME_DIR, "paper-runtime-health.json");

export type PaperRuntimeHealthFile = {
  pid: number;
  baseUrl: string;
  intervalMs: number;
  minAgeMs: number;
  maxCycles: number;
  cyclesTriggered: number;
  updatedAt: string;
  status: "started" | "idle" | "cycled" | "stopped" | string;
  stateCycles?: number;
  cycleId?: string;
  eventsCreated?: number;
  equityUsd?: number;
  openPositions?: number;
  closedPositions?: number;
  unrealizedPnlUsd?: number;
  lastCycleAt?: string | null;
};

export type PaperRuntimeProcessStatus = {
  pid: number | null;
  alive: boolean;
  pidFile: string;
  logFile: string;
  healthFile: string;
  health: PaperRuntimeHealthFile | null;
};

function stamp() {
  return new Date().toISOString();
}

async function ensureRuntimeDir() {
  await mkdir(RUNTIME_DIR, { recursive: true });
}

async function readPid() {
  try {
    const raw = await readFile(PID_FILE, "utf8");
    const pid = Number(raw.trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isAlive(pid: number | null) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readHealth() {
  try {
    return JSON.parse(await readFile(HEALTH_FILE, "utf8")) as PaperRuntimeHealthFile;
  } catch {
    return null;
  }
}

async function appendLog(message: string) {
  await ensureRuntimeDir();
  const handle = await open(LOG_FILE, constants.O_CREAT | constants.O_WRONLY | constants.O_APPEND, 0o644);
  await handle.write(`${message}\n`);
  await handle.close();
}

export async function getPaperRuntimeProcessStatus(): Promise<PaperRuntimeProcessStatus> {
  const pid = await readPid();
  return {
    pid,
    alive: isAlive(pid),
    pidFile: PID_FILE,
    logFile: LOG_FILE,
    healthFile: HEALTH_FILE,
    health: await readHealth(),
  };
}

function defaultRuntimeBaseUrl() {
  return process.env.PAPER_RUNTIME_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || "3000"}`;
}

export async function startPaperRuntimeDaemon(baseUrl = defaultRuntimeBaseUrl()) {
  await ensureRuntimeDir();
  const current = await getPaperRuntimeProcessStatus();
  if (current.alive) return { ...current, changed: false, message: "paper-runtime already running" };

  if (current.pid && !current.alive) {
    await unlink(PID_FILE).catch(() => {});
  }

  await appendLog(`${stamp()} paper-runtime-api starting daemon`);
  const output = await open(LOG_FILE, constants.O_CREAT | constants.O_WRONLY | constants.O_APPEND, 0o644);
  const child = spawn(process.execPath, [path.join(process.cwd(), "scripts/paper-runtime.mjs")], {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      PAPER_RUNTIME_BASE_URL: baseUrl,
    },
    stdio: ["ignore", output.fd, output.fd],
  });

  child.unref();
  await writeFile(PID_FILE, `${child.pid}\n`, "utf8");
  await output.close();
  await new Promise((resolve) => setTimeout(resolve, 800));

  return { ...(await getPaperRuntimeProcessStatus()), changed: true, message: "paper-runtime daemon started" };
}

export async function stopPaperRuntimeDaemon() {
  const current = await getPaperRuntimeProcessStatus();
  if (!current.pid || !current.alive) {
    await unlink(PID_FILE).catch(() => {});
    return { ...current, changed: false, message: "paper-runtime not running" };
  }

  process.kill(current.pid, "SIGTERM");
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (!isAlive(current.pid)) {
      await unlink(PID_FILE).catch(() => {});
      return { ...(await getPaperRuntimeProcessStatus()), changed: true, message: "paper-runtime stopped" };
    }
  }

  return { ...(await getPaperRuntimeProcessStatus()), changed: false, message: "paper-runtime still running after SIGTERM" };
}
