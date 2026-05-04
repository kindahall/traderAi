import { readFile } from "node:fs/promises";
import path from "node:path";
import { getConfiguredLlmProviders } from "@/server/adapters/llm";
import { getMarketProviderConfig } from "@/server/adapters/market-data";
import { getPaperStateFilePath, readPaperTradingState } from "@/server/paper-trading/event-store";
import type { PaperTradingState } from "@/server/paper-trading/types";
import { getKillSwitchFilePath, readKillSwitchState } from "@/server/safety/kill-switch-store";
import { readTradingAllocationConfig } from "@/server/trading/allocation-store";
import { getLiveTradingEligibility } from "@/server/trading/live-eligibility";

const RUNTIME_DIR = path.join(process.cwd(), ".agent-trader-runtime");
const PAPER_RUNTIME_PID_FILE = path.join(RUNTIME_DIR, "paper-runtime.pid");
const PAPER_RUNTIME_STALE_AFTER_MS = Number(process.env.PAPER_RUNTIME_STALE_AFTER_MS || 300_000);

export type PaperRuntimeHealth = "fresh" | "stale" | "empty";

export type PaperRuntimeStatus = {
  status: PaperRuntimeHealth;
  lastCycleAt: string | null;
  lastCycleAgeSeconds: number | null;
  staleAfterSeconds: number;
  cycles: number;
  openPositions: number;
  closedPositions: number;
  refusedSignals: number;
  equityUsd: number;
  process: {
    pid: number | null;
    alive: boolean;
    pidFile: string;
  };
  file: string;
};

function isProcessAlive(pid: number | null) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readPaperRuntimePid() {
  try {
    const raw = await readFile(PAPER_RUNTIME_PID_FILE, "utf8");
    const pid = Number(raw.trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function paperExposurePercent(state: PaperTradingState) {
  const equityUsd = Math.max(1, state.metrics.equityUsd || state.capitalUsd);
  const exposureUsd = state.positions
    .filter((position) => position.status === "open")
    .reduce((total, position) => total + position.notionalUsd, 0);
  return Number(((exposureUsd / equityUsd) * 100).toFixed(2));
}

export async function buildPaperRuntimeStatus(state?: PaperTradingState): Promise<PaperRuntimeStatus> {
  const paperState = state ?? await readPaperTradingState();
  const pid = await readPaperRuntimePid();
  const lastCycleAt = paperState.metrics.lastCycleAt ?? null;
  const lastCycleAgeSeconds = lastCycleAt ? Math.max(0, Math.round((Date.now() - new Date(lastCycleAt).getTime()) / 1000)) : null;
  const staleAfterSeconds = Math.round(PAPER_RUNTIME_STALE_AFTER_MS / 1000);
  const status: PaperRuntimeHealth = !paperState.metrics.cycles
    ? "empty"
    : lastCycleAgeSeconds !== null && lastCycleAgeSeconds <= staleAfterSeconds
      ? "fresh"
      : "stale";

  return {
    status,
    lastCycleAt,
    lastCycleAgeSeconds,
    staleAfterSeconds,
    cycles: paperState.metrics.cycles,
    openPositions: paperState.metrics.openPositions,
    closedPositions: paperState.metrics.closedPositions,
    refusedSignals: paperState.metrics.refusedSignals,
    equityUsd: paperState.metrics.equityUsd,
    process: {
      pid,
      alive: isProcessAlive(pid),
      pidFile: PAPER_RUNTIME_PID_FILE,
    },
    file: getPaperStateFilePath(),
  };
}

function dataMode() {
  const demoTradesIncluded = process.env.INCLUDE_DEMO_DATA === "true" || process.env.NEXT_PUBLIC_INCLUDE_DEMO_DATA === "true";
  return {
    demoTradesIncluded,
    tradeSource: demoTradesIncluded ? "paper-runtime+demo-reference" : "paper-runtime-only",
  };
}

export async function getSystemIntegrity() {
  const [paperState, killSwitch, llmProviders, liveEligibility, allocationConfig] = await Promise.all([
    readPaperTradingState(),
    readKillSwitchState(),
    Promise.resolve(getConfiguredLlmProviders()),
    getLiveTradingEligibility(),
    readTradingAllocationConfig(),
  ]);
  const provider = getMarketProviderConfig();
  const paperRuntime = await buildPaperRuntimeStatus(paperState);
  const liveTradingEnabled = process.env.LIVE_TRADING_ENABLED === "true";
  const mode = dataMode();
  const blockers: string[] = [];
  const exposurePercent = paperExposurePercent(paperState);
  const exposureLimitPercent = allocationConfig.paper.maxPortfolioExposurePercent;

  if (paperRuntime.status !== "fresh") blockers.push("paper-runtime-stale");
  if (killSwitch.active) blockers.push("kill-switch-active");
  if (exposurePercent >= exposureLimitPercent) blockers.push("paper-exposure-limit-breached");
  if (mode.demoTradesIncluded) blockers.push("demo-trades-visible");
  if (liveTradingEnabled && !liveEligibility.eligible) blockers.push("live-gate-suspended");
  if (!liveTradingEnabled && !liveEligibility.eligible) blockers.push("live-trading-locked");

  return {
    generatedAt: new Date().toISOString(),
    market: {
      provider: provider.id,
      label: provider.label,
      source: provider.source,
      instrumentType: provider.instrumentType,
      restBaseUrl: provider.restBaseUrl,
    },
    paperRuntime,
    killSwitch: {
      ...killSwitch,
      file: getKillSwitchFilePath(),
    },
    dataMode: mode,
    liveExecution: {
      enabled: liveTradingEnabled,
      status: liveTradingEnabled ? liveEligibility.eligible ? "armed-llm" : "suspended" : liveEligibility.eligible ? "eligible" : "locked",
      eligibility: liveEligibility,
    },
    llm: {
      connectedProviders: llmProviders.filter((provider) => provider.status === "connected").length,
      totalProviders: llmProviders.length,
    },
    readiness: {
      status: blockers.some((blocker) => blocker === "kill-switch-active" || blocker === "paper-runtime-stale" || blocker === "demo-trades-visible" || blocker === "paper-exposure-limit-breached")
        ? "attention"
        : "paper-ok",
      blockers,
    },
    risk: {
      exposurePercent,
      exposureLimitPercent,
    },
    truthAudit: {
      counts: {
        live: 2,
        runtime: 2,
        config: 2,
        locked: liveTradingEnabled && liveEligibility.eligible ? 0 : 1,
      },
      surfaces: [
        { label: "Marchés", state: "live", source: `${provider.label} REST + WebSocket trades` },
        { label: "Charts", state: "live", source: `${provider.label} candles + live trades` },
        { label: "Journal", state: paperState.events.length ? "runtime" : "empty", source: "local paper runtime" },
        { label: "Risque", state: "runtime", source: "paper positions + risk events" },
        { label: "Agents", state: "config", source: "local agent config" },
        { label: "Stratégies", state: "config", source: "local strategy config" },
        { label: "Live trading", state: liveTradingEnabled && liveEligibility.eligible ? "guarded" : liveEligibility.eligible ? "eligible" : "locked", source: `gate ${liveEligibility.thresholdPercent}% · LLM ${liveEligibility.llm.pass ? "ready" : "pending"}` },
      ],
    },
  };
}
