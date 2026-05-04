import { agents } from "@/data/runtime/agents";
import { configuredLocalAnalysisProvider, extractJsonObject, runConfiguredLocalAnalysis } from "@/server/analysis/local-provider";
import type { LocalAnalysisProviderId } from "@/server/analysis/local-provider";
import { fetchCandles, fetchMarketAssets } from "@/server/adapters/market-data";
import { reviewStrategyPlanWithExternalAnalysis } from "@/server/paper-trading/analysis-provider";
import { auditorAgent, analystAgent, minimumPlanConfidence, riskAgent, scannerAgent } from "@/server/paper-trading/agents";
import { runCodexAnalystAgent, runCodexAuditorAgent, runCodexExecutorAgent, runCodexRiskAgent, runCodexScannerAgent, type CodexAnalystResult, type CodexAuditResult, type CodexExecutorResult, type CodexRiskResult, type CodexScannerResult } from "@/server/paper-trading/codex-agents";
import { isDiscoveryPaperAgentId, loadDiscoveryPaperAgents, syncDiscoveryPaperMetricsFromState } from "@/server/paper-trading/discovery-strategy-agents";
import { mergeEvents, readPaperTradingState, recomputeMetrics, writePaperTradingState } from "@/server/paper-trading/event-store";
import { evolveStrategyProfiles, getStrategyProfile } from "@/server/paper-trading/strategy-evolution";
import type { PaperCycleResult, PaperPosition, PaperTradingEvent, PaperTradingState, RiskDecision, StrategyPlan } from "@/server/paper-trading/types";
import { readKillSwitchState } from "@/server/safety/kill-switch-store";
import { readTradingAllocationConfig, type PaperTradingAllocationSettings } from "@/server/trading/allocation-store";
import type { Agent } from "@/types/agent";
import type { MarketAsset, MarketCandle } from "@/types/trading";

type CycleOptions = {
  targetAgentId?: string;
  targetPair?: string;
};

const MAX_PAIRS_PER_AGENT = Number(process.env.PAPER_TRADING_MAX_PAIRS_PER_AGENT || 10);
const MAX_DYNAMIC_OPPORTUNITIES_PER_AGENT = Number(process.env.PAPER_TRADING_MAX_DYNAMIC_OPPORTUNITIES_PER_AGENT || 2);
const PAIR_ALLOCATOR_TIMEOUT_MS = Math.max(1_000, Number(process.env.PAPER_TRADING_PAIR_ALLOCATOR_TIMEOUT_MS || 25_000));
const MAX_DISCOVERY_ALLOCATED_PAIRS = Math.max(1, Math.min(MAX_PAIRS_PER_AGENT, Number(process.env.PAPER_TRADING_MAX_DISCOVERY_PAIRS_PER_STRATEGY || 4)));
const MAX_PAIR_ALLOCATION_UNIVERSE = Math.max(MAX_DISCOVERY_ALLOCATED_PAIRS, Math.min(14, Number(process.env.PAPER_TRADING_PAIR_ALLOCATION_UNIVERSE || 8)));

function normalizeSymbol(symbol: string) {
  return symbol.toUpperCase().replace(/[^A-Z0-9]/g, "") || "BTCUSDT";
}

