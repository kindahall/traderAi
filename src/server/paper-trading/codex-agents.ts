import { configuredLocalAnalysisProvider, extractJsonObject, runConfiguredLocalAnalysis } from "@/server/analysis/local-provider";
import type { LocalAnalysisProviderId } from "@/server/analysis/local-provider";
import { paperRoleUsesAi } from "@/server/paper-trading/agent-routing-store";
import type { PaperAgentRuntimeRole } from "@/server/paper-trading/agent-routing-store";
import type { MarketSignal, PaperEventSeverity, RiskDecision, StrategyPlan, StrategyRuntimeProfile } from "@/server/paper-trading/types";
import type { Agent } from "@/types/agent";
import type { MarketAsset, MarketCandle, TradeSide } from "@/types/trading";

type CodexAgentStatus = "skipped" | "accepted" | "rejected" | "error";

type CodexScannerPayload = {
  decision?: string;
  direction?: string;
  confidence?: number;
  momentumPct?: number;
  volatilityPct?: number;
  volumeRatio?: number;
  reason?: string;
};

type CodexAnalystPayload = {
  decision?: string;
  side?: string;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  riskPercent?: number;
  confidence?: number;
  rationale?: string;
  invalidation?: string;
};

type CodexAuditorPayload = {
  decision?: string;
  reasons?: unknown;
  severity?: string;
};

type CodexRiskPayload = {
  decision?: string;
  allowed?: boolean;
  reasons?: unknown;
  adjustedRiskPercent?: number;
  executorMode?: string;
  severity?: string;
};

type CodexExecutorPayload = {
  decision?: string;
  execute?: boolean;
  riskPercent?: number;
  reason?: string;
};

export type CodexScannerResult = {
  enabled: boolean;
  providerId?: LocalAnalysisProviderId;
  status: CodexAgentStatus;
  latencyMs: number;
  detail: string;
  signal: MarketSignal | null;
  fallbackToDeterministic: boolean;
};

export type CodexAnalystResult = {
  enabled: boolean;
  providerId?: LocalAnalysisProviderId;
  status: CodexAgentStatus;
  latencyMs: number;
  detail: string;
  plan: StrategyPlan | null;
  fallbackToDeterministic: boolean;
};

export type CodexAuditResult = {
  enabled: boolean;
  providerId?: LocalAnalysisProviderId;
  status: CodexAgentStatus;
  latencyMs: number;
  allowed: boolean;
  reasons: string[];
  severity: PaperEventSeverity;
  fallbackToDeterministic: boolean;
};

export type CodexRiskResult = {
  enabled: boolean;
  providerId?: LocalAnalysisProviderId;
  status: CodexAgentStatus;
  latencyMs: number;
  detail: string;
  risk: RiskDecision | null;
  fallbackToDeterministic: boolean;
};

export type CodexExecutorResult = {
  enabled: boolean;
  providerId?: LocalAnalysisProviderId;
  status: CodexAgentStatus;
  latencyMs: number;
  execute: boolean;
  riskPercent: number | null;
  detail: string;
  fallbackToDeterministic: boolean;
};

export async function codexReplacesAgentRole(role: PaperAgentRuntimeRole) {
  return paperRoleUsesAi(role);
}

function failClosed() {
  return process.env.TRADERAI_CODEX_AGENT_FAIL_CLOSED === "true" || process.env.TRADERAI_ANALYSIS_FAIL_CLOSED === "true";
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function numberFrom(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function textFrom(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function stringArrayFrom(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => textFrom(item, 160)).filter(Boolean).slice(0, 6);
  }

  const text = textFrom(value, 500);
  return text ? [text] : [];
}

function booleanFrom(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "y", "1", "accept", "accepted", "execute", "allow", "allowed"].includes(normalized)) return true;
  if (["false", "no", "n", "0", "reject", "rejected", "skip", "block", "blocked"].includes(normalized)) return false;
  return undefined;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function getAtr(candles: MarketCandle[]) {
  return median(candles.slice(-18).map((candle) => Math.max(candle.high - candle.low, Math.abs(candle.close - candle.open))));
}

