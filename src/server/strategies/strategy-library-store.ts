import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { agents } from "@/data/runtime/agents";
import type { StrategyDefinition } from "@/data/runtime/strategies";
import type { PaperTradingState } from "@/server/paper-trading/types";
import { readStrategyDiscoveryState, type StrategyDiscoveryCandidate } from "@/server/strategies/discovery-store";

export type StrategyLibraryStatus = StrategyDefinition["status"];

export type StrategyLibraryState = {
  version: 1;
  updatedAt: string;
  overrides: Record<string, {
    status: StrategyLibraryStatus;
    updatedAt: string;
  }>;
};

const RUNTIME_DIR = path.join(process.cwd(), ".agent-trader-runtime");
const LIBRARY_FILE = path.join(RUNTIME_DIR, "strategy-library.json");

function nowIso() {
  return new Date().toISOString();
}

function defaultState(): StrategyLibraryState {
  return {
    version: 1,
    updatedAt: nowIso(),
    overrides: {},
  };
}

function isStrategyStatus(value: unknown): value is StrategyLibraryStatus {
  return value === "active" || value === "inactive" || value === "draft";
}

function normalizeState(value: unknown): StrategyLibraryState {
  if (!value || typeof value !== "object") return defaultState();
  const input = value as Partial<StrategyLibraryState>;
  const overrides: StrategyLibraryState["overrides"] = {};
  const rawOverrides = input.overrides;

  if (rawOverrides && typeof rawOverrides === "object") {
    Object.entries(rawOverrides).forEach(([id, override]) => {
      if (!id || !override || typeof override !== "object") return;
      const candidate = override as Partial<StrategyLibraryState["overrides"][string]>;
      if (!isStrategyStatus(candidate.status)) return;
      overrides[id] = {
        status: candidate.status,
        updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : nowIso(),
      };
    });
  }

  return {
    version: 1,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : nowIso(),
    overrides,
  };
}

async function ensureRuntimeDir() {
  await mkdir(RUNTIME_DIR, { recursive: true });
}

