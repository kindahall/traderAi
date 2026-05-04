import { readStrategyDiscoveryState, updateStrategyDiscoveryPaperMetrics, type StrategyDiscoveryCandidate, type StrategyDiscoveryPaperMetricInput } from "@/server/strategies/discovery-store";
import { discoveryStrategyId, readStrategyLibraryState, type StrategyLibraryStatus } from "@/server/strategies/strategy-library-store";
import type { PaperTradingState } from "@/server/paper-trading/types";
import type { Agent } from "@/types/agent";

export const DISCOVERY_PAPER_AGENT_PREFIX = "strategy-";
const MAX_DISCOVERY_STRATEGY_PAIRS = Math.max(1, Math.min(6, Number(process.env.PAPER_TRADING_MAX_DISCOVERY_PAIRS_PER_STRATEGY || 4)));

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizePair(pair: string) {
  const compact = pair.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.endsWith("USDT")) return `${compact.slice(0, -4)}/USDT`;
  if (compact.endsWith("USDC")) return `${compact.slice(0, -4)}/USDC`;
  if (compact.endsWith("USD")) return `${compact.slice(0, -3)}/USD`;
  return compact ? `${compact}/USD` : "BTC/USD";
}

function paperAgentId(candidateId: string) {
  return `${DISCOVERY_PAPER_AGENT_PREFIX}${candidateId}`;
}

function discoveryIdFromAgentId(agentId: string) {
  return agentId.startsWith(DISCOVERY_PAPER_AGENT_PREFIX) ? agentId.slice(DISCOVERY_PAPER_AGENT_PREFIX.length) : "";
}

function candidatePairs(candidate: StrategyDiscoveryCandidate) {
  const pairs = candidate.assets.map(normalizePair).filter(Boolean);
  return [...new Set(pairs.length ? pairs : ["BTC/USD"])].slice(0, MAX_DISCOVERY_STRATEGY_PAIRS);
}

function strategyText(candidate: StrategyDiscoveryCandidate) {
  const pine = candidate.pineSummary;
  return [
    candidate.title,
    candidate.source,
    pine?.canShort ? "breakout short" : "trend",
    pine?.hasTrailingStop ? "trailing trend" : "",
    pine?.hasMultiTakeProfit ? "multi take profit" : "",
    pine?.hasRunUpProtection ? "run up protection" : "",
    candidate.tags.join(" "),
  ].filter(Boolean).join(" ");
}

function agentStatusFromStrategyStatus(status?: StrategyLibraryStatus): Agent["status"] {
  return status && status !== "active" ? "inactive" : "active";
}

function candidateToPaperAgent(candidate: StrategyDiscoveryCandidate, strategyStatus?: StrategyLibraryStatus): Agent {
  const pairs = candidatePairs(candidate);
  const confidence = clamp(candidate.score || 45, 42, 88);
  const elevatedRisk = candidate.risk === "Élevé" || (candidate.pineSummary?.pyramiding ?? 0) > 1;

  return {
    id: paperAgentId(candidate.id),
    name: `Paper Strategy · ${candidate.title}`,
    avatar: "PS",
    status: agentStatusFromStrategyStatus(strategyStatus),
    mode: "paper",
    focus: pairs[0] ?? "BTC/USD",
    roles: ["Scanner", "Analyste", "Exécuteur", "Auditeur"],
    strategy: strategyText(candidate),
    modelVersion: "discovery-paper-v1",
    learningState: confidence >= 70 ? "learning" : "needs_review",
    confidence,
    disciplineScore: elevatedRisk ? 76 : 82,
    performance30d: candidate.paper.pnlUsd,
    incidents7d: candidate.blockers.length,
    latencyMs: 0,
    autonomyLevel: 1,
    behavior: {
      aggressiveness: elevatedRisk ? 34 : 46,
      prudence: elevatedRisk ? 88 : 78,
      frequency: 42,
      adaptation: 62,
    },
    capabilities: {
      Scanner: clamp(confidence + 6, 50, 88),
      Analyste: clamp(confidence + 2, 50, 86),
      Exécuteur: elevatedRisk ? 68 : 74,
      Auditeur: 88,
    },
    allowedPairs: pairs,
    lastAction: candidate.nextAction,
  };
}

export async function loadDiscoveryPaperAgents() {
  const [state, library] = await Promise.all([readStrategyDiscoveryState(), readStrategyLibraryState()]);
  return state.candidates
    .filter((candidate) => candidate.stage === "paper_incubation")
    .filter((candidate) => candidate.visibility !== "protected" && candidate.visibility !== "invite-only")
    .filter((candidate) => !candidate.blockers.some((blocker) => blocker.toLowerCase().includes("source protégée") || blocker.toLowerCase().includes("invite-only")))
    .map((candidate) => candidateToPaperAgent(candidate, library.overrides[discoveryStrategyId(candidate.id)]?.status));
}

export async function syncDiscoveryPaperMetricsFromState(state: PaperTradingState) {
  const discovery = await readStrategyDiscoveryState();
  const paperCandidateIds = new Set(discovery.candidates.filter((candidate) => candidate.stage === "paper_incubation").map((candidate) => candidate.id));

  const metrics: StrategyDiscoveryPaperMetricInput[] = [...paperCandidateIds].map((candidateId) => {
    const agentId = paperAgentId(candidateId);
    const positions = state.positions.filter((position) => position.agentId === agentId);
    const events = state.events.filter((event) => event.agentId === agentId);
    const closed = positions.filter((position) => position.status === "closed");
    const open = positions.filter((position) => position.status === "open");
    const wins = closed.filter((position) => (position.realizedPnlUsd ?? 0) > 0);
    const losses = closed.filter((position) => (position.realizedPnlUsd ?? 0) < 0);
    const pnlUsd = positions.reduce((total, position) => total + (position.realizedPnlUsd ?? position.unrealizedPnlUsd ?? 0), 0);
    const winRate = closed.length ? wins.length / closed.length * 100 : 0;
    const status: StrategyDiscoveryPaperMetricInput["status"] = open.length
      ? "running"
      : closed.length >= 8 && winRate >= 55 && pnlUsd >= 0
        ? "passed"
        : closed.length >= 8 && (winRate < 45 || pnlUsd < 0)
          ? "failed"
          : positions.length
            ? "running"
            : events.length
              ? "watching"
              : "queued";

    return {
      id: candidateId,
      status,
      trades: positions.length,
      closedTrades: closed.length,
      openTrades: open.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate,
      pnlUsd,
    };
  });

  if (metrics.length) await updateStrategyDiscoveryPaperMetrics(metrics);
}

export function isDiscoveryPaperAgentId(agentId: string) {
  return Boolean(discoveryIdFromAgentId(agentId));
}