function normalizePair(pair: string) {
  const compact = pair.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.endsWith("USDT")) return `${compact.slice(0, -4)}/USDT`;
  if (compact.endsWith("USDC")) return `${compact.slice(0, -4)}/USDC`;
  if (compact.endsWith("USD")) return `${compact.slice(0, -3)}/USD`;
  return compact;
}

function parseScannerPayload(text: string): CodexScannerPayload | null {
  const data = extractJsonObject(text);
  if (!data) return null;

  return {
    decision: textFrom(data.decision ?? data.action ?? data.status, 32).toLowerCase(),
    direction: textFrom(data.direction ?? data.bias, 16).toLowerCase(),
    confidence: numberFrom(data.confidence),
    momentumPct: numberFrom(data.momentumPct ?? data.momentum_pct ?? data.momentum),
    volatilityPct: numberFrom(data.volatilityPct ?? data.volatility_pct ?? data.volatility),
    volumeRatio: numberFrom(data.volumeRatio ?? data.volume_ratio),
    reason: textFrom(data.reason ?? data.rationale ?? data.analysis, 500),
  };
}

function parseAnalystPayload(text: string): CodexAnalystPayload | null {
  const data = extractJsonObject(text);
  if (!data) return null;

  return {
    decision: textFrom(data.decision ?? data.action ?? data.status, 32).toLowerCase(),
    side: textFrom(data.side ?? data.direction, 16).toUpperCase(),
    entryPrice: numberFrom(data.entryPrice ?? data.entry_price ?? data.entry),
    stopLoss: numberFrom(data.stopLoss ?? data.stop_loss ?? data.sl),
    takeProfit: numberFrom(data.takeProfit ?? data.take_profit ?? data.tp),
    riskPercent: numberFrom(data.riskPercent ?? data.risk_percent),
    confidence: numberFrom(data.confidence),
    rationale: textFrom(data.rationale ?? data.reason ?? data.analysis, 500),
    invalidation: textFrom(data.invalidation ?? data.invalid_if ?? data.stop_condition, 280),
  };
}

function parseAuditorPayload(text: string): CodexAuditorPayload | null {
  const data = extractJsonObject(text);
  if (!data) return null;

  return {
    decision: textFrom(data.decision ?? data.action ?? data.status, 32).toLowerCase(),
    reasons: data.reasons ?? data.reason ?? data.rationale,
    severity: textFrom(data.severity, 16).toLowerCase(),
  };
}

function parseRiskPayload(text: string): CodexRiskPayload | null {
  const data = extractJsonObject(text);
  if (!data) return null;

  return {
    decision: textFrom(data.decision ?? data.action ?? data.status, 32).toLowerCase(),
    allowed: booleanFrom(data.allowed ?? data.allow ?? data.execute),
    reasons: data.reasons ?? data.reason ?? data.rationale,
    adjustedRiskPercent: numberFrom(data.adjustedRiskPercent ?? data.adjusted_risk_percent ?? data.riskPercent ?? data.risk_percent),
    executorMode: textFrom(data.executorMode ?? data.executor_mode, 24).toLowerCase(),
    severity: textFrom(data.severity, 16).toLowerCase(),
  };
}

function parseExecutorPayload(text: string): CodexExecutorPayload | null {
  const data = extractJsonObject(text);
  if (!data) return null;

  return {
    decision: textFrom(data.decision ?? data.action ?? data.status, 32).toLowerCase(),
    execute: booleanFrom(data.execute ?? data.allowed ?? data.allow),
    riskPercent: numberFrom(data.riskPercent ?? data.risk_percent ?? data.adjustedRiskPercent),
    reason: textFrom(data.reason ?? data.rationale ?? data.detail, 500),
  };
}

function validSide(value: string | undefined): value is TradeSide {
  return value === "LONG" || value === "SHORT";
}

