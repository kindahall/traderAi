import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { agents } from "@/data/runtime/agents";
import type { StrategyDefinition } from "@/data/runtime/strategies";
import { extractJsonObject, runConfiguredLocalAnalysis } from "@/server/analysis/local-provider";
import { readPaperTradingState, writePaperTradingState } from "@/server/paper-trading/event-store";
import { defaultStrategyProfile, normalizeStrategyProfiles } from "@/server/paper-trading/strategy-evolution";
import type { PaperTradingEvent, PaperTradingState, StrategyRuntimeProfile } from "@/server/paper-trading/types";
import type { Agent } from "@/types/agent";

export type StrategyImprovementStatus = "proposed" | "approved" | "expired" | "dismissed";
export type StrategyImprovementAnalysisProvider = "codex" | "heuristic";

export type StrategyImprovementSample = {
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  closedTradeRatio: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  performance: number;
  validationRate: number;
  drawdown: number;
};

export type StrategyImprovementNote = {
  id: string;
  strategyId: string;
  strategyName: string;
  createdAt: string;
  updatedAt: string;
  reviewDate: string;
  status: StrategyImprovementStatus;
  approvalRequired: true;
  approvedAt?: string;
  dismissedAt?: string;
  expiredAt?: string;
  appliedAgentIds: string[];
  analysisProvider: StrategyImprovementAnalysisProvider;
  analysisLatencyMs?: number;
  analysisError?: string;
  reason: string;
  decision: string;
  improvement: string;
  expectedImpact: string;
  strategySpecificRules: string[];
  guardrail: string;
  before: StrategyImprovementSample;
  baselineClosedTrades: number;
  expireAfterClosedTrades: number;
  closedTradesObserved: number;
  remainingClosedTrades: number;
  scoreBefore: number;
  scoreAfter: number;
  confidence: number;
};

export type StrategyImprovementState = {
  version: 1;
  updatedAt: string;
  lastReviewDate?: string;
  requirements: {
    minClosedTrades: number;
    minClosedTradeRatio: number;
    expireAfterClosedTrades: number;
    minLosingTrades: number;
  };
  notes: StrategyImprovementNote[];
};

type ReviewOptions = {
  force?: boolean;
  useCodex?: boolean;
};

const RUNTIME_DIR = path.join(process.cwd(), ".agent-trader-runtime");
const IMPROVEMENT_FILE = path.join(RUNTIME_DIR, "strategy-improvements.json");
const MIN_CLOSED_TRADES = 10;
const MIN_CLOSED_TRADE_RATIO = 70;
const MIN_LOSING_TRADES = 4;
const EXPIRE_AFTER_CLOSED_TRADES = 3;
const MAX_NOTES = 40;
const CODEX_REVIEW_TIMEOUT_MS = Math.max(15_000, Number(process.env.STRATEGY_CODEX_REVIEW_TIMEOUT_MS || 75_000));

function nowIso() {
  return new Date().toISOString();
}

function reviewDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function slug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function requirements(): StrategyImprovementState["requirements"] {
  return {
    minClosedTrades: MIN_CLOSED_TRADES,
    minClosedTradeRatio: MIN_CLOSED_TRADE_RATIO,
    expireAfterClosedTrades: EXPIRE_AFTER_CLOSED_TRADES,
    minLosingTrades: MIN_LOSING_TRADES,
  };
}

function defaultState(): StrategyImprovementState {
  return {
    version: 1,
    updatedAt: nowIso(),
    requirements: requirements(),
    notes: [],
  };
}

function numberValue(value: unknown, fallback: number, min = 0, max = Number.POSITIVE_INFINITY) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? clamp(numeric, min, max) : fallback;
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function isStatus(value: unknown): value is StrategyImprovementStatus {
  return value === "proposed" || value === "approved" || value === "expired" || value === "dismissed";
}

function isAnalysisProvider(value: unknown): value is StrategyImprovementAnalysisProvider {
  return value === "codex" || value === "heuristic";
}

function textList(value: unknown, fallback: string[] = []) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.replace(/\s+/g, " ").trim()).slice(0, 6)
    : fallback;
}

