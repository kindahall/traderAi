import type { Agent } from "@/types/agent";
import type { MarketAsset, MarketCandle, TradeSide } from "@/types/trading";
import type { MarketSignal, PaperPosition, RiskDecision, StrategyPlan, StrategyRuntimeProfile } from "@/server/paper-trading/types";

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
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

function normalizePair(pair: string) {
  const compact = pair.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.endsWith("USDT")) return `${compact.slice(0, -4)}/USDT`;
  if (compact.endsWith("USDC")) return `${compact.slice(0, -4)}/USDC`;
  if (compact.endsWith("USD")) return `${compact.slice(0, -3)}/USD`;
  return compact;
}

function canonicalPair(pair: string) {
  return normalizePair(pair).replace("/USDT", "/USD").replace("/USDC", "/USD");
}

function getAtr(candles: MarketCandle[]) {
  return median(candles.slice(-18).map((candle) => Math.max(candle.high - candle.low, Math.abs(candle.close - candle.open))));
}

function strengthScore(strength: MarketAsset["strength"]) {
  if (strength === "Très fort") return 8;
  if (strength === "Fort") return 5;
  if (strength === "Moyen") return 2;
  return 0;
}

export function scannerAgent(agent: Agent, asset: MarketAsset, candles: MarketCandle[]): MarketSignal | null {
  const last = candles.at(-1);
  const shortBase = candles.at(-8) ?? candles[0];
  const longBase = candles.at(-34) ?? candles[0];
  if (!last || !shortBase || !longBase) return null;

  const atr = Math.max(getAtr(candles), last.close * 0.0004);
  const shortMomentum = ((last.close - shortBase.close) / shortBase.close) * 100;
  const longMomentum = ((last.close - longBase.close) / longBase.close) * 100;
  const volatilityPct = (atr / last.close) * 100;
  const recentVolume = average(candles.slice(-6).map((candle) => candle.volume));
  const baselineVolume = average(candles.slice(-36, -6).map((candle) => candle.volume));
  const volumeRatio = recentVolume / Math.max(baselineVolume, 1);
  const candleDirection = shortMomentum > 0.08 && longMomentum > -0.18 ? "bullish" : shortMomentum < -0.08 && longMomentum < 0.18 ? "bearish" : "neutral";
  const sparseIntraday = volumeRatio < 0.15 || recentVolume <= 0 || candles.slice(-12).filter((candle) => candle.volume > 0).length <= 2;
  const tickerDirection = asset.change24h > 0.75 ? "bullish" : asset.change24h < -0.75 ? "bearish" : "neutral";
  const direction = candleDirection === "neutral" && sparseIntraday && tickerDirection !== "neutral" ? tickerDirection : candleDirection;
  const trendScore = Math.min(28, Math.abs(shortMomentum) * 16 + Math.abs(longMomentum) * 5);
  const volumeScore = Math.min(14, Math.max(0, volumeRatio - 0.8) * 18);
  const stabilityScore = volatilityPct > 1.2 ? -10 : volatilityPct < 0.05 ? -8 : 8;
  const tickerFallback = direction !== candleDirection;
  const signalVolumeRatio = tickerFallback ? Math.max(volumeRatio, asset.confidence >= 60 ? 0.65 : 0.45) : volumeRatio;
  const signalMomentum = tickerFallback ? asset.change24h : shortMomentum;
  const confidence = tickerFallback
    ? Math.max(35, Math.min(88, Math.round(asset.confidence + strengthScore(asset.strength) + Math.min(10, Math.abs(asset.change24h) * 2) + (agent.capabilities.Scanner - 70) / 5)))
    : Math.max(25, Math.min(92, Math.round(asset.confidence * 0.48 + agent.capabilities.Scanner * 0.22 + trendScore + volumeScore + stabilityScore)));
  const reason = tickerFallback
    ? `Biais ticker 24h ${direction === "bullish" ? "acheteur" : "vendeur"} · variation ${round(asset.change24h, 2)}% · bougies 1m clairsemées`
    : `${direction === "neutral" ? "Range détecté" : direction === "bullish" ? "Momentum acheteur" : "Momentum vendeur"} · momentum ${round(shortMomentum, 2)}% · volume x${round(volumeRatio, 2)}`;

  return {
    agent,
    pair: normalizePair(asset.symbol),
    asset,
    candles,
    lastPrice: last.close,
    momentumPct: round(signalMomentum, 3),
    volatilityPct: round(volatilityPct, 3),
    volumeRatio: round(signalVolumeRatio, 2),
    atr,
    confidence,
    direction,
    reason,
  };
}