function validPlanGeometry(side: TradeSide, entryPrice: number, stopLoss: number, takeProfit: number) {
  if (side === "LONG") return stopLoss < entryPrice && entryPrice < takeProfit;
  return takeProfit < entryPrice && entryPrice < stopLoss;
}

function validDirection(value: string | undefined): value is MarketSignal["direction"] {
  return value === "bullish" || value === "bearish" || value === "neutral";
}

function validExecutorMode(value: string | undefined): RiskDecision["executorMode"] | null {
  if (value === "agent" || value === "central-paper" || value === "blocked") return value;
  return null;
}

function buildScannerPrompt(agent: Agent, asset: MarketAsset, candles: MarketCandle[]) {
  const last = candles.at(-1);
  const digest = candles.slice(-18).map((candle) => ({
    t: candle.time,
    o: round(candle.open, 8),
    h: round(candle.high, 8),
    l: round(candle.low, 8),
    c: round(candle.close, 8),
    v: round(candle.volume, 2),
  }));

  return [
    "Tu remplaces l'agent Scanner dans TraderAI pour une boucle de paper trading.",
    "Tu dois signaler un biais marché ou ignorer la paire. Tu n'exécutes aucun ordre.",
    "Réponds uniquement avec un objet JSON valide, sans markdown.",
    "",
    "Schéma:",
    '{"decision":"signal|ignore","direction":"bullish|bearish|neutral","confidence":0,"momentumPct":0,"volatilityPct":0,"volumeRatio":0,"reason":"court"}',
    "",
    `Agent: ${agent.name} (${agent.id})`,
    `Stratégie déclarée: ${agent.strategy}`,
    `Paire: ${normalizePair(asset.symbol)}`,
    `Dernier prix: ${last?.close ?? asset.price}`,
    `Actif: ${JSON.stringify({ symbol: asset.symbol, price: asset.price, change24h: asset.change24h, volatility: asset.volatility, confidence: asset.confidence, authorized: asset.authorized })}`,
    `Bougies recentes: ${JSON.stringify(digest)}`,
    "",
    "Contraintes:",
    "- decision=ignore si le marché est neutre, illisible ou trop instable.",
    "- confidence entre 0 et 94.",
    "- direction=neutral implique decision=ignore sauf cas explicitement justifié.",
    "- reason doit être vérifiable avec prix, momentum, volatilité ou volume.",
  ].join("\n");
}

function buildAnalystPrompt(signal: MarketSignal, cycleId: string, profile: StrategyRuntimeProfile) {
  const agent = signal.agent;

  return [
    "Tu remplaces l'agent Analyste dans TraderAI pour une boucle de paper trading.",
    "Tu dois produire un plan candidat structuré ou rejeter le signal. Tu n'exécutes aucun ordre.",
    "Le moteur de risque déterministe décidera ensuite si ton plan est autorisé ou bloqué.",
    "Réponds uniquement avec un objet JSON valide, sans markdown.",
    "",
    "Schéma:",
    '{"decision":"plan|reject","side":"LONG|SHORT|NONE","entryPrice":0,"stopLoss":0,"takeProfit":0,"riskPercent":0.0,"confidence":0,"rationale":"court","invalidation":"court"}',
    "",
    `Cycle: ${cycleId}`,
    `Agent: ${agent.name} (${agent.id})`,
    `Stratégie déclarée: ${agent.strategy}`,
    `Paire: ${signal.pair}`,
    `Signal scanner déterministe: ${signal.direction}`,
    `Dernier prix: ${signal.lastPrice}`,
    `ATR: ${signal.atr}`,
    `Momentum: ${signal.momentumPct}%`,
    `Volatilité: ${signal.volatilityPct}%`,
    `Volume: x${signal.volumeRatio}`,
    `Confiance scanner: ${signal.confidence}`,
    `Profil runtime: confiance min ${profile.minConfidence}, volume min x${profile.minVolumeRatio}, risque x${profile.riskMultiplier}, cooldown ${profile.cooldownMinutes}m`,
    `Actif: ${JSON.stringify({ symbol: signal.asset.symbol, price: signal.asset.price, change24h: signal.asset.change24h, volatility: signal.asset.volatility, confidence: signal.asset.confidence, authorized: signal.asset.authorized })}`,
    "",
    "Contraintes:",
    "- decision=reject si le signal est neutre, contradictoire, trop faible, ou si le plan n'est pas justifiable.",
    "- riskPercent entre 0.05 et 1.0.",
    "- confidence entre 0 et 94.",
    "- LONG exige stopLoss < entryPrice < takeProfit.",
    "- SHORT exige takeProfit < entryPrice < stopLoss.",
    "- rationale et invalidation doivent être assez explicites pour l'audit.",
  ].join("\n");
}