function normalizeSample(value: unknown): StrategyImprovementSample {
  const input = value && typeof value === "object" ? value as Partial<StrategyImprovementSample> : {};
  return {
    totalTrades: numberValue(input.totalTrades, 0),
    closedTrades: numberValue(input.closedTrades, 0),
    openTrades: numberValue(input.openTrades, 0),
    closedTradeRatio: numberValue(input.closedTradeRatio, 0, 0, 100),
    winningTrades: numberValue(input.winningTrades, 0),
    losingTrades: numberValue(input.losingTrades, 0),
    winRate: numberValue(input.winRate, 0, 0, 100),
    performance: numberValue(input.performance, 0, -100, 1000),
    validationRate: numberValue(input.validationRate, 0, 0, 100),
    drawdown: numberValue(input.drawdown, 0, -100, 100),
  };
}

function normalizeNote(value: unknown): StrategyImprovementNote | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<StrategyImprovementNote>;
  if (!input.id || !input.strategyId || !input.strategyName || !isStatus(input.status)) return null;
  const before = normalizeSample(input.before);
  const expireAfterClosedTrades = numberValue(input.expireAfterClosedTrades, EXPIRE_AFTER_CLOSED_TRADES, 1, 12);
  const closedTradesObserved = numberValue(input.closedTradesObserved, 0);
  const analysisProvider = isAnalysisProvider(input.analysisProvider) ? input.analysisProvider : "heuristic";
  const persistedConfidence = numberValue(input.confidence, 0, 0, 100);

  return {
    id: input.id,
    strategyId: input.strategyId,
    strategyName: input.strategyName,
    createdAt: stringValue(input.createdAt, nowIso()),
    updatedAt: stringValue(input.updatedAt, nowIso()),
    reviewDate: stringValue(input.reviewDate, reviewDate()),
    status: input.status,
    approvalRequired: true,
    approvedAt: stringValue(input.approvedAt, "") || undefined,
    dismissedAt: stringValue(input.dismissedAt, "") || undefined,
    expiredAt: stringValue(input.expiredAt, "") || undefined,
    appliedAgentIds: Array.isArray(input.appliedAgentIds) ? input.appliedAgentIds.filter((id): id is string => typeof id === "string") : [],
    analysisProvider,
    analysisLatencyMs: input.analysisLatencyMs ? numberValue(input.analysisLatencyMs, 0) : undefined,
    analysisError: stringValue(input.analysisError, "") || undefined,
    reason: stringValue(input.reason, "Performance paper à revoir."),
    decision: stringValue(input.decision, "Proposition à valider avant application."),
    improvement: stringValue(input.improvement, "Renforcer les filtres avant le prochain palier paper."),
    expectedImpact: stringValue(input.expectedImpact, "Réduire les faux signaux sans augmenter le risque."),
    strategySpecificRules: textList(input.strategySpecificRules),
    guardrail: stringValue(input.guardrail, sampleGuardrail()),
    before,
    baselineClosedTrades: numberValue(input.baselineClosedTrades, before.closedTrades),
    expireAfterClosedTrades,
    closedTradesObserved,
    remainingClosedTrades: numberValue(input.remainingClosedTrades, Math.max(0, expireAfterClosedTrades - closedTradesObserved)),
    scoreBefore: numberValue(input.scoreBefore, scoreSample(before), 0, 100),
    scoreAfter: numberValue(input.scoreAfter, scoreSample(before), 0, 100),
    confidence: analysisProvider === "codex" && persistedConfidence > 0 && persistedConfidence <= 1
      ? confidenceForSample(before)
      : persistedConfidence,
  };
}

function normalizeState(value: unknown): StrategyImprovementState {
  if (!value || typeof value !== "object") return defaultState();
  const input = value as Partial<StrategyImprovementState>;
  const notes = Array.isArray(input.notes)
    ? input.notes.map(normalizeNote).filter((note): note is StrategyImprovementNote => Boolean(note))
    : [];

  return {
    version: 1,
    updatedAt: stringValue(input.updatedAt, nowIso()),
    lastReviewDate: stringValue(input.lastReviewDate, "") || undefined,
    requirements: requirements(),
    notes,
  };
}

async function ensureRuntimeDir() {
  await mkdir(RUNTIME_DIR, { recursive: true });
}