export function analystAgent(signal: MarketSignal, cycleId: string, profile: StrategyRuntimeProfile): StrategyPlan | null {
  const { agent, asset } = signal;
  const strategy = agent.strategy.toLowerCase();
  const canShort = strategy.includes("mean") || strategy.includes("breakout") || strategy.includes("scalp");
  const baseRisk = Math.max(0.15, Math.min(0.95, 0.42 + agent.behavior.aggressiveness / 320 - agent.behavior.prudence / 420));
  let side: TradeSide | null = null;
  let confidence = signal.confidence;
  let rationale = signal.reason;

  if (strategy.includes("mean")) {
    const overextendedUp = signal.momentumPct > 0.22 && asset.change24h > 0.6;
    const overextendedDown = signal.momentumPct < -0.22 && asset.change24h < -0.6;
    side = overextendedUp && canShort ? "SHORT" : overextendedDown ? "LONG" : null;
    confidence -= side ? 0 : 10;
    rationale = `${rationale} · mean reversion ${side ? "active" : "attente range"}`;
  } else if (strategy.includes("scalp")) {
    side = signal.direction === "bullish" ? "LONG" : signal.direction === "bearish" && canShort ? "SHORT" : null;
    confidence += signal.volumeRatio > 1.15 ? 5 : -9;
    rationale = `${rationale} · scalp volatilité avec volume ${signal.volumeRatio}`;
  } else {
    side = signal.direction === "bullish" ? "LONG" : signal.direction === "bearish" && canShort ? "SHORT" : null;
    confidence += signal.direction !== "neutral" ? 4 : -12;
    rationale = `${rationale} · suivi tendance ${side ?? "sans entrée"}`;
  }

  if (!side || confidence < minimumPlanConfidence(profile)) return null;

  const entryPrice = side === "LONG" ? signal.lastPrice + signal.atr * 0.08 : signal.lastPrice - signal.atr * 0.08;
  const stopDistance = Math.max(signal.atr * (strategy.includes("scalp") ? 1.05 : 1.55), signal.lastPrice * 0.0012);
  const targetDistance = stopDistance * (strategy.includes("mean") ? 1.55 : 2.15);
  const stopLoss = side === "LONG" ? entryPrice - stopDistance : entryPrice + stopDistance;
  const takeProfit = side === "LONG" ? entryPrice + targetDistance : entryPrice - targetDistance;

  return {
    decisionId: `DEC-${cycleId}-${agent.id}-${signal.pair.replace("/", "")}`,
    agent,
    pair: signal.pair,
    side,
    entryPrice: round(entryPrice, 8),
    stopLoss: round(stopLoss, 8),
    takeProfit: round(takeProfit, 8),
    riskPercent: round(baseRisk, 2),
    confidence: Math.max(0, Math.min(94, Math.round(confidence))),
    volumeRatio: signal.volumeRatio,
    rationale,
    invalidation: side === "LONG" ? "clôture sous stop, volume absent ou signal risque" : "clôture au-dessus stop, squeeze ou volatilité anormale",
  };
}

export function minimumPlanConfidence(profile: StrategyRuntimeProfile) {
  return Math.max(48, profile.minConfidence - 4);
}

function minutesSince(iso?: string) {
  if (!iso) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(iso).getTime()) / 60_000;
}