function buildAuditorPrompt(plan: StrategyPlan, risk: RiskDecision) {
  return [
    "Tu remplaces l'agent Auditeur dans TraderAI pour une boucle de paper trading.",
    "Tu peux seulement accepter ou rejeter la cohérence du plan. Tu ne peux jamais autoriser un plan bloqué par le moteur risque.",
    "Réponds uniquement avec un objet JSON valide, sans markdown.",
    "",
    "Schéma:",
    '{"decision":"accept|reject","reasons":["raison courte"],"severity":"success|warning|danger"}',
    "",
    `Risk engine allowed: ${risk.allowed}`,
    `Raisons risque: ${risk.reasons.join(" | ")}`,
    `Plan: ${JSON.stringify({
      agentId: plan.agent.id,
      agentName: plan.agent.name,
      pair: plan.pair,
      side: plan.side,
      entryPrice: plan.entryPrice,
      stopLoss: plan.stopLoss,
      takeProfit: plan.takeProfit,
      riskPercent: plan.riskPercent,
      confidence: plan.confidence,
      volumeRatio: plan.volumeRatio,
      rationale: plan.rationale,
      invalidation: plan.invalidation,
    })}`,
    "",
    "Contraintes:",
    "- Si risk engine allowed=false, decision=reject obligatoirement.",
    "- Rejette si le raisonnement est trop court, non vérifiable, ou si l'invalidation est vague.",
    "- Ne propose aucune exécution réelle.",
  ].join("\n");
}

function buildRiskPrompt(plan: StrategyPlan, deterministicRisk: RiskDecision) {
  return [
    "Tu remplaces le Risk Engine dans TraderAI pour une boucle de paper trading uniquement.",
    "Tu peux autoriser, bloquer ou réduire le risque d'un plan paper. Tu n'exécutes aucun ordre réel.",
    "Réponds uniquement avec un objet JSON valide, sans markdown.",
    "",
    "Schéma:",
    '{"decision":"allow|block","allowed":true,"reasons":["raison courte"],"adjustedRiskPercent":0.0,"executorMode":"agent|central-paper|blocked","severity":"success|warning|danger"}',
    "",
    `Baseline déterministe: ${JSON.stringify(deterministicRisk)}`,
    `Plan: ${JSON.stringify({
      agentId: plan.agent.id,
      agentName: plan.agent.name,
      pair: plan.pair,
      side: plan.side,
      entryPrice: plan.entryPrice,
      stopLoss: plan.stopLoss,
      takeProfit: plan.takeProfit,
      riskPercent: plan.riskPercent,
      confidence: plan.confidence,
      volumeRatio: plan.volumeRatio,
      rationale: plan.rationale,
      invalidation: plan.invalidation,
      roles: plan.agent.roles,
      disciplineScore: plan.agent.disciplineScore,
      allowedPairs: plan.agent.allowedPairs,
    })}`,
    "",
    "Contraintes:",
    "- adjustedRiskPercent entre 0.01 et 1.0.",
    "- executorMode=blocked si allowed=false.",
    "- severity=success seulement si allowed=true.",
    "- reasons doit expliquer les règles acceptées ou contournées en paper.",
  ].join("\n");
}