function toPair(symbol: string) {
  const compact = normalizeSymbol(symbol);
  if (compact.endsWith("USDC")) return `${compact.slice(0, -4)}/USDC`;
  if (compact.endsWith("USDT")) return `${compact.slice(0, -4)}/USDT`;
  return compact.endsWith("USD") ? `${compact.slice(0, -3)}/USD` : compact;
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function makeCycleId() {
  return `CYC-${Date.now().toString(36).toUpperCase()}`;
}

function openExposureUsd(state: PaperTradingState) {
  return state.positions
    .filter((position) => position.status === "open")
    .reduce((total, position) => total + position.notionalUsd, 0);
}

function openExposurePercent(state: PaperTradingState) {
  return state.metrics.equityUsd ? round(openExposureUsd(state) / state.metrics.equityUsd * 100, 2) : 0;
}

function makeEvent(input: Omit<PaperTradingEvent, "id" | "timestamp">): PaperTradingEvent {
  return {
    ...input,
    id: `EVT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    timestamp: new Date().toISOString(),
  };
}

function pairAssetMap(assets: MarketAsset[]) {
  const map = new Map<string, MarketAsset>();
  assets.forEach((asset) => {
    map.set(asset.symbol, asset);
    if (!asset.baseAsset) return;
    const quote = asset.quoteAsset || asset.symbol.split("/")[1] || "USD";
    map.set(`${asset.baseAsset}/${quote}`, asset);
    if (quote === "USD") map.set(`${asset.baseAsset}/USDT`, asset);
    if (quote === "USDT") map.set(`${asset.baseAsset}/USD`, asset);
  });
  return map;
}

function opportunityStrength(asset: MarketAsset) {
  if (asset.strength === "Très fort") return 12;
  if (asset.strength === "Fort") return 8;
  if (asset.strength === "Moyen") return 4;
  return 0;
}

function marketOpportunityScore(asset: MarketAsset) {
  return asset.confidence + Math.abs(asset.change24h) * 3 + asset.volatility * 2 + opportunityStrength(asset);
}

function agentCanScanOpportunity(agent: Agent, asset: MarketAsset) {
  if (!asset.authorized) return false;
  const hasOpportunity = Math.abs(asset.change24h) >= 0.8 || asset.confidence >= 62 || asset.strength !== "Faible";
  if (!hasOpportunity) return false;
  const strategy = agent.strategy.toLowerCase();
  if (strategy.includes("trend") && asset.change24h < -0.8) return false;
  return true;
}

function scopedAgents(options: CycleOptions, runtimeAgents: Agent[]) {
  return runtimeAgents.filter((agent) => {
    if (agent.mode !== "paper") return false;
    if (options.targetAgentId && agent.id !== options.targetAgentId) return false;
    return agent.status === "active";
  });
}

function cycleCandidateAgents(options: CycleOptions, runtimeAgents: Agent[]) {
  return runtimeAgents.filter((agent) => !options.targetAgentId || agent.id === options.targetAgentId);
}

function scopedPairs(agent: Agent, options: CycleOptions, assets: MarketAsset[] = []) {
  if (options.targetPair) return [toPair(options.targetPair)];
  const corePairs = [agent.focus, ...agent.allowedPairs].map(toPair);
  const coreSymbols = new Set(corePairs.map(normalizeSymbol));
  if (isDiscoveryPaperAgentId(agent.id)) {
    const assetsBySymbol = pairAssetMap(assets);
    return [...new Set(corePairs)]
      .toSorted((a, b) => marketOpportunityScore(assetsBySymbol.get(b) ?? emptyOpportunityAsset(b)) - marketOpportunityScore(assetsBySymbol.get(a) ?? emptyOpportunityAsset(a)))
      .slice(0, MAX_PAIRS_PER_AGENT);
  }
  const opportunityPairs = assets
    .filter((asset) => agentCanScanOpportunity(agent, asset))
    .toSorted((a, b) => marketOpportunityScore(b) - marketOpportunityScore(a))
    .map((asset) => toPair(asset.symbol))
    .filter((pair) => !coreSymbols.has(normalizeSymbol(pair)))
    .slice(0, MAX_DYNAMIC_OPPORTUNITIES_PER_AGENT);

  return [...new Set([...corePairs, ...opportunityPairs])].slice(0, MAX_PAIRS_PER_AGENT);
}

function emptyOpportunityAsset(symbol: string): MarketAsset {
  return {
    symbol,
    name: symbol,
    price: 0,
    change24h: 0,
    volume24h: "0",
    volatility: 0,
    confidence: 0,
    authorized: false,
    strength: "Faible",
  };
}

type StrategyPairAllocation = {
  enabled: boolean;
  providerId?: LocalAnalysisProviderId;
  status: "accepted" | "fallback" | "disabled" | "error";
  latencyMs: number;
  pairs: string[];
  candidatePairs: string[];
  detail: string;
  fallbackToDeterministic: boolean;
};

function textFrom(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function stringArrayFrom(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => textFrom(item, 32)).filter(Boolean).slice(0, maxItems);
}

function allocationUniverse(agent: Agent, assets: MarketAsset[]) {
  const corePairs = [agent.focus, ...agent.allowedPairs].map(toPair);
  const coreSymbols = new Set(corePairs.map(normalizeSymbol));
  const opportunityPairs = assets
    .filter((asset) => asset.authorized)
    .toSorted((a, b) => marketOpportunityScore(b) - marketOpportunityScore(a))
    .map((asset) => toPair(asset.symbol))
    .filter((pair) => !coreSymbols.has(normalizeSymbol(pair)))
    .slice(0, Math.max(0, MAX_PAIR_ALLOCATION_UNIVERSE - corePairs.length));

  return [...new Set([...corePairs, ...opportunityPairs])].slice(0, MAX_PAIR_ALLOCATION_UNIVERSE);
}

function deterministicAllocatedPairs(agent: Agent, assets: MarketAsset[]) {
  const assetsBySymbol = pairAssetMap(assets);
  return allocationUniverse(agent, assets)
    .toSorted((a, b) => marketOpportunityScore(assetsBySymbol.get(b) ?? emptyOpportunityAsset(b)) - marketOpportunityScore(assetsBySymbol.get(a) ?? emptyOpportunityAsset(a)))
    .slice(0, MAX_DISCOVERY_ALLOCATED_PAIRS);
}

function parsePairAllocation(text: string, allowedPairs: string[]) {
  const data = extractJsonObject(text);
  if (!data) return null;
  const allowed = new Set(allowedPairs.map(normalizeSymbol));
  const pairs = stringArrayFrom(data.pairs ?? data.selectedPairs ?? data.selection, MAX_DISCOVERY_ALLOCATED_PAIRS)
    .map(toPair)
    .filter((pair) => allowed.has(normalizeSymbol(pair)));
  const uniquePairs = [...new Set(pairs)].slice(0, MAX_DISCOVERY_ALLOCATED_PAIRS);
  const reason = textFrom(data.reason ?? data.rationale ?? data.detail, 380);

  return uniquePairs.length ? { pairs: uniquePairs, reason } : null;
}

function buildPairAllocatorPrompt(agent: Agent, assets: MarketAsset[]) {
  const candidates = allocationUniverse(agent, assets);
  const assetsBySymbol = pairAssetMap(assets);
  const market = candidates.map((pair) => {
    const asset = assetsBySymbol.get(pair) ?? emptyOpportunityAsset(pair);
    return {
      pair,
      preferredByStrategy: [agent.focus, ...agent.allowedPairs].map(toPair).includes(pair),
      price: asset.price,
      change24hPct: round(asset.change24h, 2),
      volatilityPct: round(asset.volatility, 2),
      confidence: asset.confidence,
      strength: asset.strength ?? "Faible",
      signal: asset.signal ?? "",
      authorized: asset.authorized,
    };
  });

  return [
    "Tu es l'allocateur IA des tests paper trading.",
    "Ta mission: choisir les paires à observer pour cette stratégie, pas ouvrir d'ordre.",
    `Choisis entre 1 et ${MAX_DISCOVERY_ALLOCATED_PAIRS} paires exactement parmi la liste fournie.`,
    "Ne force pas BTC/USD: sélectionne BTC seulement si les données le justifient.",
    "Favorise la compatibilité stratégie/marché, la liquidité implicite, la volatilité exploitable et la diversification.",
    "Réponds uniquement en JSON compact: {\"pairs\":[\"SOL/USD\",\"ETH/USD\"],\"reason\":\"...\"}.",
    "",
    `Stratégie: ${agent.name}`,
    `Texte stratégie: ${agent.strategy}`,
    `Paires préférées/importées: ${[agent.focus, ...agent.allowedPairs].map(toPair).join(", ")}`,
    `Confiance stratégie: ${agent.confidence}/100 · prudence ${agent.behavior.prudence}/100 · agressivité ${agent.behavior.aggressiveness}/100`,
    "",
    `Marchés candidats: ${JSON.stringify(market)}`,
  ].join("\n");
}

async function allocateDiscoveryStrategyPairs(agent: Agent, options: CycleOptions, assets: MarketAsset[]): Promise<StrategyPairAllocation> {
  if (options.targetPair) {
    const pair = toPair(options.targetPair);
    return {
      enabled: false,
      status: "disabled",
      latencyMs: 0,
      pairs: [pair],
      candidatePairs: [pair],
      detail: `Paire ciblée manuellement: ${pair}.`,
      fallbackToDeterministic: false,
    };
  }

  const candidatePairs = allocationUniverse(agent, assets);
  const fallbackPairs = deterministicAllocatedPairs(agent, assets);
  const providerId = configuredLocalAnalysisProvider() ?? undefined;
  if (!providerId) {
    return {
      enabled: false,
      status: "disabled",
      latencyMs: 0,
      pairs: fallbackPairs,
      candidatePairs,
      detail: `Allocation IA désactivée: repli marché sur ${fallbackPairs.join(", ")}.`,
      fallbackToDeterministic: true,
    };
  }

  const response = await runConfiguredLocalAnalysis(buildPairAllocatorPrompt(agent, assets), {
    providerId,
    timeoutMs: PAIR_ALLOCATOR_TIMEOUT_MS,
  });
  const allocation = response.ok ? parsePairAllocation(response.text, candidatePairs) : null;

  if (allocation) {
    return {
      enabled: true,
      providerId: response.providerId,
      status: "accepted",
      latencyMs: response.latencyMs,
      pairs: allocation.pairs,
      candidatePairs,
      detail: allocation.reason || `Allocation ${response.providerId} sur ${allocation.pairs.join(", ")}.`,
      fallbackToDeterministic: false,
    };
  }

  return {
    enabled: response.enabled,
    providerId: response.providerId,
    status: response.ok ? "fallback" : "error",
    latencyMs: response.latencyMs,
    pairs: fallbackPairs,
    candidatePairs,
    detail: response.ok
      ? `Réponse IA inexploitable: repli marché sur ${fallbackPairs.join(", ")}.`
      : `Allocation IA indisponible (${response.error ?? "erreur inconnue"}): repli marché sur ${fallbackPairs.join(", ")}.`,
    fallbackToDeterministic: true,
  };
}

type AgentCycleStats = {
  expectedPairs: number;
  watchedPairs: number;
  dataGaps: number;
  ignoredSignals: number;
  signals: number;
  plans: number;
  riskBlocks: number;
  auditBlocks: number;
  executionBlocks: number;
  orders: number;
};

function emptyAgentCycleStats(expectedPairs: number): AgentCycleStats {
  return {
    expectedPairs,
    watchedPairs: 0,
    dataGaps: 0,
    ignoredSignals: 0,
    signals: 0,
    plans: 0,
    riskBlocks: 0,
    auditBlocks: 0,
    executionBlocks: 0,
    orders: 0,
  };
}

function updatePositionMark(position: PaperPosition, lastCandle: MarketCandle | undefined, currentPrice: number, cycleId: string): { position: PaperPosition; event?: PaperTradingEvent } {
  if (position.status === "closed") return { position };
  const price = currentPrice || position.currentPrice;
  const hitStop = lastCandle ? position.side === "LONG" ? lastCandle.low <= position.stopLoss : lastCandle.high >= position.stopLoss : false;
  const hitTakeProfit = lastCandle ? position.side === "LONG" ? lastCandle.high >= position.takeProfit : lastCandle.low <= position.takeProfit : false;
  const exitPrice = hitStop ? position.stopLoss : hitTakeProfit ? position.takeProfit : undefined;
  const markPrice = exitPrice ?? price;
  const direction = position.side === "LONG" ? 1 : -1;
  const pnlUsd = (markPrice - position.entryPrice) * position.quantity * direction;
  const pnlPercent = position.notionalUsd ? pnlUsd / position.notionalUsd * 100 : 0;

  if (!exitPrice) {
    return {
      position: {
        ...position,
        currentPrice: round(markPrice, 8),
        unrealizedPnlUsd: round(pnlUsd, 2),
        pnlPercent: round(pnlPercent, 3),
      },
    };
  }

  const closed: PaperPosition = {
    ...position,
    status: "closed",
    closedAt: new Date().toISOString(),
    currentPrice: round(exitPrice, 8),
    exitPrice: round(exitPrice, 8),
    realizedPnlUsd: round(pnlUsd, 2),
    unrealizedPnlUsd: 0,
    pnlPercent: round(pnlPercent, 3),
    exitReason: hitTakeProfit ? "take-profit paper atteint" : "stop-loss paper atteint",
  };

  return {
    position: closed,
    event: makeEvent({
      cycleId,
      decisionId: position.decisionId,
      type: "trade_closed",
      severity: pnlUsd >= 0 ? "success" : "danger",
      agentId: position.agentId,
      agentName: position.agentName,
      pair: position.pair,
      title: `${position.pair} clôturé en paper`,
      detail: `${closed.exitReason} · P&L ${round(pnlUsd, 2)} $`,
      payload: { positionId: position.id, exitPrice: closed.exitPrice ?? null, pnlUsd: closed.realizedPnlUsd ?? 0 },
    }),
  };
}

function tradeAmountLimitUsd(state: PaperTradingState, allocation: PaperTradingAllocationSettings) {
  const equityUsd = Math.max(1, state.metrics.equityUsd);
  const marginUsd = allocation.sizingMode === "fixed_usd"
    ? allocation.tradeAmountUsd
    : equityUsd * allocation.tradeAmountPercent / 100;
  return Math.max(0, marginUsd * allocation.leverage);
}

function cappedRiskPercent(risk: RiskDecision, allocation: PaperTradingAllocationSettings) {
  return round(Math.min(risk.adjustedRiskPercent, allocation.riskPerTradePercent), 2);
}

function localPeriodStart(daysBack = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  if (daysBack) date.setDate(date.getDate() - daysBack);
  return date.getTime();
}

function realizedPnlSince(state: PaperTradingState, sinceMs: number) {
  return state.positions
    .filter((position) => position.status === "closed")
    .filter((position) => new Date(position.closedAt ?? position.openedAt).getTime() >= sinceMs)
    .reduce((total, position) => total + (position.realizedPnlUsd ?? 0), 0);
}

function dailyDrawdownPercent(state: PaperTradingState) {
  return round(Math.max(0, -realizedPnlSince(state, localPeriodStart()) / Math.max(state.capitalUsd, 1) * 100), 2);
}

function positionFromPlan(plan: StrategyPlan, adjustedRiskPercent: number, state: PaperTradingState, allocation: PaperTradingAllocationSettings): PaperPosition | null {
  const riskUsd = Math.max(1, state.metrics.equityUsd * adjustedRiskPercent / 100);
  const rawQuantity = riskUsd / Math.max(Math.abs(plan.entryPrice - plan.stopLoss), plan.entryPrice * 0.0005);
  const exposureLimitUsd = state.metrics.equityUsd * allocation.maxPortfolioExposurePercent / 100;
  const remainingExposureUsd = Math.max(0, exposureLimitUsd - openExposureUsd(state));
  const maxNotional = Math.min(tradeAmountLimitUsd(state, allocation), remainingExposureUsd);
  const quantity = maxNotional > 0 ? Math.min(rawQuantity, maxNotional / plan.entryPrice) : 0;
  const notionalUsd = quantity * plan.entryPrice;
  if (quantity <= 0 || notionalUsd <= 0) return null;

  return {
    id: `PAPER-${Date.now().toString(36).toUpperCase()}-${plan.agent.id}-${normalizeSymbol(plan.pair)}`,
    decisionId: plan.decisionId,
    agentId: plan.agent.id,
    agentName: plan.agent.name,
    pair: plan.pair,
    side: plan.side,
    status: "open",
    openedAt: new Date().toISOString(),
    entryPrice: plan.entryPrice,
    currentPrice: plan.entryPrice,
    stopLoss: plan.stopLoss,
    takeProfit: plan.takeProfit,
    quantity: round(quantity, 8),
    notionalUsd: round(notionalUsd, 2),
    marginUsd: round(notionalUsd / allocation.leverage, 2),
    leverage: allocation.leverage,
    riskUsd: round(Math.abs(plan.entryPrice - plan.stopLoss) * quantity, 2),
    riskPercent: adjustedRiskPercent,
    confidence: plan.confidence,
    rationale: plan.rationale,
    unrealizedPnlUsd: 0,
    pnlPercent: 0,
  };
}

async function fetchCandlesSafe(pair: string) {
  try {
    return await fetchCandles(normalizeSymbol(pair), "1m", 96);
  } catch {
    return [];
  }
}

function deterministicScannerResult(): CodexScannerResult {
  return { enabled: false, status: "skipped", latencyMs: 0, detail: "Scanner déterministe actif pour test paper stratégie.", signal: null, fallbackToDeterministic: true };
}

function deterministicAnalystResult(): CodexAnalystResult {
  return { enabled: false, status: "skipped", latencyMs: 0, detail: "Analyste déterministe actif pour test paper stratégie.", plan: null, fallbackToDeterministic: true };
}

function deterministicRiskResult(): CodexRiskResult {
  return { enabled: false, status: "skipped", latencyMs: 0, detail: "Risk Engine déterministe actif pour test paper stratégie.", risk: null, fallbackToDeterministic: true };
}

function deterministicAuditResult(risk: RiskDecision): CodexAuditResult {
  return { enabled: false, status: "skipped", latencyMs: 0, allowed: false, reasons: [], severity: risk.severity, fallbackToDeterministic: true };
}

function deterministicExecutorResult(risk: RiskDecision): CodexExecutorResult {
  return { enabled: false, status: "skipped", latencyMs: 0, execute: risk.allowed, riskPercent: null, detail: "Exécuteur déterministe actif pour test paper stratégie.", fallbackToDeterministic: true };
}

async function writePaperCycleState(state: PaperTradingState) {
  const written = await writePaperTradingState(state);
  await syncDiscoveryPaperMetricsFromState(written).catch(() => {});
  return written;
}

export async function runPaperTradingCycle(options: CycleOptions = {}): Promise<PaperCycleResult> {
  const cycleId = makeCycleId();
  const events: PaperTradingEvent[] = [];
  let state = await readPaperTradingState();
  const allocation = await readTradingAllocationConfig();
  const paperAllocation = allocation.paper;
  const assets = await fetchMarketAssets();
  const runtimeAgents = [...(await loadDiscoveryPaperAgents()), ...agents];
  const assetsByPair = pairAssetMap(assets);
  const candidateAgents = cycleCandidateAgents(options, runtimeAgents);
  const activeAgents = scopedAgents(options, runtimeAgents);
  const pairAllocations = new Map<string, StrategyPairAllocation>();
  const pairsByAgent = new Map(
    await Promise.all(activeAgents.map(async (agent) => {
      if (!isDiscoveryPaperAgentId(agent.id)) return [agent.id, scopedPairs(agent, options, assets)] as const;
      const allocation = await allocateDiscoveryStrategyPairs(agent, options, assets);
      pairAllocations.set(agent.id, allocation);
      return [agent.id, allocation.pairs] as const;
    })),
  );
  const agentStats = new Map<string, AgentCycleStats>();
  activeAgents.forEach((agent) => agentStats.set(agent.id, emptyAgentCycleStats((pairsByAgent.get(agent.id) ?? []).length)));

  for (const agent of activeAgents) {
    const allocation = pairAllocations.get(agent.id);
    if (!allocation) continue;
    const severity = allocation.status === "accepted" ? "ai" : allocation.status === "disabled" ? "info" : "warning";
    const provider = allocation.providerId ?? "codex";
    events.push(makeEvent({
      cycleId,
      type: "strategy_adjustment",
      severity,
      agentId: agent.id,
      agentName: agent.name,
      pair: "ALL",
      title: allocation.status === "accepted"
        ? `Allocation ${provider}: ${allocation.pairs.join(", ")}`
        : allocation.status === "disabled"
          ? "Allocation paper déterministe"
          : `Allocation ${provider} en repli déterministe`,
      detail: allocation.detail,
      payload: {
        provider,
        status: allocation.status,
        latencyMs: allocation.latencyMs,
        selectedPairs: allocation.pairs,
        candidatePairs: allocation.candidatePairs,
        fallbackToDeterministic: allocation.fallbackToDeterministic,
      },
    }));
  }

  const neededPairs = new Set<string>();
  state.positions.filter((position) => position.status === "open").forEach((position) => neededPairs.add(position.pair));
  activeAgents.forEach((agent) => (pairsByAgent.get(agent.id) ?? []).forEach((pair) => neededPairs.add(pair)));

  const candlesByPair = new Map<string, MarketCandle[]>();
  await Promise.all(
    [...neededPairs].map(async (pair) => {
      candlesByPair.set(pair, await fetchCandlesSafe(pair));
    }),
  );

  state = {
    ...state,
    positions: state.positions.map((position) => {
      const asset = assetsByPair.get(position.pair);
      const candles = candlesByPair.get(position.pair) ?? [];
      const result = updatePositionMark(position, candles.at(-1), asset?.price ?? candles.at(-1)?.close ?? position.currentPrice, cycleId);
      if (result.event) events.push(result.event);
      return result.position;
    }),
  };
  state = recomputeMetrics(state);

  const killSwitch = await readKillSwitchState();
  if (killSwitch.active) {
    events.push(makeEvent({
      cycleId,
      type: "kill_switch",
      severity: "danger",
      agentId: "risk-engine",
      agentName: "Risk Engine",
      pair: options.targetPair ? toPair(options.targetPair) : "ALL",
      title: "Kill switch actif",
      detail: `Aucune nouvelle position ouverte · ${killSwitch.reason}`,
      payload: { active: true, reason: killSwitch.reason },
    }));
    state = await writePaperCycleState(mergeEvents(state, events));
    return { state, cycleId, events };
  }

  if (!paperAllocation.enabled) {
    events.push(makeEvent({
      cycleId,
      type: "supervisor_review",
      severity: "warning",
      agentId: "supervisor",
      agentName: "Superviseur",
      pair: options.targetPair ? toPair(options.targetPair) : "ALL",
      title: "Paper trading désactivé",
      detail: "Aucune nouvelle position paper ouverte: l'allocation utilisateur est désactivée.",
      payload: { paperEnabled: false },
    }));
    state = await writePaperCycleState(mergeEvents(state, events));
    return { state, cycleId, events };
  }

  for (const agent of candidateAgents) {
    if (agent.mode === "paper" && agent.status === "active") continue;
    const reason = agent.mode !== "paper" ? `mode ${agent.mode} hors boucle paper` : `statut ${agent.status}`;
    events.push(makeEvent({
      cycleId,
      type: "agent_standby",
      severity: "warning",
      agentId: agent.id,
      agentName: agent.name,
      pair: options.targetPair ? toPair(options.targetPair) : agent.focus,
      title: `${agent.name} en veille`,
      detail: `${reason}: aucun scan paper lancé sur ce cycle. Dernière action: ${agent.lastAction}.`,
      payload: { status: agent.status, mode: agent.mode, focus: agent.focus, allowedPairs: agent.allowedPairs },
    }));
  }

  if (!activeAgents.length) {
    events.push(makeEvent({
      cycleId,
      type: "agent_standby",
      severity: "warning",
      agentId: "supervisor",
      agentName: "Superviseur",
      pair: options.targetPair ? toPair(options.targetPair) : "ALL",
      title: "Aucun agent actif dans la boucle paper",
      detail: options.targetAgentId ? "L'agent ciblé n'est pas actif en paper trading." : "Aucun agent actif ne peut scanner, analyser ou exécuter ce cycle.",
      payload: { targetAgentId: options.targetAgentId ?? null, targetPair: options.targetPair ? toPair(options.targetPair) : null },
    }));
  }

  for (const agent of activeAgents) {
    const deterministicStrategyTest = isDiscoveryPaperAgentId(agent.id);
    const runtimePairs = pairsByAgent.get(agent.id) ?? scopedPairs(agent, options, assets);
    for (const pair of runtimePairs) {
      const asset = assetsByPair.get(pair);
      const candles = candlesByPair.get(pair) ?? [];
      const stats = agentStats.get(agent.id);
      if (!asset || candles.length < 40) {
        if (stats) {
          stats.dataGaps += 1;
          stats.executionBlocks += 1;
        }
        events.push(makeEvent({
          cycleId,
          type: "agent_standby",
          severity: "warning",
          agentId: agent.id,
          agentName: agent.name,
          pair,
          title: `${agent.name} attend des données sur ${pair}`,
          detail: !asset
            ? "Marché absent du provider: scanner, analyste, risque et exécuteur restent en veille."
            : `OHLC insuffisant (${candles.length}/40 bougies): scanner, analyste, risque et exécuteur restent en veille.`,
          payload: { reason: !asset ? "missing-market" : "insufficient-candles", candles: candles.length, requiredCandles: 40 },
        }));
        continue;
      }
      if (stats) stats.watchedPairs += 1;

      events.push(makeEvent({
        cycleId,
        type: "market_snapshot",
        severity: "info",
        agentId: agent.id,
        agentName: agent.name,
        pair,
        title: `${agent.name} observe ${pair}`,
        detail: `Prix ${round(asset.price, 8)} · 24h ${round(asset.change24h, 2)}% · volatilité ${round(asset.volatility, 2)}%`,
        payload: { price: asset.price, change24h: round(asset.change24h, 2), confidence: asset.confidence },
      }));

      const codexScanner = deterministicStrategyTest ? deterministicScannerResult() : await runCodexScannerAgent(agent, asset, candles);
      if (codexScanner.enabled) {
        events.push(makeEvent({
          cycleId,
          type: "strategy_adjustment",
          severity: codexScanner.status === "accepted" ? "ai" : codexScanner.status === "rejected" ? "warning" : "danger",
          agentId: agent.id,
          agentName: agent.name,
          pair,
          title: codexScanner.status === "accepted" ? `Scanner ${codexScanner.providerId} détecte un biais` : codexScanner.status === "rejected" ? `Scanner ${codexScanner.providerId} ignore la paire` : `Scanner ${codexScanner.providerId ?? "codex"} indisponible`,
          detail: codexScanner.detail,
          payload: {
            provider: codexScanner.providerId ?? "codex",
            status: codexScanner.status,
            latencyMs: codexScanner.latencyMs,
            codexAgentRole: "scanner",
            fallbackToDeterministic: codexScanner.fallbackToDeterministic,
          },
        }));
      }

      const signal = codexScanner.signal ?? (codexScanner.enabled && !codexScanner.fallbackToDeterministic ? null : scannerAgent(agent, asset, candles));
      if (!signal) {
        if (stats) stats.ignoredSignals += 1;
        if (!codexScanner.enabled) {
          events.push(makeEvent({
            cycleId,
            type: "agent_standby",
            severity: "info",
            agentId: agent.id,
            agentName: agent.name,
            pair,
            title: `${agent.name} sans signal exploitable`,
            detail: "Scanner sans biais exploitable: l'analyste, le risque et l'exécuteur restent en veille sur cette paire.",
            payload: { reason: "no-signal" },
          }));
        }
        continue;
      }
      if (stats) {
        if (signal.direction === "neutral") stats.ignoredSignals += 1;
        else stats.signals += 1;
      }

      events.push(makeEvent({
        cycleId,
        type: signal.direction === "neutral" ? "signal_ignored" : "signal_detected",
        severity: signal.direction === "neutral" ? "warning" : "success",
        agentId: agent.id,
        agentName: agent.name,
        pair,
        title: signal.direction === "neutral" ? "Signal ignoré" : `Signal ${signal.direction}`,
        detail: signal.reason,
        payload: { momentumPct: signal.momentumPct, volumeRatio: signal.volumeRatio, signalConfidence: signal.confidence },
      }));

      const profile = getStrategyProfile(state, agent);
      const codexAnalyst = deterministicStrategyTest ? deterministicAnalystResult() : await runCodexAnalystAgent(signal, cycleId, profile);
      if (codexAnalyst.enabled) {
        events.push(makeEvent({
          cycleId,
          decisionId: codexAnalyst.plan?.decisionId,
          type: codexAnalyst.status === "rejected" ? "analysis_rejected" : "strategy_adjustment",
          severity: codexAnalyst.status === "accepted" ? "ai" : codexAnalyst.status === "rejected" ? "warning" : "danger",
          agentId: agent.id,
          agentName: agent.name,
          pair,
          title: codexAnalyst.status === "accepted" ? `Analyste ${codexAnalyst.providerId} prépare un plan` : codexAnalyst.status === "rejected" ? `Analyste ${codexAnalyst.providerId} rejette le signal` : `Analyste ${codexAnalyst.providerId ?? "codex"} indisponible`,
          detail: codexAnalyst.detail,
          payload: {
            provider: codexAnalyst.providerId ?? "codex",
            status: codexAnalyst.status,
            latencyMs: codexAnalyst.latencyMs,
            codexAgentRole: "analyst",
            fallbackToDeterministic: codexAnalyst.fallbackToDeterministic,
          },
        }));
      }

      const candidatePlan = codexAnalyst.plan ?? (codexAnalyst.enabled && !codexAnalyst.fallbackToDeterministic ? null : analystAgent(signal, cycleId, profile));
      if (!candidatePlan) {
        if (stats) stats.executionBlocks += 1;
        if (signal.direction !== "neutral") {
          const planThreshold = minimumPlanConfidence(profile);
          events.push(makeEvent({
            cycleId,
            type: "analysis_rejected",
            severity: "warning",
            agentId: agent.id,
            agentName: agent.name,
            pair,
            title: "Analyste sans ordre",
            detail: `Signal non transformé en plan · confiance ${signal.confidence}/${planThreshold} · seuil risque ${profile.minConfidence} · volume x${signal.volumeRatio}/${profile.minVolumeRatio}`,
            payload: {
              signalConfidence: signal.confidence,
              planConfidenceThreshold: planThreshold,
              riskConfidenceThreshold: profile.minConfidence,
              volumeRatio: signal.volumeRatio,
              minVolumeRatio: profile.minVolumeRatio,
              direction: signal.direction,
            },
          }));
        }
        continue;
      }

      const planFromCodexAnalyst = codexAnalyst.enabled && codexAnalyst.plan?.decisionId === candidatePlan.decisionId;
      const review = planFromCodexAnalyst || deterministicStrategyTest
        ? {
            enabled: false,
            status: "skipped" as const,
            latencyMs: 0,
            detail: planFromCodexAnalyst ? "Plan déjà produit par l'analyste Codex." : "Test paper stratégie: revue externe ignorée, règles déterministes utilisées.",
            plan: candidatePlan,
          }
        : await reviewStrategyPlanWithExternalAnalysis(signal, candidatePlan, profile);
      if (review.enabled) {
        events.push(makeEvent({
          cycleId,
          decisionId: candidatePlan.decisionId,
          type: "strategy_adjustment",
          severity: review.status === "accepted" ? "ai" : review.status === "rejected" ? "warning" : "danger",
          agentId: agent.id,
          agentName: agent.name,
          pair,
          title: review.status === "accepted" ? `Analyse ${review.providerId} valide le plan` : review.status === "rejected" ? `Analyse ${review.providerId} rejette le plan` : `Analyse ${review.providerId} indisponible`,
          detail: review.detail,
          payload: {
            provider: review.providerId ?? "external",
            status: review.status,
            latencyMs: review.latencyMs,
            analysisOnly: true,
          },
        }));
      }

      const plan = review.plan;
      if (!plan) {
        if (stats) stats.executionBlocks += 1;
        continue;
      }
      if (stats) stats.plans += 1;

      events.push(makeEvent({
        cycleId,
        decisionId: plan.decisionId,
        type: "strategy_plan",
        severity: "ai",
        agentId: agent.id,
        agentName: agent.name,
        pair,
        title: `${agent.name} prépare un plan ${plan.side}`,
        detail: plan.rationale,
        payload: { side: plan.side, entryPrice: plan.entryPrice, stopLoss: plan.stopLoss, takeProfit: plan.takeProfit, confidence: plan.confidence, volumeRatio: plan.volumeRatio },
      }));

      const currentDailyDrawdown = dailyDrawdownPercent(state);
      const deterministicRisk = riskAgent(
        plan,
        state.positions,
        currentDailyDrawdown,
        profile,
        openExposurePercent(state),
        paperAllocation.maxPortfolioExposurePercent,
        paperAllocation.dailyLossLimitPercent,
        runtimePairs,
      );
      const codexRisk = deterministicStrategyTest ? deterministicRiskResult() : await runCodexRiskAgent(plan, deterministicRisk);
      const rawRisk = codexRisk.risk ?? deterministicRisk;
      const allocationRiskPercent = cappedRiskPercent(rawRisk, paperAllocation);
      const risk: RiskDecision = {
        ...rawRisk,
        adjustedRiskPercent: allocationRiskPercent,
        reasons: allocationRiskPercent < rawRisk.adjustedRiskPercent
          ? [...rawRisk.reasons, `allocation utilisateur limite le risque à ${allocationRiskPercent}%`]
          : rawRisk.reasons,
      };
      events.push(makeEvent({
        cycleId,
        decisionId: plan.decisionId,
        type: "risk_check",
        severity: risk.severity,
        agentId: agent.id,
        agentName: agent.name,
        pair,
        title: codexRisk.enabled ? (risk.allowed ? `Risk Engine ${codexRisk.providerId} valide` : `Risk Engine ${codexRisk.providerId} bloque`) : risk.allowed ? "Risque validé" : "Risque bloque le plan",
        detail: risk.reasons.join(" · "),
        payload: codexRisk.enabled
          ? {
              allowed: risk.allowed,
              adjustedRiskPercent: risk.adjustedRiskPercent,
              executorMode: risk.executorMode,
              reasons: risk.reasons,
              provider: codexRisk.providerId ?? "codex",
              status: codexRisk.status,
              latencyMs: codexRisk.latencyMs,
              codexAgentRole: "risk",
              fallbackToDeterministic: codexRisk.fallbackToDeterministic,
              deterministicAllowed: deterministicRisk.allowed,
              dailyDrawdownPercent: currentDailyDrawdown,
              dailyLossLimitPercent: paperAllocation.dailyLossLimitPercent,
            }
          : { allowed: risk.allowed, adjustedRiskPercent: risk.adjustedRiskPercent, executorMode: risk.executorMode, reasons: risk.reasons, dailyDrawdownPercent: currentDailyDrawdown, dailyLossLimitPercent: paperAllocation.dailyLossLimitPercent },
      }));
      if (!risk.allowed && stats) stats.riskBlocks += 1;

      const codexAudit = deterministicStrategyTest ? deterministicAuditResult(risk) : await runCodexAuditorAgent(plan, risk);
      const audit = codexAudit.enabled && !codexAudit.fallbackToDeterministic
        ? {
            allowed: codexAudit.allowed,
            reasons: codexAudit.reasons,
            severity: codexAudit.severity,
          }
        : auditorAgent(plan, risk);
      events.push(makeEvent({
        cycleId,
        decisionId: plan.decisionId,
        type: "audit_check",
        severity: audit.severity,
        agentId: agent.id,
        agentName: agent.name,
        pair,
        title: codexAudit.enabled ? (audit.allowed ? `Auditeur ${codexAudit.providerId} OK` : `Auditeur ${codexAudit.providerId} refuse`) : audit.allowed ? "Auditeur OK" : "Auditeur refuse",
        detail: audit.reasons.join(" · "),
        payload: codexAudit.enabled
          ? {
              allowed: audit.allowed,
              reasons: audit.reasons,
              provider: codexAudit.providerId ?? "codex",
              status: codexAudit.status,
              latencyMs: codexAudit.latencyMs,
              codexAgentRole: "auditor",
              fallbackToDeterministic: codexAudit.fallbackToDeterministic,
            }
          : { allowed: audit.allowed, reasons: audit.reasons },
      }));
      if (!audit.allowed && stats) stats.auditBlocks += 1;

      if (!audit.allowed) continue;
      if (state.positions.filter((position) => position.status === "open").length >= paperAllocation.maxOpenPositions) {
        if (stats) stats.executionBlocks += 1;
        events.push(makeEvent({
          cycleId,
          decisionId: plan.decisionId,
          type: "agent_standby",
          severity: "warning",
          agentId: agent.id,
          agentName: agent.name,
          pair,
          title: "Exécution en veille",
          detail: `Plafond de positions paper atteint (${paperAllocation.maxOpenPositions}). Le plan est conservé au journal mais aucun ordre n'est ouvert.`,
          payload: { reason: "max-open-positions", maxOpenPositions: paperAllocation.maxOpenPositions },
        }));
        continue;
      }

      const codexExecutor = deterministicStrategyTest ? deterministicExecutorResult(risk) : await runCodexExecutorAgent(plan, risk);
      if (codexExecutor.enabled) {
        events.push(makeEvent({
          cycleId,
          decisionId: plan.decisionId,
          type: codexExecutor.execute ? "strategy_adjustment" : "analysis_rejected",
          severity: codexExecutor.execute ? "ai" : codexExecutor.status === "error" ? "danger" : "warning",
          agentId: agent.id,
          agentName: agent.name,
          pair,
          title: codexExecutor.execute ? `Exécuteur ${codexExecutor.providerId} confirme` : `Exécuteur ${codexExecutor.providerId ?? "codex"} bloque`,
          detail: codexExecutor.detail,
          payload: {
            provider: codexExecutor.providerId ?? "codex",
            status: codexExecutor.status,
            latencyMs: codexExecutor.latencyMs,
            codexAgentRole: "executor",
            execute: codexExecutor.execute,
            fallbackToDeterministic: codexExecutor.fallbackToDeterministic,
            riskPercent: codexExecutor.riskPercent ?? risk.adjustedRiskPercent,
          },
        }));
      }

      if (!codexExecutor.execute) {
        if (stats) stats.executionBlocks += 1;
        continue;
      }

      const executionRiskPercent = codexExecutor.riskPercent ?? risk.adjustedRiskPercent;
      const position = positionFromPlan(plan, executionRiskPercent, state, paperAllocation);
      if (!position) {
        if (stats) stats.executionBlocks += 1;
        events.push(makeEvent({
          cycleId,
          decisionId: plan.decisionId,
          type: "analysis_rejected",
          severity: "warning",
          agentId: agent.id,
          agentName: agent.name,
          pair,
          title: "Allocation paper bloque l'ordre",
          detail: `Montant/trade ou exposition max insuffisante · limite ${paperAllocation.maxPortfolioExposurePercent}% · levier x${paperAllocation.leverage}`,
          payload: {
            tradeAmountPercent: paperAllocation.tradeAmountPercent,
            tradeAmountUsd: paperAllocation.tradeAmountUsd,
            leverage: paperAllocation.leverage,
            maxPortfolioExposurePercent: paperAllocation.maxPortfolioExposurePercent,
          },
        }));
        continue;
      }
      state = { ...state, positions: [position, ...state.positions] };
      state = recomputeMetrics(state);
      if (stats) stats.orders += 1;
      events.push(makeEvent({
        cycleId,
        decisionId: plan.decisionId,
        type: "paper_order",
        severity: "success",
        agentId: agent.id,
        agentName: agent.name,
        pair,
        title: `Ordre paper ${plan.side} ouvert`,
        detail: `Entrée ${round(plan.entryPrice, 8)} · SL ${round(plan.stopLoss, 8)} · TP ${round(plan.takeProfit, 8)} · risque ${executionRiskPercent}% · levier x${paperAllocation.leverage} · exécution ${risk.executorMode}`,
        payload: { positionId: position.id, notionalUsd: position.notionalUsd, marginUsd: position.marginUsd ?? null, leverage: paperAllocation.leverage, riskUsd: position.riskUsd, executorMode: risk.executorMode, codexExecutor: codexExecutor.enabled },
      }));
    }
  }

  for (const agent of activeAgents) {
    const stats = agentStats.get(agent.id) ?? emptyAgentCycleStats((pairsByAgent.get(agent.id) ?? []).length);
    const hasActivity = stats.signals > 0 || stats.plans > 0 || stats.orders > 0;
    const fullDataGap = stats.expectedPairs > 0 && stats.dataGaps >= stats.expectedPairs;
    const severity = stats.orders > 0 ? "success" : fullDataGap ? "warning" : hasActivity ? "ai" : "info";
    const title = stats.orders > 0
      ? `${agent.name} a exécuté ${stats.orders} ordre(s) paper`
      : hasActivity
        ? `${agent.name} actif dans la boucle`
        : `${agent.name} en veille active`;
    const blocked = stats.riskBlocks + stats.auditBlocks + stats.executionBlocks;
    const detail = `${stats.watchedPairs}/${stats.expectedPairs} paire(s) observée(s) · ${stats.signals} signal(aux) · ${stats.plans} plan(s) · ${stats.orders} ordre(s) · ${blocked} blocage(s).`;

    events.push(makeEvent({
      cycleId,
      type: "agent_heartbeat",
      severity,
      agentId: agent.id,
      agentName: agent.name,
      pair: options.targetPair ? toPair(options.targetPair) : "ALL",
      title,
      detail: fullDataGap ? `${detail} Données marché insuffisantes: l'agent reste en veille.` : detail,
      payload: {
        expectedPairs: stats.expectedPairs,
        watchedPairs: stats.watchedPairs,
        dataGaps: stats.dataGaps,
        ignoredSignals: stats.ignoredSignals,
        signals: stats.signals,
        plans: stats.plans,
        riskBlocks: stats.riskBlocks,
        auditBlocks: stats.auditBlocks,
        executionBlocks: stats.executionBlocks,
        orders: stats.orders,
        roles: agent.roles,
        runtimePairs: pairsByAgent.get(agent.id) ?? [],
      },
    }));
  }

  const evolution = evolveStrategyProfiles(recomputeMetrics({ ...state, events: [...state.events, ...events] }));
  state = { ...state, strategyProfiles: evolution.profiles };
  for (const change of evolution.changes) {
    events.push(makeEvent({
      cycleId,
      type: "strategy_adjustment",
      severity: "ai",
      agentId: change.after.agentId,
      agentName: agents.find((agent) => agent.id === change.after.agentId)?.name ?? change.after.agentId,
      pair: "ALL",
      title: `Stratégie ${change.after.strategy} ajustée`,
      detail: change.reason,
      payload: {
        minConfidence: change.after.minConfidence,
        minVolumeRatio: change.after.minVolumeRatio,
        cooldownMinutes: change.after.cooldownMinutes,
        riskMultiplier: change.after.riskMultiplier,
      },
    }));
  }

  const reviewState = recomputeMetrics(mergeEvents(state, events));
  const supervisorDetail = reviewState.metrics.openPositions
    ? `${reviewState.metrics.openPositions} position(s) ouvertes · P&L latent ${reviewState.metrics.unrealizedPnlUsd} $ · discipline ${reviewState.metrics.disciplineScore}/100`
    : `Aucune position ouverte · ${reviewState.metrics.refusedSignals} refus cumulés · discipline ${reviewState.metrics.disciplineScore}/100`;

  events.push(makeEvent({
    cycleId,
    type: "supervisor_review",
    severity: reviewState.metrics.disciplineScore >= 80 ? "success" : "warning",
    agentId: "supervisor",
    agentName: "Superviseur",
    pair: options.targetPair ? toPair(options.targetPair) : "ALL",
    title: "Revue superviseur paper",
    detail: supervisorDetail,
    payload: { openPositions: reviewState.metrics.openPositions, equityUsd: reviewState.metrics.equityUsd, disciplineScore: reviewState.metrics.disciplineScore },
  }));

  state = mergeEvents(state, events);
  state = await writePaperCycleState(state);
  return { state, cycleId, events };
}