async function writeState(state: StrategyImprovementState) {
  await ensureRuntimeDir();
  const next = {
    ...state,
    updatedAt: nowIso(),
    notes: state.notes
      .toSorted((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, MAX_NOTES),
  };
  await writeFile(IMPROVEMENT_FILE, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export async function readStrategyImprovementState(): Promise<StrategyImprovementState> {
  try {
    return normalizeState(JSON.parse(await readFile(IMPROVEMENT_FILE, "utf8")) as unknown);
  } catch {
    return defaultState();
  }
}

function sampleGuardrail() {
  return `${MIN_CLOSED_TRADES} trades clos minimum et ${MIN_CLOSED_TRADE_RATIO}% des trades clôturés avant proposition.`;
}

function sampleFromStrategy(strategy: StrategyDefinition): StrategyImprovementSample {
  const stats = strategy.paperStats;
  const totalTrades = stats?.totalTrades ?? 0;
  const closedTrades = stats?.closedTrades ?? 0;
  const winningTrades = stats?.winningTrades ?? 0;
  const losingTrades = stats?.losingTrades ?? 0;
  const openTrades = stats?.openTrades ?? Math.max(0, totalTrades - closedTrades);
  const closedTradeRatio = totalTrades ? round(closedTrades / totalTrades * 100, 1) : 0;

  return {
    totalTrades,
    closedTrades,
    openTrades,
    closedTradeRatio,
    winningTrades,
    losingTrades,
    winRate: closedTrades ? round(winningTrades / closedTrades * 100, 1) : round(strategy.winRate, 1),
    performance: round(strategy.performance, 2),
    validationRate: round(strategy.validationRate, 1),
    drawdown: round(strategy.drawdown, 2),
  };
}

function hasEnoughSample(sample: StrategyImprovementSample) {
  return sample.closedTrades >= MIN_CLOSED_TRADES && sample.closedTradeRatio >= MIN_CLOSED_TRADE_RATIO;
}

function needsImprovement(strategy: StrategyDefinition, sample: StrategyImprovementSample) {
  if (strategy.status === "draft" || !hasEnoughSample(sample)) return false;

  return (
    sample.performance < -0.5 ||
    sample.winRate < 45 ||
    sample.validationRate < 50 ||
    (sample.losingTrades >= MIN_LOSING_TRADES && sample.losingTrades > sample.winningTrades)
  );
}

function scoreSample(sample: StrategyImprovementSample) {
  const pnlScore = clamp(50 + sample.performance * 3, 0, 100);
  const drawdownScore = clamp(100 + sample.drawdown * 3, 0, 100);
  return round(sample.winRate * 0.35 + sample.validationRate * 0.3 + pnlScore * 0.25 + drawdownScore * 0.1, 0);
}

function confidenceForSample(sample: StrategyImprovementSample) {
  const sizeScore = clamp(sample.closedTrades / 25 * 100, 0, 100);
  return round(sizeScore * 0.65 + sample.closedTradeRatio * 0.35, 0);
}

type StrategyImprovementRecommendation = {
  analysisProvider: StrategyImprovementAnalysisProvider;
  analysisLatencyMs?: number;
  analysisError?: string;
  reason: string;
  decision: string;
  improvement: string;
  expectedImpact: string;
  strategySpecificRules: string[];
  scoreBefore: number;
  scoreAfter: number;
  confidence: number;
};

function contextualRuleSet(strategy: StrategyDefinition, sample: StrategyImprovementSample) {
  const strategyKey = `${strategy.id} ${strategy.name}`.toLowerCase();
  const assets = strategy.assets.slice(0, 3).join(", ");
  const rules: string[] = [];

  if (strategyKey.includes("mean")) {
    rules.push(`Ne pas renforcer une entrée mean-reversion sur ${assets} si le support n'est pas confirmé et si le RSI n'est pas revenu sous le seuil prévu.`);
    rules.push("Sortir plus vite si le prix ne revient pas vers EMA 20 dans la fenêtre de temps prévue.");
  } else if (strategyKey.includes("breakout")) {
    rules.push(`Ignorer les breakouts ${strategy.timeframe} sans clôture nette au-dessus du plus haut et volume supérieur à la moyenne.`);
    rules.push("Réduire la taille après une cassure réintégrée, car le faux breakout est l'erreur principale à surveiller.");
  } else if (strategyKey.includes("scalp")) {
    rules.push("Bloquer le scalp quand spread, latence ou volatilité instantanée sortent des limites, même si le signal technique est présent.");
    rules.push("Imposer une pause après une perte, car la fréquence élevée amplifie vite les faux signaux.");
  } else if (strategyKey.includes("sub-dollar")) {
    rules.push(`Limiter ${assets} aux actifs avec liquidité stable; refuser les spikes isolés sur petites capitalisations.`);
    rules.push("Conserver une taille réduite tant que le momentum 5m n'est pas confirmé par volume.");
  } else {
    rules.push(`Exiger la confluence des règles d'entrée existantes sur ${assets}: ${strategy.entryRules.slice(0, 2).join(" + ")}.`);
    rules.push(`Ne pas assouplir les sorties avant amélioration du win rate actuel (${sample.winRate}%).`);
  }

  if (sample.performance < -0.5) rules.push("Réduire l'exposition paper tant que le P&L de cette stratégie reste négatif.");
  if (sample.losingTrades > sample.winningTrades) rules.push("Comparer chaque nouvelle perte aux pertes récentes avant de valider un nouveau signal similaire.");

  return rules.slice(0, 5);
}

function recommendationFor(strategy: StrategyDefinition, sample: StrategyImprovementSample): StrategyImprovementRecommendation {
  const reasons: string[] = [];
  if (sample.performance < -0.5) reasons.push(`performance ${sample.performance}%`);
  if (sample.winRate < 45) reasons.push(`win rate ${sample.winRate}%`);
  if (sample.validationRate < 50) reasons.push(`validation ${sample.validationRate}%`);
  if (sample.losingTrades > sample.winningTrades) reasons.push(`${sample.losingTrades} pertes contre ${sample.winningTrades} gains`);

  const riskText = strategy.risk === "Élevé"
    ? "Réduire le risque paper et imposer un cooldown plus long après une perte."
    : "Conserver le risque actuel mais durcir la qualité du signal.";
  const filterText = sample.winRate < 45
    ? "Augmenter la confiance minimale et exiger une confluence volume/tendance avant entrée."
    : "Écarter les entrées avec drawdown défavorable et filtrer les phases sans liquidité.";
  const exitText = sample.performance < -0.5
    ? "Raccourcir l'invalidation et réduire la taille tant que le P&L paper reste négatif."
    : "Garder la structure, mais refuser les signaux moyens au lieu de moyenner la fréquence.";
  const scoreBefore = scoreSample(sample);
  const uplift = sample.winRate < 40 || sample.performance < -2 ? 14 : 9;
  const strategyRules = contextualRuleSet(strategy, sample);

  return {
    analysisProvider: "heuristic",
    reason: reasons.length ? `Échantillon suffisant: ${reasons.join(" · ")}.` : "Échantillon suffisant mais qualité paper sous le seuil.",
    decision: "Proposition uniquement: aucune modification runtime sans validation humaine.",
    improvement: `${filterText} ${riskText} ${exitText}`,
    expectedImpact: "Objectif: moins de faux signaux sur les 3 prochains trades clos, sans augmenter l'exposition.",
    strategySpecificRules: strategyRules,
    scoreBefore,
    scoreAfter: clamp(scoreBefore + uplift, 0, 100),
    confidence: confidenceForSample(sample),
  };
}

function noteId(strategy: StrategyDefinition, date: string) {
  return `IMP-${date.replace(/-/g, "")}-${slug(strategy.id || strategy.name).slice(0, 32)}`;
}

function cleanText(value: unknown, fallback: string, maxLength = 500) {
  return typeof value === "string" && value.trim()
    ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
    : fallback;
}

function numberFromPayload(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? round(clamp(numeric, min, max), 0) : fallback;
}

function confidenceFromPayload(value: unknown, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const normalized = numeric > 0 && numeric <= 1 ? numeric * 100 : numeric;
  return round(clamp(normalized, 0, 100), 0);
}

function eventContextForAgents(state: PaperTradingState | undefined, matchedAgents: Agent[]) {
  if (!state || !matchedAgents.length) return { positions: [], events: [] };
  const agentIds = new Set(matchedAgents.map((agent) => agent.id));
  const positions = state.positions
    .filter((position) => agentIds.has(position.agentId))
    .toSorted((a, b) => new Date(b.closedAt ?? b.openedAt).getTime() - new Date(a.closedAt ?? a.openedAt).getTime())
    .slice(0, 12)
    .map((position) => ({
      agentId: position.agentId,
      pair: position.pair,
      side: position.side,
      status: position.status,
      openedAt: position.openedAt,
      closedAt: position.closedAt,
      confidence: position.confidence,
      riskPercent: position.riskPercent,
      pnlUsd: round(position.status === "closed" ? position.realizedPnlUsd ?? 0 : position.unrealizedPnlUsd, 2),
      pnlPercent: round(position.pnlPercent, 2),
      exitReason: position.exitReason,
      rationale: position.rationale,
    }));
  const events = state.events
    .filter((event) => agentIds.has(event.agentId))
    .filter((event) => ["analysis_rejected", "risk_check", "audit_check", "strategy_adjustment", "trade_closed"].includes(event.type))
    .toSorted((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 14)
    .map((event) => ({
      type: event.type,
      severity: event.severity,
      pair: event.pair,
      title: event.title,
      detail: event.detail,
    }));

  return { positions, events };
}

function codexReviewPrompt(strategy: StrategyDefinition, sample: StrategyImprovementSample, paperState: PaperTradingState | undefined) {
  const matchedAgents = matchingAgents(strategy);
  const context = eventContextForAgents(paperState, matchedAgents);

  return [
    "Tu es Codex dans TraderAI. Tu dois auditer UNE stratégie paper et proposer une amélioration adaptée à cette stratégie précise.",
    "Tu ne dois jamais déclencher d'ordre, ni promettre un gain, ni modifier automatiquement la stratégie.",
    "Tu dois refuser les conseils génériques. Chaque règle doit citer au moins un élément spécifique: timeframe, actifs, règles d'entrée/sortie, risque, métriques ou erreurs récentes.",
    "",
    "Règles obligatoires:",
    `1. Ne proposer une amélioration que parce que l'échantillon respecte déjà ${MIN_CLOSED_TRADES} trades clos minimum et ${MIN_CLOSED_TRADE_RATIO}% de trades clôturés.`,
    "2. Proposer une modification soumise à validation humaine, pas une modification automatique.",
    "3. Adapter le conseil au type de stratégie: trend, mean-reversion, breakout, scalp, sub-dollar ou stratégie importée.",
    "4. Ne pas donner le même conseil qu'une autre stratégie si les règles ou erreurs sont différentes.",
    "5. Donner 3 à 5 règles de suivi pour les 3 prochains trades clos.",
    "6. Rester prudent: pas de conseil financier personnalisé, pas d'ordre live, pas de promesse de rentabilité.",
    "",
    "Réponds uniquement en JSON valide avec ce schéma:",
    JSON.stringify({
      reason: "Pourquoi cette stratégie mérite une proposition, avec chiffres.",
      decision: "Toujours préciser que l'accord humain est requis.",
      improvement: "Amélioration concrète et spécifique à cette stratégie.",
      expectedImpact: "Ce qu'on surveille sur les 3 prochains trades clos.",
      strategySpecificRules: ["Règle spécifique 1", "Règle spécifique 2", "Règle spécifique 3"],
      scoreAfter: 0,
      confidence: "nombre de 0 à 100: confiance dans la recommandation, pas une probabilité de gain",
    }),
    "",
    "Stratégie JSON:",
    JSON.stringify({
      id: strategy.id,
      name: strategy.name,
      status: strategy.status,
      timeframe: strategy.timeframe,
      risk: strategy.risk,
      assets: strategy.assets,
      entryRules: strategy.entryRules,
      exitRules: strategy.exitRules,
      filters: strategy.filters,
      recommendationActuelle: strategy.recommendation,
      sample: {
        ...sample,
        performanceUnit: "percent",
        winRateUnit: "percent",
        validationRateUnit: "percent",
        drawdownUnit: "percent",
      },
      matchedAgents: matchedAgents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        focus: agent.focus,
        strategy: agent.strategy,
        confidence: agent.confidence,
        disciplineScore: agent.disciplineScore,
        behavior: agent.behavior,
        allowedPairs: agent.allowedPairs,
        lastAction: agent.lastAction,
      })),
      recentPaperPositions: context.positions,
      recentPaperErrors: context.events,
    }).slice(0, 24_000),
  ].join("\n");
}

async function codexRecommendationFor(strategy: StrategyDefinition, sample: StrategyImprovementSample, paperState: PaperTradingState | undefined): Promise<StrategyImprovementRecommendation> {
  const fallback = recommendationFor(strategy, sample);
  const result = await runConfiguredLocalAnalysis(codexReviewPrompt(strategy, sample, paperState), {
    providerId: "codex",
    timeoutMs: CODEX_REVIEW_TIMEOUT_MS,
  });

  if (!result.ok) {
    return {
      ...fallback,
      analysisError: result.error ?? "Codex indisponible.",
    };
  }

  const data = extractJsonObject(result.text);
  if (!data) {
    return {
      ...fallback,
      analysisError: "Réponse Codex non structurée; fallback local utilisé.",
    };
  }

  const scoreBefore = fallback.scoreBefore;
  const scoreAfter = numberFromPayload(data.scoreAfter, fallback.scoreAfter, scoreBefore, 100);
  const strategySpecificRules = textList(data.strategySpecificRules, fallback.strategySpecificRules);

  return {
    analysisProvider: "codex",
    analysisLatencyMs: result.latencyMs,
    reason: cleanText(data.reason, fallback.reason),
    decision: cleanText(data.decision, fallback.decision),
    improvement: cleanText(data.improvement, fallback.improvement, 900),
    expectedImpact: cleanText(data.expectedImpact, fallback.expectedImpact, 500),
    strategySpecificRules: strategySpecificRules.length ? strategySpecificRules : fallback.strategySpecificRules,
    scoreBefore,
    scoreAfter,
    confidence: confidenceFromPayload(data.confidence, fallback.confidence),
  };
}

async function recommendationForReview(strategy: StrategyDefinition, sample: StrategyImprovementSample, options: ReviewOptions, paperState: PaperTradingState | undefined) {
  if (!options.useCodex) return recommendationFor(strategy, sample);
  return codexRecommendationFor(strategy, sample, paperState);
}

function byStrategyId(strategies: StrategyDefinition[]) {
  return new Map(strategies.map((strategy) => [strategy.id, strategy]));
}

function refreshNoteVisibility(note: StrategyImprovementNote, strategy: StrategyDefinition | undefined, timestamp: string): StrategyImprovementNote {
  if (!strategy) return note;
  const sample = sampleFromStrategy(strategy);
  const baselineClosedTrades = note.status === "approved" ? note.baselineClosedTrades : sample.closedTrades;
  const closedTradesObserved = note.status === "approved" ? Math.max(0, sample.closedTrades - baselineClosedTrades) : 0;
  const remainingClosedTrades = Math.max(0, note.expireAfterClosedTrades - closedTradesObserved);

  if (note.status === "approved" && remainingClosedTrades === 0) {
    return {
      ...note,
      status: "expired",
      expiredAt: note.expiredAt ?? timestamp,
      updatedAt: timestamp,
      before: sample,
      closedTradesObserved,
      remainingClosedTrades,
    };
  }

  if (note.status === "proposed") {
    const recommendation = note.analysisProvider === "codex" ? null : recommendationFor(strategy, sample);
    return {
      ...note,
      updatedAt: timestamp,
      reason: recommendation?.reason ?? note.reason,
      decision: recommendation?.decision ?? note.decision,
      improvement: recommendation?.improvement ?? note.improvement,
      expectedImpact: recommendation?.expectedImpact ?? note.expectedImpact,
      strategySpecificRules: recommendation?.strategySpecificRules ?? note.strategySpecificRules,
      before: sample,
      baselineClosedTrades,
      closedTradesObserved,
      remainingClosedTrades,
      scoreBefore: recommendation?.scoreBefore ?? note.scoreBefore,
      scoreAfter: recommendation?.scoreAfter ?? note.scoreAfter,
      confidence: recommendation?.confidence ?? note.confidence,
    };
  }

  return {
    ...note,
    updatedAt: note.status === "approved" ? timestamp : note.updatedAt,
    before: sample,
    closedTradesObserved,
    remainingClosedTrades,
  };
}

function refreshVisibility(state: StrategyImprovementState, strategies: StrategyDefinition[]) {
  const strategiesById = byStrategyId(strategies);
  const timestamp = nowIso();

  return {
    ...state,
    notes: state.notes.map((note) => refreshNoteVisibility(note, strategiesById.get(note.strategyId), timestamp)),
  };
}

function activeOrRecentNote(notes: StrategyImprovementNote[], strategy: StrategyDefinition, sample: StrategyImprovementSample) {
  const latest = notes
    .filter((note) => note.strategyId === strategy.id)
    .toSorted((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  if (!latest) return undefined;
  if (latest.status === "proposed" || latest.status === "approved") return latest;
  if (latest.status === "dismissed" && sample.closedTrades < latest.before.closedTrades + EXPIRE_AFTER_CLOSED_TRADES) return latest;
  return undefined;
}

export async function runDailyStrategyImprovementReview(strategies: StrategyDefinition[], options: ReviewOptions = {}) {
  const today = reviewDate();
  const timestamp = nowIso();
  let state = refreshVisibility(await readStrategyImprovementState(), strategies);
  const paperState = options.useCodex ? await readPaperTradingState().catch(() => undefined) : undefined;

  if (state.lastReviewDate === today && !options.force) {
    return writeState(state);
  }

  const nextNotes = [...state.notes];

  for (const strategy of strategies) {
    const sample = sampleFromStrategy(strategy);
    if (!needsImprovement(strategy, sample)) continue;

    const existing = activeOrRecentNote(nextNotes, strategy, sample);
    if (existing) {
      if (options.useCodex && existing.status === "proposed" && (options.force || existing.analysisProvider !== "codex")) {
        const recommendation = await recommendationForReview(strategy, sample, options, paperState);
        const index = nextNotes.findIndex((note) => note.id === existing.id);
        if (index >= 0) {
          nextNotes[index] = {
            ...existing,
            updatedAt: timestamp,
            reviewDate: today,
            analysisProvider: recommendation.analysisProvider,
            analysisLatencyMs: recommendation.analysisLatencyMs,
            analysisError: recommendation.analysisError,
            reason: recommendation.reason,
            decision: recommendation.decision,
            improvement: recommendation.improvement,
            expectedImpact: recommendation.expectedImpact,
            strategySpecificRules: recommendation.strategySpecificRules,
            before: sample,
            baselineClosedTrades: sample.closedTrades,
            closedTradesObserved: 0,
            remainingClosedTrades: EXPIRE_AFTER_CLOSED_TRADES,
            scoreBefore: recommendation.scoreBefore,
            scoreAfter: recommendation.scoreAfter,
            confidence: recommendation.confidence,
          };
        }
      }
      continue;
    }

    const recommendation = await recommendationForReview(strategy, sample, options, paperState);
    nextNotes.push({
      id: noteId(strategy, today),
      strategyId: strategy.id,
      strategyName: strategy.name,
      createdAt: timestamp,
      updatedAt: timestamp,
      reviewDate: today,
      status: "proposed",
      approvalRequired: true,
      appliedAgentIds: [],
      analysisProvider: recommendation.analysisProvider,
      analysisLatencyMs: recommendation.analysisLatencyMs,
      analysisError: recommendation.analysisError,
      reason: recommendation.reason,
      decision: recommendation.decision,
      improvement: recommendation.improvement,
      expectedImpact: recommendation.expectedImpact,
      strategySpecificRules: recommendation.strategySpecificRules,
      guardrail: sampleGuardrail(),
      before: sample,
      baselineClosedTrades: sample.closedTrades,
      expireAfterClosedTrades: EXPIRE_AFTER_CLOSED_TRADES,
      closedTradesObserved: 0,
      remainingClosedTrades: EXPIRE_AFTER_CLOSED_TRADES,
      scoreBefore: recommendation.scoreBefore,
      scoreAfter: recommendation.scoreAfter,
      confidence: recommendation.confidence,
    });
  }

  state = {
    ...state,
    lastReviewDate: today,
    updatedAt: timestamp,
    notes: nextNotes,
  };

  return writeState(refreshVisibility(state, strategies));
}

function matchingAgents(strategy: StrategyDefinition) {
  const strategyKey = slug(strategy.name);
  const strategyId = slug(strategy.id);
  return agents.filter((agent) => {
    const agentStrategy = slug(agent.strategy);
    return agentStrategy === strategyKey || agentStrategy === strategyId;
  });
}

function adjustProfile(profile: StrategyRuntimeProfile, note: StrategyImprovementNote) {
  const sample = note.before;
  const severe = sample.winRate < 40 || sample.performance < -2 || sample.losingTrades >= sample.winningTrades + 3;

  return {
    ...profile,
    minConfidence: clamp(profile.minConfidence + (severe ? 4 : 2), 50, 74),
    minVolumeRatio: round(clamp(profile.minVolumeRatio + (severe ? 0.08 : 0.05), 0.1, 1.2), 2),
    advisoryExecutorMinConfidence: clamp(profile.advisoryExecutorMinConfidence + (severe ? 4 : 2), 50, 78),
    riskMultiplier: round(clamp(profile.riskMultiplier - (severe ? 0.08 : 0.05), 0.25, 0.75), 2),
    cooldownMinutes: clamp(profile.cooldownMinutes + (severe ? 10 : 5), 20, 60),
    reviewCount: sample.closedTrades,
    updatedAt: nowIso(),
    rationale: `Validé humain: ${note.improvement}`,
  };
}

function approvalEvent(agent: Agent, before: StrategyRuntimeProfile, after: StrategyRuntimeProfile, note: StrategyImprovementNote, cycleId: string): PaperTradingEvent {
  return {
    id: `EVT-${Date.now().toString(36).toUpperCase()}-${agent.id}`,
    cycleId,
    timestamp: nowIso(),
    type: "strategy_adjustment",
    severity: "ai",
    agentId: agent.id,
    agentName: agent.name,
    pair: "ALL",
    title: `Amélioration validée: ${note.strategyName}`,
    detail: `${note.reason} Accord humain enregistré avant application runtime.`,
    payload: {
      noteId: note.id,
      minConfidence: after.minConfidence,
      minVolumeRatio: after.minVolumeRatio,
      cooldownMinutes: after.cooldownMinutes,
      riskMultiplier: after.riskMultiplier,
      previousMinConfidence: before.minConfidence,
      previousRiskMultiplier: before.riskMultiplier,
    },
  };
}

async function applyApprovedRuntimeAdjustment(strategy: StrategyDefinition, note: StrategyImprovementNote) {
  const affectedAgents = matchingAgents(strategy).filter((agent) => agent.mode === "paper");
  if (!affectedAgents.length) return [] as string[];

  const state = await readPaperTradingState();
  const normalizedProfiles = normalizeStrategyProfiles(state);
  const profileByAgent = new Map(normalizedProfiles.map((profile) => [profile.agentId, profile]));
  const affectedIds = new Set(affectedAgents.map((agent) => agent.id));
  const cycleId = `HUMAN-${Date.now().toString(36).toUpperCase()}`;
  const events: PaperTradingEvent[] = [];
  const nextProfiles = normalizedProfiles.map((profile) => {
    if (!affectedIds.has(profile.agentId)) return profile;
    const agent = affectedAgents.find((candidate) => candidate.id === profile.agentId);
    if (!agent) return profile;
    const next = adjustProfile(profile, note);
    events.push(approvalEvent(agent, profile, next, note, cycleId));
    return next;
  });

  for (const agent of affectedAgents) {
    if (profileByAgent.has(agent.id)) continue;
    const before = defaultStrategyProfile(agent);
    const after = adjustProfile(before, note);
    nextProfiles.push(after);
    events.push(approvalEvent(agent, before, after, note, cycleId));
  }

  await writePaperTradingState({
    ...state,
    strategyProfiles: nextProfiles,
    events: [...state.events, ...events],
  });

  return affectedAgents.map((agent) => agent.id);
}

export async function approveStrategyImprovementNote(noteId: string, strategies: StrategyDefinition[]) {
  const timestamp = nowIso();
  const strategiesById = byStrategyId(strategies);
  let state = refreshVisibility(await readStrategyImprovementState(), strategies);
  const note = state.notes.find((item) => item.id === noteId);
  if (!note || note.status !== "proposed") return writeState(state);
  const strategy = strategiesById.get(note.strategyId);
  if (!strategy) return writeState(state);

  const sample = sampleFromStrategy(strategy);
  const approved: StrategyImprovementNote = {
    ...refreshNoteVisibility(note, strategy, timestamp),
    status: "approved",
    approvedAt: timestamp,
    updatedAt: timestamp,
    before: sample,
    baselineClosedTrades: sample.closedTrades,
    closedTradesObserved: 0,
    remainingClosedTrades: EXPIRE_AFTER_CLOSED_TRADES,
  };
  const appliedAgentIds = await applyApprovedRuntimeAdjustment(strategy, approved);

  state = {
    ...state,
    notes: state.notes.map((item) => item.id === noteId ? { ...approved, appliedAgentIds } : item),
  };

  return writeState(refreshVisibility(state, strategies));
}

export async function dismissStrategyImprovementNote(noteId: string, strategies: StrategyDefinition[]) {
  const timestamp = nowIso();
  const state = refreshVisibility(await readStrategyImprovementState(), strategies);
  return writeState({
    ...state,
    notes: state.notes.map((note) => note.id === noteId ? {
      ...note,
      status: "dismissed",
      dismissedAt: timestamp,
      updatedAt: timestamp,
    } : note),
  });
}

export function getStrategyImprovementFilePath() {
  return IMPROVEMENT_FILE;
}
