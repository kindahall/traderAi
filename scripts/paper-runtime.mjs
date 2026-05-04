import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.PAPER_RUNTIME_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || "3000"}`;
const apiToken = process.env.TRADERAI_API_TOKEN || process.env.ADMIN_API_TOKEN || "";
const intervalMs = Number(process.env.PAPER_RUNTIME_INTERVAL_MS || 30_000);
const minAgeMs = Number(process.env.PAPER_RUNTIME_MIN_AGE_MS || Math.floor(intervalMs * 0.8));
const maxCycles = Number(process.env.PAPER_RUNTIME_MAX_CYCLES || 0);
const stateTimeoutMs = Number(process.env.PAPER_RUNTIME_STATE_TIMEOUT_MS || 15_000);
const cycleTimeoutMs = Number(process.env.PAPER_RUNTIME_CYCLE_TIMEOUT_MS || 10 * 60_000);
const runtimeDir = path.join(process.cwd(), ".agent-trader-runtime");
const pidFile = path.join(runtimeDir, "paper-runtime.pid");
const healthFile = path.join(runtimeDir, "paper-runtime-health.json");

let stopped = false;
let cyclesTriggered = 0;

function stamp() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureRuntimeDir() {
  await mkdir(runtimeDir, { recursive: true });
}

async function writeRuntimePid() {
  await ensureRuntimeDir();
  await writeFile(pidFile, `${process.pid}\n`, "utf8");
}

async function removeRuntimePid() {
  try {
    const current = await readFile(pidFile, "utf8");
    if (Number(current.trim()) === process.pid) await unlink(pidFile);
  } catch {
    // PID cleanup is best-effort; status also checks whether the process is alive.
  }
}

async function writeHealth(payload) {
  await ensureRuntimeDir();
  await writeFile(healthFile, `${JSON.stringify({
    pid: process.pid,
    baseUrl,
    intervalMs,
    minAgeMs,
    maxCycles,
    cyclesTriggered,
    updatedAt: stamp(),
    ...payload,
  }, null, 2)}\n`, "utf8");
}

function runtimeSignal(timeoutMs) {
  return AbortSignal.timeout(Math.max(5_000, timeoutMs));
}

async function getState() {
  const response = await fetch(`${baseUrl}/api/paper-trading/state`, { cache: "no-store", signal: runtimeSignal(stateTimeoutMs) });
  if (!response.ok) throw new Error(`state ${response.status}`);
  return response.json();
}

async function runCycle() {
  const response = await fetch(`${baseUrl}/api/paper-trading/cycle`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiToken ? { authorization: `Bearer ${apiToken}` } : {}),
    },
    body: "{}",
    signal: runtimeSignal(cycleTimeoutMs),
  });
  if (!response.ok) throw new Error(`cycle ${response.status}`);
  return response.json();
}

async function tick() {
  const state = await getState();
  const lastCycleAt = state.metrics?.lastCycleAt ? new Date(state.metrics.lastCycleAt).getTime() : 0;
  const ageMs = lastCycleAt ? Date.now() - lastCycleAt : Number.POSITIVE_INFINITY;

  if (ageMs < minAgeMs) {
    console.log(`${stamp()} skip recent-cycle age=${Math.round(ageMs / 1000)}s cycles=${state.metrics?.cycles ?? 0}`);
    await writeHealth({ status: "idle", stateCycles: state.metrics?.cycles ?? 0, lastCycleAt: state.metrics?.lastCycleAt ?? null });
    return;
  }

  await writeHealth({ status: "cycling", stateCycles: state.metrics?.cycles ?? 0, lastCycleAt: state.metrics?.lastCycleAt ?? null });
  const result = await runCycle();
  cyclesTriggered += 1;
  const metrics = result.state?.metrics ?? {};
  console.log(
    `${stamp()} cycle=${result.cycleId} events=${result.eventsCreated} equity=${metrics.equityUsd} open=${metrics.openPositions} pnlLatent=${metrics.unrealizedPnlUsd} discipline=${metrics.disciplineScore}`,
  );
  await writeHealth({
    status: "cycled",
    cycleId: result.cycleId,
    eventsCreated: result.eventsCreated,
    equityUsd: metrics.equityUsd,
    openPositions: metrics.openPositions,
    closedPositions: metrics.closedPositions,
    unrealizedPnlUsd: metrics.unrealizedPnlUsd,
    lastCycleAt: metrics.lastCycleAt ?? null,
  });
}

process.on("SIGINT", () => {
  stopped = true;
});
process.on("SIGTERM", () => {
  stopped = true;
});

await writeRuntimePid();
await writeHealth({ status: "started" });
console.log(`${stamp()} paper-runtime started pid=${process.pid} baseUrl=${baseUrl} intervalMs=${intervalMs} minAgeMs=${minAgeMs} maxCycles=${maxCycles || "infinite"}`);

while (!stopped) {
  try {
    await tick();
  } catch (error) {
    console.error(`${stamp()} error ${error instanceof Error ? error.message : String(error)}`);
  }

  if (maxCycles > 0 && cyclesTriggered >= maxCycles) {
    console.log(`${stamp()} paper-runtime completed maxCycles=${maxCycles}`);
    break;
  }

  await sleep(intervalMs);
}

await writeHealth({ status: "stopped" });
await removeRuntimePid();
console.log(`${stamp()} paper-runtime stopped cyclesTriggered=${cyclesTriggered}`);