async function writeState(state: StrategyLibraryState) {
  await ensureRuntimeDir();
  const next = { ...state, updatedAt: nowIso() };
  await writeFile(LIBRARY_FILE, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export async function readStrategyLibraryState(): Promise<StrategyLibraryState> {
  try {
    return normalizeState(JSON.parse(await readFile(LIBRARY_FILE, "utf8")) as unknown);
  } catch {
    return defaultState();
  }
}

export async function updateStrategyLibraryStatus(id: string, status: StrategyLibraryStatus) {
  const cleanId = id.trim();
  if (!cleanId || !isStrategyStatus(status)) return readStrategyLibraryState();
  const current = await readStrategyLibraryState();
  return writeState({
    ...current,
    overrides: {
      ...current.overrides,
      [cleanId]: {
        status,
        updatedAt: nowIso(),
      },
    },
  });
}

export function discoveryStrategyId(candidateId: string) {
  return `discovery-${candidateId}`;
}

function slug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function paperStatusDefault(candidate: StrategyDiscoveryCandidate): StrategyLibraryStatus {
  if (candidate.stage === "backtest_queue") return "draft";
  if (candidate.stage === "paper_incubation" || candidate.stage === "live_candidate") return "active";
  return "inactive";
}

function candidateIsLibraryStrategy(candidate: StrategyDiscoveryCandidate) {
  return candidate.stage === "backtest_queue" || candidate.stage === "paper_incubation" || candidate.stage === "live_candidate";
}

type PaperStats = NonNullable<StrategyDefinition["paperStats"]> & { winRate: number; pnlUsd: number };

function emptyPaperStats(): PaperStats {
  return {
    totalTrades: 0,
    closedTrades: 0,
    openTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    pnlUsd: 0,
  };
}

function paperStatsFromPositions(positions: NonNullable<PaperTradingState["positions"]>): PaperStats {
  const closed = positions.filter((position) => position.status === "closed");
  const open = positions.filter((position) => position.status === "open");
  const winning = closed.filter((position) => (position.realizedPnlUsd ?? 0) > 0);
  const losing = closed.filter((position) => (position.realizedPnlUsd ?? 0) < 0);
  const pnlUsd = positions.reduce((total, position) => total + (position.realizedPnlUsd ?? position.unrealizedPnlUsd ?? 0), 0);

  return {
    totalTrades: positions.length,
    closedTrades: closed.length,
    openTrades: open.length,
    winningTrades: winning.length,
    losingTrades: losing.length,
    winRate: closed.length ? winning.length / closed.length * 100 : 0,
    pnlUsd,
  };
}

function strategyPaperStats(strategy: StrategyDefinition, paperState?: PaperTradingState): PaperStats {
  if (!paperState) return emptyPaperStats();
  const strategyKey = slug(strategy.name);
  const strategyAgents = agents.filter((agent) => slug(agent.strategy) === strategyKey || slug(agent.strategy) === strategy.id);
  if (!strategyAgents.length) return emptyPaperStats();
  const agentIds = new Set(strategyAgents.map((agent) => agent.id));
  const positions = paperState.positions.filter((position) => agentIds.has(position.agentId));
  return positions.length ? paperStatsFromPositions(positions) : emptyPaperStats();
}

function paperStatsForCandidate(candidate: StrategyDiscoveryCandidate, paperState?: PaperTradingState): NonNullable<StrategyDefinition["paperStats"]> & { winRate: number; pnlUsd: number } {
  const positions = paperState?.positions.filter((position) => position.agentId === `strategy-${candidate.id}`) ?? [];
  if (positions.length) {
    return paperStatsFromPositions(positions);
  }

  return {
    totalTrades: candidate.paper.trades,
    closedTrades: candidate.paper.closedTrades,
    openTrades: candidate.paper.openTrades,
    winningTrades: candidate.paper.winningTrades,
    losingTrades: candidate.paper.losingTrades,
    winRate: candidate.paper.winRate,
    pnlUsd: candidate.paper.pnlUsd,
  };
}

function strategyFromDiscoveryCandidate(candidate: StrategyDiscoveryCandidate, status: StrategyLibraryStatus, paperState?: PaperTradingState): StrategyDefinition {
  const pineImported = Boolean(candidate.pineSummary);
  const capitalUsd = Math.max(1, paperState?.capitalUsd ?? 10_000);
  const paperStats = paperStatsForCandidate(candidate, paperState);
  const performancePercent = Number((paperStats.pnlUsd / capitalUsd * 100).toFixed(2));
  const validationRate = paperStats.closedTrades
    ? Math.min(100, Math.max(0, paperStats.winRate))
    : Math.min(100, Math.max(0, candidate.score));
  const paperSummary = paperStats.totalTrades
    ? `Paper ${candidate.paper.status} · ${paperStats.winningTrades}/${paperStats.closedTrades} gagnants clos · ${paperStats.openTrades} ouvert(s) · P&L ${paperStats.pnlUsd.toFixed(2)} $.`
    : candidate.nextAction;

  return {
    id: discoveryStrategyId(candidate.id),
    name: candidate.title,
    status,
    timeframe: candidate.timeframe || "15m",
    risk: candidate.risk,
    winRate: Number(paperStats.winRate.toFixed(1)),
    performance: performancePercent,
    drawdown: 0,
    validationRate,
    paperStats: {
      totalTrades: paperStats.totalTrades,
      closedTrades: paperStats.closedTrades,
      openTrades: paperStats.openTrades,
      winningTrades: paperStats.winningTrades,
      losingTrades: paperStats.losingTrades,
    },
    assets: candidate.assets.length ? candidate.assets : ["BTC/USD"],
    entryRules: pineImported
      ? ["Croisement MA rapide/lente", "Retest support/résistance via pivots", "Entrée drawdown pullback"]
      : ["Règles à formaliser depuis la source", "Signal confirmé sans repainting", "Volume et volatilité vérifiés"],
    exitRules: pineImported
      ? ["TP1/TP2/TP3 basés ATR", "Stop-loss en pourcentage", "Trailing stop ATR", "Run-up protect"]
      : ["Stop-loss obligatoire", "Take-profit ou invalidation explicite", "Sortie si conditions source invalidées"],
    filters: pineImported
      ? ["Limiter pyramiding/exposition", "Reset état après flat", "Backtest avec frais/slippage", "Paper trading avant live"]
      : ["Backtest déterministe", "Frais et slippage inclus", "Paper trading avant live"],
    recommendation: paperSummary,
  };
}

export async function buildStrategyLibrary(baseStrategies: StrategyDefinition[], paperState?: PaperTradingState) {
  const [library, discovery] = await Promise.all([readStrategyLibraryState(), readStrategyDiscoveryState()]);
  const byIdentity = new Set<string>();
  const withOverrides = baseStrategies.map((strategy) => {
    const paperStats = strategyPaperStats(strategy, paperState);
    const measured = paperStats.totalTrades > 0;
    const capitalUsd = Math.max(1, paperState?.capitalUsd ?? 10_000);
    byIdentity.add(strategy.id);
    byIdentity.add(slug(strategy.name));
    return {
      ...strategy,
      winRate: measured ? Number(paperStats.winRate.toFixed(1)) : 0,
      performance: measured ? Number((paperStats.pnlUsd / capitalUsd * 100).toFixed(2)) : 0,
      validationRate: paperStats.closedTrades ? Math.min(100, Math.max(0, paperStats.winRate)) : 0,
      paperStats: {
        totalTrades: paperStats.totalTrades,
        closedTrades: paperStats.closedTrades,
        openTrades: paperStats.openTrades,
        winningTrades: paperStats.winningTrades,
        losingTrades: paperStats.losingTrades,
      },
      recommendation: measured
        ? `Paper runtime · ${paperStats.winningTrades}/${paperStats.closedTrades} gagnants clos · ${paperStats.openTrades} ouvert(s) · P&L ${paperStats.pnlUsd.toFixed(2)} $.`
        : "Aucun échantillon paper mesuré pour cette stratégie.",
      status: library.overrides[strategy.id]?.status ?? strategy.status,
    };
  });

  const discoveryStrategies = discovery.candidates
    .filter(candidateIsLibraryStrategy)
    .map((candidate) => {
      const id = discoveryStrategyId(candidate.id);
      const status = library.overrides[id]?.status ?? paperStatusDefault(candidate);
      return strategyFromDiscoveryCandidate(candidate, status, paperState);
    })
    .filter((strategy) => {
      const nameKey = slug(strategy.name);
      if (byIdentity.has(strategy.id) || byIdentity.has(nameKey)) return false;
      byIdentity.add(strategy.id);
      byIdentity.add(nameKey);
      return true;
    });

  return [...withOverrides, ...discoveryStrategies];
}

export function getStrategyLibraryFilePath() {
  return LIBRARY_FILE;
}