export function riskAgent(
  plan: StrategyPlan,
  positions: PaperPosition[],
  dailyDrawdownPercent: number,
  profile: StrategyRuntimeProfile,
  portfolioExposurePercent = 0,
  exposureLimitPercent = 15,
  dailyDrawdownLimitPercent = 3,
  runtimeAllowedPairs: string[] = [],
): RiskDecision {
  const reasons: string[] = [];
  const agent = plan.agent;
  const allowedPair =
    canonicalPair(agent.focus) === canonicalPair(plan.pair) ||
    agent.allowedPairs.some((pair) => canonicalPair(pair) === canonicalPair(plan.pair)) ||
    runtimeAllowedPairs.some((pair) => canonicalPair(pair) === canonicalPair(plan.pair));
  const hasExecutorRole = agent.roles.includes("Exécuteur");
  const duplicate = positions.some((position) => position.status === "open" && position.agentId === agent.id && position.pair === plan.pair);
  const recentClosed = positions.find((position) => position.status === "closed" && position.agentId === agent.id && position.pair === plan.pair && minutesSince(position.closedAt) < profile.cooldownMinutes);
  const stopDistancePct = Math.abs(plan.entryPrice - plan.stopLoss) / plan.entryPrice * 100;
  const rewardDistancePct = Math.abs(plan.takeProfit - plan.entryPrice) / plan.entryPrice * 100;

  if (agent.status !== "active") reasons.push("agent non actif");
  if (agent.mode !== "paper") reasons.push("mode paper requis");
  if (!allowedPair) reasons.push("paire non autorisée");
  if (!hasExecutorRole && plan.confidence < profile.advisoryExecutorMinConfidence) reasons.push(`rôle Exécuteur absent et confiance < ${profile.advisoryExecutorMinConfidence}`);
  if (!Number.isFinite(plan.stopLoss) || plan.stopLoss <= 0) reasons.push("stop-loss manquant");
  if (plan.riskPercent > 1) reasons.push("risque par trade > 1%");
  if (plan.confidence < profile.minConfidence) reasons.push(`confiance < ${profile.minConfidence}`);
  if (plan.volumeRatio < profile.minVolumeRatio) reasons.push(`volume insuffisant < x${profile.minVolumeRatio}`);
  if (duplicate) reasons.push("position déjà ouverte sur cette paire");
  if (recentClosed) reasons.push(`cooldown ${profile.cooldownMinutes} min après clôture`);
  if (dailyDrawdownPercent > dailyDrawdownLimitPercent) reasons.push(`drawdown journalier > ${dailyDrawdownLimitPercent}%`);
  if (portfolioExposurePercent >= exposureLimitPercent) reasons.push(`exposition portefeuille >= ${exposureLimitPercent}%`);
  if (stopDistancePct > 1.8) reasons.push("stop trop distant");
  if (rewardDistancePct / Math.max(stopDistancePct, 0.001) < 1.25) reasons.push("R:R insuffisant");

  return {
    allowed: reasons.length === 0,
    severity: reasons.length === 0 ? "success" : reasons.some((reason) => reason.includes("stop") || reason.includes("drawdown")) ? "danger" : "warning",
    reasons: reasons.length ? reasons : ["toutes les règles déterministes sont validées"],
    adjustedRiskPercent: round(Math.min(plan.riskPercent * profile.riskMultiplier, agent.disciplineScore < 75 ? 0.32 : 0.58), 2),
    executorMode: reasons.length ? "blocked" : hasExecutorRole ? "agent" : "central-paper",
  };
}

export function auditorAgent(plan: StrategyPlan, risk: RiskDecision) {
  const explanationOk = plan.rationale.length >= 40 && plan.invalidation.length >= 20;
  const coherent = risk.allowed && explanationOk;

  return {
    allowed: coherent,
    reasons: [
      explanationOk ? "raisonnement structuré présent" : "raisonnement trop court",
      risk.allowed ? "risque validé avant exécution" : "risque bloque la proposition",
    ],
    severity: coherent ? "success" as const : risk.severity,
  };
}
