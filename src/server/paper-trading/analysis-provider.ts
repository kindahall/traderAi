import { configuredLocalAnalysisProvider, extractJsonObject, runConfiguredLocalAnalysis } from "@/server/analysis/local-provider";
import type { LocalAnalysisProviderId } from "@/server/analysis/local-provider";
import type { Agent } from "@/types/agent";
import type { MarketCandle } from "@/types/trading";
import type { MarketSignal, StrategyPlan, StrategyRuntimeProfile } from "@/server/paper-trading/types";

type AnalysisReviewStatus = "skipped" | "accepted" | "rejected" | "error";

type ExternalAnalysisDecision = {
  decision?: string;
  side?: string;
  confidence?: number;
  riskPercent?: number;
  rationale?: string;
  invalidation?: string;
};

export type StrategyPlanReview = {
  enabled: boolean;
  providerId?: LocalAnalysisProviderId;
  status: AnalysisReviewStatus;
  latencyMs: number;
  detail: string;
  plan: StrategyPlan | null;
};

function failClosed() {
  return process.env.TRADERAI_ANALYSIS_FAIL_CLOSED === "true";
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function maybeNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function limitText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function candleDigest(candles: MarketCandle[]) {
  return candles.slice(-24).map((candle) => ({
    t: candle.time,
    o: candle.open,
    h: candle.high,
    l: candle.low,
    c: candle.close,
    v: Math.round(candle.volume),
  }));
}

function buildAnalysisPrompt(signal: MarketSignal, candidate: StrategyPlan, profile: StrategyRuntimeProfile) {
  const agent: Agent = signal.agent;

  return [
    "Tu es un agent Analyste dans TraderAI, une application de supervision et de paper trading.",
    "Ton rôle est strictement limité à l'analyse: aucune exécution, aucun ordre réel, aucun appel outil, aucun conseil financier personnalisé.",
    "Révise le plan candidat ci-dessous et décide s'il doit être accepté ou rejeté pour une simulation paper.",
    "Si tu veux changer la direction LONG/SHORT du plan candidat, rejette le plan au lieu d'inverser le side.",
    "Réponds uniquement avec un objet JSON valide, sans markdown.",
    "",
    "Schéma attendu:",
    '{"decision":"accept|reject","side":"LONG|SHORT|NONE","confidence":0,"riskPercent":0.0,"rationale":"court","invalidation":"court"}',
    "",
    `Agent: ${agent.name} (${agent.id})`,
    `Stratégie: ${agent.strategy}`,
    `Paire: ${signal.pair}`,
    `Signal: ${signal.direction}, confiance ${signal.confidence}, momentum ${signal.momentumPct}%, volatilité ${signal.volatilityPct}%, volume x${signal.volumeRatio}`,
    `Profil runtime: confiance min ${profile.minConfidence}, volume min x${profile.minVolumeRatio}, risque x${profile.riskMultiplier}`,
    `Plan candidat: ${candidate.side} entry ${candidate.entryPrice}, SL ${candidate.stopLoss}, TP ${candidate.takeProfit}, risque ${candidate.riskPercent}%, confiance ${candidate.confidence}`,
    `Rationale candidat: ${candidate.rationale}`,
    `Invalidation candidat: ${candidate.invalidation}`,
    `Dernières bougies OHLCV JSON: ${JSON.stringify(candleDigest(signal.candles))}`,
    "",
    "Contraintes de sortie:",
    "- decision=reject si la preuve marché est insuffisante, contradictoire ou trop risquée.",
    "- confidence doit rester entre 0 et 94.",
    "- riskPercent doit rester entre 0.05 et 1.0.",
    "- rationale doit expliquer l'analyse, pas donner une instruction d'achat/vente réelle.",
    "- invalidation doit décrire les conditions qui invalident l'analyse.",
  ].join("\n");
}

function parseDecision(text: string): ExternalAnalysisDecision | null {
  const data = extractJsonObject(text);
  if (!data) return null;

  return {
    decision: limitText(data.decision ?? data.action ?? data.verdict ?? data.status, 32).toLowerCase(),
    side: limitText(data.side ?? data.direction, 16).toUpperCase(),
    confidence: maybeNumber(data.confidence),
    riskPercent: maybeNumber(data.riskPercent ?? data.risk_percent),
    rationale: limitText(data.rationale ?? data.reason ?? data.analysis, 360),
    invalidation: limitText(data.invalidation ?? data.invalid_if ?? data.stop_condition, 240),
  };
}

function applyDecision(candidate: StrategyPlan, decision: ExternalAnalysisDecision): { plan: StrategyPlan | null; detail: string; status: AnalysisReviewStatus } {
  const rejected = ["reject", "rejected", "refuse", "refused", "bloque", "blocked", "none"].includes(decision.decision ?? "");
  if (rejected || decision.side === "NONE") {
    return {
      plan: null,
      status: "rejected",
      detail: decision.rationale || "Analyse externe rejette le plan candidat.",
    };
  }

  if (decision.side && decision.side !== candidate.side) {
    return {
      plan: null,
      status: "rejected",
      detail: `Analyse externe divergente (${decision.side}) vs plan candidat (${candidate.side}). Plan rejeté.`,
    };
  }

  const confidence = decision.confidence === undefined ? candidate.confidence : Math.round(clamp(decision.confidence, 0, 94));
  const riskPercent = decision.riskPercent === undefined ? candidate.riskPercent : Number(clamp(decision.riskPercent, 0.05, 1).toFixed(2));

  return {
    status: "accepted",
    detail: decision.rationale || "Analyse externe accepte le plan candidat.",
    plan: {
      ...candidate,
      confidence,
      riskPercent,
      rationale: decision.rationale || candidate.rationale,
      invalidation: decision.invalidation || candidate.invalidation,
    },
  };
}

export async function reviewStrategyPlanWithExternalAnalysis(
  signal: MarketSignal,
  candidate: StrategyPlan,
  profile: StrategyRuntimeProfile,
): Promise<StrategyPlanReview> {
  const providerId = configuredLocalAnalysisProvider();
  if (!providerId) {
    return {
      enabled: false,
      status: "skipped",
      latencyMs: 0,
      detail: "Analyse externe désactivée.",
      plan: candidate,
    };
  }

  const response = await runConfiguredLocalAnalysis(buildAnalysisPrompt(signal, candidate, profile), { providerId });
  if (!response.ok) {
    return {
      enabled: true,
      providerId,
      status: "error",
      latencyMs: response.latencyMs,
      detail: failClosed() ? `Analyse ${providerId} indisponible: ${response.error}. Plan bloqué.` : `Analyse ${providerId} indisponible: ${response.error}. Plan déterministe conservé.`,
      plan: failClosed() ? null : candidate,
    };
  }

  const decision = parseDecision(response.text);
  if (!decision) {
    const detail = "Analyse externe sans JSON exploitable.";
    return {
      enabled: true,
      providerId,
      status: "error",
      latencyMs: response.latencyMs,
      detail: failClosed() ? `${detail} Plan bloqué.` : `${detail} Plan déterministe conservé.`,
      plan: failClosed() ? null : candidate,
    };
  }

  const applied = applyDecision(candidate, decision);
  return {
    enabled: true,
    providerId,
    status: applied.status,
    latencyMs: response.latencyMs,
    detail: applied.detail,
    plan: applied.plan,
  };
}