function buildExecutorPrompt(plan: StrategyPlan, risk: RiskDecision) {
  return [
    "Tu remplaces l'agent Exécuteur dans TraderAI pour une boucle de paper trading.",
    "Tu peux ouvrir ou ignorer l'ordre paper. Tu ne peux pas transmettre d'ordre réel.",
    "Réponds uniquement avec un objet JSON valide, sans markdown.",
    "",
    "Schéma:",
    '{"decision":"execute|skip","execute":true,"riskPercent":0.0,"reason":"court"}',
    "",
    `Risk decision: ${JSON.stringify(risk)}`,
    `Plan: ${JSON.stringify({
      agentId: plan.agent.id,
      agentName: plan.agent.name,
      pair: plan.pair,
      side: plan.side,
      entryPrice: plan.entryPrice,
      stopLoss: plan.stopLoss,
      takeProfit: plan.takeProfit,
      confidence: plan.confidence,
      rationale: plan.rationale,
      invalidation: plan.invalidation,
    })}`,
    "",
    "Contraintes:",
    "- execute=false si risk.allowed=false.",
    "- riskPercent ne doit pas dépasser le risque validé.",
    "- reason doit expliquer l'exécution paper ou le skip.",
  ].join("\n");
}

function signalFromPayload(agent: Agent, asset: MarketAsset, candles: MarketCandle[], payload: CodexScannerPayload): MarketSignal | null {
  const ignored = ["ignore", "ignored", "reject", "rejected", "none"].includes(payload.decision ?? "");
  if (ignored || payload.direction === "neutral") return null;
  if (!validDirection(payload.direction)) return null;

  const last = candles.at(-1);
  if (!last) return null;

  const atr = Math.max(getAtr(candles), last.close * 0.0004);
  const baselineVolume = Math.max(average(candles.slice(-36, -6).map((candle) => candle.volume)), 1);
  const recentVolume = average(candles.slice(-6).map((candle) => candle.volume));
  const shortBase = candles.at(-8) ?? candles[0] ?? last;
  const momentumPct = payload.momentumPct ?? ((last.close - shortBase.close) / shortBase.close) * 100;
  const volatilityPct = payload.volatilityPct ?? atr / last.close * 100;
  const volumeRatio = payload.volumeRatio ?? recentVolume / baselineVolume;

  return {
    agent,
    pair: normalizePair(asset.symbol),
    asset,
    candles,
    lastPrice: last.close,
    momentumPct: round(momentumPct, 3),
    volatilityPct: round(volatilityPct, 3),
    volumeRatio: round(volumeRatio, 2),
    atr,
    confidence: Math.round(clamp(payload.confidence ?? asset.confidence, 0, 94)),
    direction: payload.direction,
    reason: payload.reason || `Scanner Codex détecte un biais ${payload.direction}.`,
  };
}

function planFromPayload(signal: MarketSignal, cycleId: string, payload: CodexAnalystPayload): StrategyPlan | null {
  const rejected = ["reject", "rejected", "refuse", "refused", "none"].includes(payload.decision ?? "") || payload.side === "NONE";
  if (rejected || !validSide(payload.side)) return null;

  const entryPrice = payload.entryPrice;
  const stopLoss = payload.stopLoss;
  const takeProfit = payload.takeProfit;
  if (!entryPrice || !stopLoss || !takeProfit || entryPrice <= 0 || stopLoss <= 0 || takeProfit <= 0) return null;
  if (!validPlanGeometry(payload.side, entryPrice, stopLoss, takeProfit)) return null;

  return {
    decisionId: `DEC-${cycleId}-${signal.agent.id}-${signal.pair.replace("/", "")}`,
    agent: signal.agent,
    pair: signal.pair,
    side: payload.side,
    entryPrice: round(entryPrice, 8),
    stopLoss: round(stopLoss, 8),
    takeProfit: round(takeProfit, 8),
    riskPercent: round(clamp(payload.riskPercent ?? 0.35, 0.05, 1), 2),
    confidence: Math.round(clamp(payload.confidence ?? signal.confidence, 0, 94)),
    volumeRatio: signal.volumeRatio,
    rationale: payload.rationale || `Plan Codex sur ${signal.pair} après signal ${signal.direction}.`,
    invalidation: payload.invalidation || "invalidation si le prix traverse le stop ou si volume/momentum se retournent",
  };
}

