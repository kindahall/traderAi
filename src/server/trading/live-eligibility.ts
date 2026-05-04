import { readFile } from "node:fs/promises";
import path from "node:path";
import { strategies } from "@/data/runtime/strategies";
import { getConfiguredLlmProviders } from "@/server/adapters/llm";
import { readLocalAnalysisProviderConfig } from "@/server/analysis/local-provider";
import { readExchangeEnvConfig } from "@/server/config/local-env";
import { readPaperAgentRoutingConfig } from "@/server/paper-trading/agent-routing-store";
import { readPaperTradingState } from "@/server/paper-trading/event-store";
import { readKillSwitchState } from "@/server/safety/kill-switch-store";
import { readTradingAllocationConfig } from "@/server/trading/allocation-store";

const RUNTIME_DIR = path.join(process.cwd(), ".agent-trader-runtime");
const PAPER_RUNTIME_PID_FILE = path.join(RUNTIME_DIR, "paper-runtime.pid");
const PAPER_RUNTIME_STALE_AFTER_MS = Number(process.env.PAPER_RUNTIME_STALE_AFTER_MS || 300_000);
const DEFAULT_THRESHOLD_PERCENT = 80;
const DEFAULT_MIN_PAPER_TRADES = 20;
const REQUIRED_AI_ROLES = ["scanner", "analyst", "risk", "auditor"] as const;

export type LiveTradingEligibility = Awaited<ReturnType<typeof getLiveTradingEligibility>>;

function thresholdPercent() {
  const configured = Number(process.env.LIVE_PROMOTION_THRESHOLD_PERCENT);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_THRESHOLD_PERCENT;
}

