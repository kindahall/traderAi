import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeStrategyProfiles } from "@/server/paper-trading/strategy-evolution";
import type { PaperTradingEvent, PaperTradingMetrics, PaperTradingState } from "@/server/paper-trading/types";
import { readTradingAllocationConfig } from "@/server/trading/allocation-store";
import type { Trade } from "@/types/trading";

const RUNTIME_DIR = path.join(process.cwd(), ".agent-trader-runtime");
const STATE_FILE = path.join(RUNTIME_DIR, "paper-trading-state.json");
const MAX_EVENTS = 900;
const INITIAL_CAPITAL_USD = Number(process.env.PAPER_TRADING_INITIAL_CAPITAL_USD || 10_000);

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function emptyMetrics(capitalUsd = INITIAL_CAPITAL_USD): PaperTradingMetrics {
  return {
    equityUsd: capitalUsd,
    realizedPnlUsd: 0,
    unrealizedPnlUsd: 0,
    openPositions: 0,
    closedPositions: 0,
    refusedSignals: 0,
    cycles: 0,
    winRate: 0,
    disciplineScore: 100,
  };
}

function emptyState(capitalUsd = INITIAL_CAPITAL_USD): PaperTradingState {
  const now = new Date().toISOString();

  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    capitalUsd,
    metrics: emptyMetrics(capitalUsd),
    strategyProfiles: [],
    positions: [],
    events: [],
  };
}

function isPaperTradingState(value: unknown): value is PaperTradingState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<PaperTradingState>;
  return state.version === 1 && Array.isArray(state.positions) && Array.isArray(state.events);
}

async function ensureRuntimeDir() {
  await mkdir(RUNTIME_DIR, { recursive: true });
}

async function emptyStateFromAllocation() {
  try {
    const allocation = await readTradingAllocationConfig();
    return emptyState(allocation.paper.capitalUsd);
  } catch {
    return emptyState();
  }
}

async function normalizeStateFromAllocation(state: PaperTradingState) {
  const normalized = recomputeMetrics(state);
  try {
    const allocation = await readTradingAllocationConfig();
    if (allocation.source !== "defaults" && normalized.capitalUsd !== allocation.paper.capitalUsd) {
      return recomputeMetrics({ ...normalized, capitalUsd: allocation.paper.capitalUsd });
    }
  } catch {
    return normalized;
  }
  return normalized;
}

export async function readPaperTradingState(): Promise<PaperTradingState> {
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return isPaperTradingState(parsed) ? await normalizeStateFromAllocation(parsed) : await emptyStateFromAllocation();
  } catch {
    return emptyStateFromAllocation();
  }
}