function blockedRisk(reason: string, fallback?: RiskDecision): RiskDecision {
  return {
    ...fallback,
    allowed: false,
    reasons: [reason],
    severity: "danger",
    executorMode: "blocked",
    adjustedRiskPercent: 0,
  };
}

function riskFromPayload(payload: CodexRiskPayload, deterministicRisk: RiskDecision): RiskDecision {
  const decisionAllows = ["allow", "allowed", "accept", "accepted", "approve", "approved"].includes(payload.decision ?? "");
  const decisionBlocks = ["block", "blocked", "reject", "rejected", "refuse", "refused"].includes(payload.decision ?? "");
  const allowed = decisionBlocks ? false : (payload.allowed ?? decisionAllows);
  const adjustedRiskPercent = allowed ? round(clamp(payload.adjustedRiskPercent ?? deterministicRisk.adjustedRiskPercent, 0.01, 1), 2) : 0;
  const executorMode = allowed ? validExecutorMode(payload.executorMode) ?? deterministicRisk.executorMode : "blocked";
  const reasons = stringArrayFrom(payload.reasons);

  return {
    allowed,
    severity: allowed ? severityFrom(payload.severity, "success") : severityFrom(payload.severity, deterministicRisk.severity === "success" ? "warning" : deterministicRisk.severity),
    reasons: reasons.length ? reasons : [allowed ? "Risk Engine Codex autorise le plan paper." : "Risk Engine Codex bloque le plan paper."],
    adjustedRiskPercent,
    executorMode,
  };
}

export async function runCodexScannerAgent(agent: Agent, asset: MarketAsset, candles: MarketCandle[]): Promise<CodexScannerResult> {
  if (!(await codexReplacesAgentRole("scanner"))) {
    return { enabled: false, status: "skipped", latencyMs: 0, detail: "Scanner déterministe actif.", signal: null, fallbackToDeterministic: true };
  }

  const providerId = configuredLocalAnalysisProvider() ?? undefined;
  const response = await runConfiguredLocalAnalysis(buildScannerPrompt(agent, asset, candles), { providerId });
  if (!response.ok) {
    return {
      enabled: true,
      providerId: response.providerId,
      status: "error",
      latencyMs: response.latencyMs,
      detail: response.error || "Scanner Codex indisponible.",
      signal: null,
      fallbackToDeterministic: !failClosed(),
    };
  }

  const payload = parseScannerPayload(response.text);
  if (!payload) {
    return {
      enabled: true,
      providerId: response.providerId,
      status: "error",
      latencyMs: response.latencyMs,
      detail: "Scanner Codex sans JSON exploitable.",
      signal: null,
      fallbackToDeterministic: !failClosed(),
    };
  }

  const signal = signalFromPayload(agent, asset, candles, payload);
  if (!signal) {
    return {
      enabled: true,
      providerId: response.providerId,
      status: "rejected",
      latencyMs: response.latencyMs,
      detail: payload.reason || "Scanner Codex ignore la paire.",
      signal: null,
      fallbackToDeterministic: !failClosed(),
    };
  }

  return {
    enabled: true,
    providerId: response.providerId,
    status: "accepted",
    latencyMs: response.latencyMs,
    detail: signal.reason,
    signal,
    fallbackToDeterministic: false,
  };
}