function minPaperTrades() {
  const configured = Number(process.env.LIVE_PROMOTION_MIN_PAPER_TRADES);
  return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_MIN_PAPER_TRADES;
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

function isProcessAlive(pid: number | null) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function paperExposurePercent(equityUsd: number, openNotionalUsd: number) {
  return round((openNotionalUsd / Math.max(1, equityUsd)) * 100, 2);
}

function bestBacktestScore() {
  const ranked = strategies
    .map((strategy) => ({
      id: strategy.id,
      name: strategy.name,
      winRate: strategy.winRate,
      validationRate: strategy.validationRate,
      score: Math.max(strategy.winRate, strategy.validationRate),
    }))
    .toSorted((a, b) => b.score - a.score);

  return ranked[0] ?? { id: "none", name: "Aucun backtest", winRate: 0, validationRate: 0, score: 0 };
}

export async function getLiveTradingEligibility() {
  const [paperState, killSwitch, exchange, providerConfig, routingConfig, allocationConfig] = await Promise.all([
    readPaperTradingState(),
    readKillSwitchState(),
    Promise.resolve(readExchangeEnvConfig()),
    readLocalAnalysisProviderConfig(),
    readPaperAgentRoutingConfig(),
    readTradingAllocationConfig(),
  ]);
  const llmProviders = getConfiguredLlmProviders();
  const threshold = thresholdPercent();
  const minimumPaperTrades = minPaperTrades();
  const backtest = bestBacktestScore();
  const closedPaperTrades = paperState.metrics.closedPositions;
  const paperScore = paperState.metrics.winRate;
  const paperPass = closedPaperTrades >= minimumPaperTrades && paperScore >= threshold;
  const backtestPass = backtest.score >= threshold;
  const bestScore = Math.max(paperScore, backtest.score);
  const bestScoreSource = bestScore <= 0 ? "none" : paperScore >= backtest.score ? "paper" : "backtest";
  const performancePass = paperPass || backtestPass;
  const pid = await readPaperRuntimePid();
  const paperRuntimeAlive = isProcessAlive(pid);
  const lastCycleAt = paperState.metrics.lastCycleAt ?? null;
  const lastCycleAgeSeconds = lastCycleAt ? Math.max(0, Math.round((Date.now() - new Date(lastCycleAt).getTime()) / 1000)) : null;
  const paperRuntimeFresh = Boolean(lastCycleAt && lastCycleAgeSeconds !== null && lastCycleAgeSeconds <= Math.round(PAPER_RUNTIME_STALE_AFTER_MS / 1000));
  const openNotionalUsd = paperState.positions
    .filter((position) => position.status === "open")
    .reduce((total, position) => total + position.notionalUsd, 0);
  const exposurePercent = paperExposurePercent(paperState.metrics.equityUsd || paperState.capitalUsd, openNotionalUsd);
  const connectedExternalProviders = llmProviders.filter((provider) => provider.status === "connected").map((provider) => provider.id);
  const localProviderId = providerConfig.providerId;
  const aiRoles = REQUIRED_AI_ROLES.filter((role) => routingConfig.roles[role] === "ai");
  const requiredAiRolesReady = aiRoles.length === REQUIRED_AI_ROLES.length;
  const llmProviderReady = Boolean(localProviderId || connectedExternalProviders.length);
  const llmReady = llmProviderReady && requiredAiRolesReady;
  const demoTradesIncluded = process.env.INCLUDE_DEMO_DATA === "true" || process.env.NEXT_PUBLIC_INCLUDE_DEMO_DATA === "true";
  const exchangeReady = exchange.apiKeyConfigured && exchange.walletConfigured;
  const exposureLimitPercent = allocationConfig.paper.maxPortfolioExposurePercent;
  const riskReady = !killSwitch.active && paperRuntimeFresh && paperRuntimeAlive && paperState.metrics.openPositions === 0 && exposurePercent < exposureLimitPercent && !demoTradesIncluded;
  const blockers = [
    !performancePass ? `performance-below-${threshold}` : "",
    !paperPass && paperScore >= threshold && closedPaperTrades < minimumPaperTrades ? `paper-sample-below-${minimumPaperTrades}` : "",
    !llmProviderReady ? "llm-provider-missing" : "",
    !requiredAiRolesReady ? "llm-agent-routing-incomplete" : "",
    !exchange.apiKeyConfigured ? "exchange-api-missing" : "",
    !exchange.walletConfigured ? "wallet-missing" : "",
    killSwitch.active ? "kill-switch-active" : "",
    !paperRuntimeAlive ? "paper-runtime-worker-stopped" : "",
    !paperRuntimeFresh ? "paper-runtime-stale" : "",
    paperState.metrics.openPositions > 0 ? "paper-positions-open" : "",
    exposurePercent >= exposureLimitPercent ? "paper-exposure-limit-breached" : "",
    demoTradesIncluded ? "demo-trades-visible" : "",
  ].filter(Boolean);

  return {
    thresholdPercent: threshold,
    eligible: blockers.length === 0,
    liveEnabled: exchange.tradingEnabled,
    performance: {
      pass: performancePass,
      bestScore,
      source: paperPass ? "paper" : backtestPass ? "backtest" : bestScoreSource,
      paper: {
        pass: paperPass,
        winRate: paperScore,
        closedTrades: closedPaperTrades,
        minimumTrades: minimumPaperTrades,
      },
      backtest: {
        pass: backtestPass,
        score: backtest.score,
        strategyId: backtest.id,
        strategyName: backtest.name,
        winRate: backtest.winRate,
        validationRate: backtest.validationRate,
      },
    },
    llm: {
      pass: llmReady,
      localProviderId,
      connectedExternalProviders,
      requiredRoles: [...REQUIRED_AI_ROLES],
      aiRoles,
      routingSource: routingConfig.source,
    },
    exchange: {
      pass: exchangeReady,
      providerId: exchange.providerId,
      providerLabel: exchange.providerLabel,
      apiKeyConfigured: exchange.apiKeyConfigured,
      secretConfigured: exchange.secretConfigured,
      walletConfigured: exchange.walletConfigured,
      walletProvider: exchange.walletProvider,
    },
    risk: {
      pass: riskReady,
      killSwitchActive: killSwitch.active,
      paperRuntimeAlive,
      paperRuntimeFresh,
      lastCycleAt,
      lastCycleAgeSeconds,
      openPositions: paperState.metrics.openPositions,
      exposurePercent,
      exposureLimitPercent,
      demoTradesIncluded,
    },
    blockers,
  };
}