export async function writePaperTradingState(state: PaperTradingState) {
  await ensureRuntimeDir();
  const normalized: PaperTradingState = {
    ...recomputeMetrics(state),
    updatedAt: new Date().toISOString(),
    events: state.events.slice(-MAX_EVENTS),
  };
  await writeFile(STATE_FILE, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export function recomputeMetrics(state: PaperTradingState): PaperTradingState {
  const openPositions = state.positions.filter((position) => position.status === "open");
  const closedPositions = state.positions.filter((position) => position.status === "closed");
  const realizedPnlUsd = closedPositions.reduce((total, position) => total + (position.realizedPnlUsd ?? 0), 0);
  const unrealizedPnlUsd = openPositions.reduce((total, position) => total + position.unrealizedPnlUsd, 0);
  const winners = closedPositions.filter((position) => (position.realizedPnlUsd ?? 0) > 0);
  const refusedSignals = state.events.filter((event) => event.type === "risk_check" && event.severity !== "success").length;
  const cycles = new Set(state.events.map((event) => event.cycleId)).size;
  const disciplinePenalty = Math.min(45, refusedSignals * 3 + openPositions.filter((position) => position.riskPercent > 0.9).length * 6);
  const lastCycleAt = state.events.at(-1)?.timestamp;

  return {
    ...state,
    strategyProfiles: normalizeStrategyProfiles(state),
    metrics: {
      equityUsd: round(state.capitalUsd + realizedPnlUsd + unrealizedPnlUsd, 2),
      realizedPnlUsd: round(realizedPnlUsd, 2),
      unrealizedPnlUsd: round(unrealizedPnlUsd, 2),
      openPositions: openPositions.length,
      closedPositions: closedPositions.length,
      refusedSignals,
      cycles,
      winRate: closedPositions.length ? round((winners.length / closedPositions.length) * 100, 1) : 0,
      disciplineScore: Math.max(40, 100 - disciplinePenalty),
      lastCycleAt,
    },
  };
}

export function mergeEvents(state: PaperTradingState, events: PaperTradingEvent[]) {
  return {
    ...state,
    events: [...state.events, ...events].slice(-MAX_EVENTS),
  };
}

function formatDateTime(iso: string) {
  const date = new Date(iso);
  return {
    date: date.toLocaleDateString("fr-FR"),
    time: date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

function numericPayload(event: PaperTradingEvent | undefined, key: string) {
  const value = event?.payload?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function snapshotForSignal(state: PaperTradingState, signal: PaperTradingEvent) {
  return state.events
    .filter((event) => event.type === "market_snapshot" && event.cycleId === signal.cycleId && event.agentId === signal.agentId && event.pair === signal.pair)
    .toSorted((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
}

function sideFromSignal(event: PaperTradingEvent): Trade["side"] {
  const text = `${event.title} ${event.detail}`.toLowerCase();
  return text.includes("bearish") || text.includes("vendeur") || text.includes("short") ? "SHORT" : "LONG";
}

function signalEventToTrade(state: PaperTradingState, event: PaperTradingEvent): Trade {
  const snapshot = snapshotForSignal(state, event);
  const price = numericPayload(snapshot, "price") ?? numericPayload(event, "price") ?? 0;
  const confidence = Math.round(numericPayload(event, "signalConfidence") ?? numericPayload(snapshot, "confidence") ?? 0);
  const { date, time } = formatDateTime(event.timestamp);
  const ignored = event.type === "signal_ignored";

  return {
    id: `SIG-${event.id}`,
    decisionId: event.id,
    source: "paper-runtime",
    date,
    time,
    agentId: event.agentId,
    asset: event.pair,
    side: sideFromSignal(event),
    entry: price,
    exit: undefined,
    stopLoss: price,
    takeProfit: price,
    riskPercent: 0,
    confidence,
    pnl: 0,
    status: "refused",
    initialReason: event.detail,
    exitReason: ignored ? "Signal ignoré par le runtime paper, aucun ordre placé." : "Signal détecté mais aucun ordre paper ouvert.",
    lesson: "Décision issue du paper runtime. Aucun ordre réel n'a été transmis.",
    disciplineScore: ignored ? 100 : Math.max(60, Math.min(100, confidence + 35)),
    tag: ignored ? "Signal ignoré" : "Signal détecté",
  };
}

function journalTagForEvent(event: PaperTradingEvent) {
  if (event.type === "analysis_rejected") return "Analyse rejetée";
  if (event.type === "risk_check") return "Risque bloqué";
  if (event.type === "audit_check") return "Audit refusé";
  if (event.type === "strategy_adjustment") return event.title.toLowerCase().includes("ignore") ? "Signal ignoré" : "Décision IA";
  return "Décision runtime";
}

function eventConfidence(event: PaperTradingEvent, snapshot: PaperTradingEvent | undefined) {
  return Math.round(numericPayload(event, "confidence") ?? numericPayload(event, "signalConfidence") ?? numericPayload(snapshot, "confidence") ?? (event.severity === "danger" ? 35 : 55));
}

function decisionEventToTrade(state: PaperTradingState, event: PaperTradingEvent): Trade {
  const snapshot = snapshotForSignal(state, event);
  const price = numericPayload(snapshot, "price") ?? numericPayload(event, "entryPrice") ?? numericPayload(event, "price") ?? 0;
  const { date, time } = formatDateTime(event.timestamp);
  const tag = journalTagForEvent(event);

  return {
    id: `EVT-${event.id}`,
    decisionId: event.decisionId ?? event.id,
    source: "paper-runtime",
    date,
    time,
    agentId: event.agentId,
    asset: event.pair,
    side: sideFromSignal(event),
    entry: price,
    exit: undefined,
    stopLoss: numericPayload(event, "stopLoss") ?? price,
    takeProfit: numericPayload(event, "takeProfit") ?? price,
    riskPercent: numericPayload(event, "adjustedRiskPercent") ?? numericPayload(event, "riskPercent") ?? 0,
    confidence: eventConfidence(event, snapshot),
    pnl: 0,
    status: "refused",
    initialReason: event.detail,
    exitReason: `${event.title}. Aucun ordre paper ouvert.`,
    lesson: "Décision runtime journalisée. Elle reste visible même quand le scanner, l'analyse ou le risque bloque l'ordre.",
    disciplineScore: event.severity === "danger" ? 70 : event.severity === "warning" ? 88 : 95,
    tag,
  };
}

function isJournalDecisionEvent(event: PaperTradingEvent) {
  if (event.type === "analysis_rejected") return true;
  if ((event.type === "risk_check" || event.type === "audit_check") && event.severity !== "success") return true;
  if (event.type !== "strategy_adjustment") return false;

  const status = event.payload?.status;
  if (status === "rejected" || status === "error") return true;
  return event.severity === "warning" || event.severity === "danger";
}

export function paperStateToTrades(state: PaperTradingState): Trade[] {
  const positionTrades = state.positions
    .toSorted((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
    .map((position): Trade => {
      const { date, time } = formatDateTime(position.openedAt);
      const pnl = round(position.status === "closed" ? position.realizedPnlUsd ?? 0 : position.unrealizedPnlUsd, 2);

      return {
        id: position.id,
        decisionId: position.decisionId,
        source: "paper-runtime",
        date,
        time,
        agentId: position.agentId,
        asset: position.pair,
        side: position.side,
        entry: position.entryPrice,
        exit: position.status === "closed" ? position.exitPrice : undefined,
        stopLoss: position.stopLoss,
        takeProfit: position.takeProfit,
        riskPercent: position.riskPercent,
        confidence: position.confidence,
        pnl,
        status: position.status === "open" ? "open" : "closed",
        initialReason: position.rationale,
        exitReason: position.exitReason ?? "Position paper active",
        lesson: position.status === "closed" ? `Paper runtime: ${position.exitReason ?? "clôture"}.` : "Paper runtime: position sous surveillance.",
        disciplineScore: Math.max(55, Math.min(100, Math.round(95 - position.riskPercent * 12 + position.confidence / 10))),
        tag: "Paper runtime",
      };
    });

  const positionDecisionIds = new Set(state.positions.map((position) => position.decisionId));
  const signalTrades = state.events
    .filter((event) => (event.type === "signal_detected" || event.type === "signal_ignored") && (!event.decisionId || !positionDecisionIds.has(event.decisionId)))
    .slice(-80)
    .map((event) => signalEventToTrade(state, event));
  const signalTradeEventIds = new Set(signalTrades.map((trade) => trade.decisionId).filter(Boolean));
  const decisionTrades = state.events
    .filter((event) => isJournalDecisionEvent(event))
    .filter((event) => !event.decisionId || !positionDecisionIds.has(event.decisionId))
    .filter((event) => !signalTradeEventIds.has(event.id))
    .slice(-180)
    .map((event) => decisionEventToTrade(state, event));

  return [...positionTrades, ...signalTrades, ...decisionTrades].toSorted((a, b) => {
    const aTime = new Date(`${a.date.split("/").reverse().join("-")}T${a.time}`).getTime();
    const bTime = new Date(`${b.date.split("/").reverse().join("-")}T${b.time}`).getTime();
    return bTime - aTime;
  });
}

export function getPaperStateFilePath() {
  return STATE_FILE;
}