export async function runCodexAnalystAgent(signal: MarketSignal, cycleId: string, profile: StrategyRuntimeProfile): Promise<CodexAnalystResult> {
  if (!(await codexReplacesAgentRole("analyst"))) {
    return { enabled: false, status: "skipped", latencyMs: 0, detail: "Analyste déterministe actif.", plan: null, fallbackToDeterministic: true };
  }

  const providerId = configuredLocalAnalysisProvider() ?? undefined;
  const response = await runConfiguredLocalAnalysis(buildAnalystPrompt(signal, cycleId, profile), { providerId });
  if (!response.ok) {
    return {
      enabled: true,
      providerId: response.providerId,
      status: "error",
      latencyMs: response.latencyMs,
      detail: response.error || "Analyste Codex indisponible.",
      plan: null,
      fallbackToDeterministic: !failClosed(),
    };
  }

  const payload = parseAnalystPayload(response.text);
  if (!payload) {
    return {
      enabled: true,
      providerId: response.providerId,
      status: "error",
      latencyMs: response.latencyMs,
      detail: "Analyste Codex sans JSON exploitable.",
      plan: null,
      fallbackToDeterministic: !failClosed(),
    };
  }

  const plan = planFromPayload(signal, cycleId, payload);
  if (!plan) {
    return {
      enabled: true,
      providerId: response.providerId,
      status: "rejected",
      latencyMs: response.latencyMs,
      detail: payload.rationale || "Analyste Codex rejette le signal ou produit un plan invalide.",
      plan: null,
      fallbackToDeterministic: !failClosed(),
    };
  }

  return {
    enabled: true,
    providerId: response.providerId,
    status: "accepted",
    latencyMs: response.latencyMs,
    detail: plan.rationale,
    plan,
    fallbackToDeterministic: false,
  };
}

function severityFrom(value: string | undefined, fallback: PaperEventSeverity): PaperEventSeverity {
  if (value === "success" || value === "warning" || value === "danger" || value === "info" || value === "ai") return value;
  return fallback;
}

export async function runCodexRiskAgent(plan: StrategyPlan, deterministicRisk: RiskDecision): Promise<CodexRiskResult> {
  if (!(await codexReplacesAgentRole("risk"))) {
    return {
      enabled: false,
      status: "skipped",
      latencyMs: 0,
      detail: "Risk Engine déterministe actif.",
      risk: null,
      fallbackToDeterministic: true,
    };
  }

  const providerId = configuredLocalAnalysisProvider() ?? undefined;
  const response = await runConfiguredLocalAnalysis(buildRiskPrompt(plan, deterministicRisk), { providerId });
  if (!response.ok) {
    const fallbackToDeterministic = !failClosed();
    return {
      enabled: true,
      providerId: response.providerId,
      status: "error",
      latencyMs: response.latencyMs,
      detail: response.error || "Risk Engine Codex indisponible.",
      risk: fallbackToDeterministic ? null : blockedRisk("Risk Engine Codex indisponible."),
      fallbackToDeterministic,
    };
  }

  const payload = parseRiskPayload(response.text);
  if (!payload) {
    const fallbackToDeterministic = !failClosed();
    return {
      enabled: true,
      providerId: response.providerId,
      status: "error",
      latencyMs: response.latencyMs,
      detail: "Risk Engine Codex sans JSON exploitable.",
      risk: fallbackToDeterministic ? null : blockedRisk("Risk Engine Codex sans JSON exploitable."),
      fallbackToDeterministic,
    };
  }

  const risk = riskFromPayload(payload, deterministicRisk);
  return {
    enabled: true,
    providerId: response.providerId,
    status: risk.allowed ? "accepted" : "rejected",
    latencyMs: response.latencyMs,
    detail: risk.reasons.join(" · "),
    risk,
    fallbackToDeterministic: false,
  };
}

export async function runCodexAuditorAgent(plan: StrategyPlan, risk: RiskDecision): Promise<CodexAuditResult> {
  if (!(await codexReplacesAgentRole("auditor"))) {
    return {
      enabled: false,
      status: "skipped",
      latencyMs: 0,
      allowed: false,
      reasons: [],
      severity: risk.severity,
      fallbackToDeterministic: true,
    };
  }

  const providerId = configuredLocalAnalysisProvider() ?? undefined;
  const response = await runConfiguredLocalAnalysis(buildAuditorPrompt(plan, risk), { providerId });
  if (!response.ok) {
    return {
      enabled: true,
      providerId: response.providerId,
      status: "error",
      latencyMs: response.latencyMs,
      allowed: false,
      reasons: [response.error || "Auditeur Codex indisponible."],
      severity: failClosed() ? "danger" : risk.severity,
      fallbackToDeterministic: !failClosed(),
    };
  }

  const payload = parseAuditorPayload(response.text);
  if (!payload) {
    return {
      enabled: true,
      providerId: response.providerId,
      status: "error",
      latencyMs: response.latencyMs,
      allowed: false,
      reasons: ["Auditeur Codex sans JSON exploitable."],
      severity: failClosed() ? "danger" : risk.severity,
      fallbackToDeterministic: !failClosed(),
    };
  }

  const codexAccepted = ["accept", "accepted", "ok", "approve", "approved"].includes(payload.decision ?? "");
  const allowed = risk.allowed && codexAccepted;
  const reasons = stringArrayFrom(payload.reasons);

  return {
    enabled: true,
    providerId: response.providerId,
    status: allowed ? "accepted" : "rejected",
    latencyMs: response.latencyMs,
    allowed,
    reasons: reasons.length ? reasons : [allowed ? "Audit Codex valide la cohérence." : "Audit Codex rejette ou le risque bloque."],
    severity: allowed ? severityFrom(payload.severity, "success") : severityFrom(payload.severity, risk.severity === "success" ? "warning" : risk.severity),
    fallbackToDeterministic: false,
  };
}

export async function runCodexExecutorAgent(plan: StrategyPlan, risk: RiskDecision): Promise<CodexExecutorResult> {
  if (!(await codexReplacesAgentRole("executor"))) {
    return {
      enabled: false,
      status: "skipped",
      latencyMs: 0,
      execute: risk.allowed,
      riskPercent: null,
      detail: "Exécuteur déterministe actif.",
      fallbackToDeterministic: true,
    };
  }

  if (!risk.allowed) {
    return {
      enabled: true,
      status: "rejected",
      latencyMs: 0,
      execute: false,
      riskPercent: 0,
      detail: "Exécuteur Codex bloqué car le risque refuse le plan.",
      fallbackToDeterministic: false,
    };
  }

  const providerId = configuredLocalAnalysisProvider() ?? undefined;
  const response = await runConfiguredLocalAnalysis(buildExecutorPrompt(plan, risk), { providerId });
  if (!response.ok) {
    const fallbackToDeterministic = !failClosed();
    return {
      enabled: true,
      providerId: response.providerId,
      status: "error",
      latencyMs: response.latencyMs,
      execute: fallbackToDeterministic,
      riskPercent: fallbackToDeterministic ? null : 0,
      detail: response.error || "Exécuteur Codex indisponible.",
      fallbackToDeterministic,
    };
  }

  const payload = parseExecutorPayload(response.text);
  if (!payload) {
    const fallbackToDeterministic = !failClosed();
    return {
      enabled: true,
      providerId: response.providerId,
      status: "error",
      latencyMs: response.latencyMs,
      execute: fallbackToDeterministic,
      riskPercent: fallbackToDeterministic ? null : 0,
      detail: "Exécuteur Codex sans JSON exploitable.",
      fallbackToDeterministic,
    };
  }

  const execute = payload.execute ?? ["execute", "accept", "accepted", "allow", "allowed"].includes(payload.decision ?? "");
  const riskPercent = execute ? round(clamp(payload.riskPercent ?? risk.adjustedRiskPercent, 0.01, risk.adjustedRiskPercent), 2) : 0;

  return {
    enabled: true,
    providerId: response.providerId,
    status: execute ? "accepted" : "rejected",
    latencyMs: response.latencyMs,
    execute,
    riskPercent,
    detail: payload.reason || (execute ? "Exécuteur Codex ouvre l'ordre paper." : "Exécuteur Codex ignore l'ordre paper."),
    fallbackToDeterministic: false,
  };
}
