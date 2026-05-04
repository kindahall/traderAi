import { agents } from "@/data/runtime/agents";
import { strategies, strategyComparison } from "@/data/runtime/strategies";
import { alerts as referenceAlerts, riskLimits as referenceRiskLimits, riskRules } from "@/data/runtime/risk";
import { replaySteps as referenceReplaySteps, trades as referenceTrades } from "@/data/runtime/trades";
import { crisisScenarios, crisisTimeline, maturityScores, scoreEvolution, validationRequests as referenceValidationRequests, weeklyBars, weeklyLessons } from "@/data/runtime/insights";
import { CAPITAL_STAGES } from "@/lib/constants";
import { fetchMarketAssets, fetchPriceSeries, getMarketProviderConfig, type PricePoint } from "@/server/adapters/market-data";
import { getConfiguredLlmProviders, getConfiguredLlmRoles } from "@/server/adapters/llm";
import { paperStateToTrades, readPaperTradingState } from "@/server/paper-trading/event-store";
import type { PaperTradingEvent, PaperTradingState } from "@/server/paper-trading/types";
import { readKillSwitchState, type KillSwitchState } from "@/server/safety/kill-switch-store";
import { buildStrategyLibrary } from "@/server/strategies/strategy-library-store";
import { buildPaperRuntimeStatus, type PaperRuntimeHealth, type PaperRuntimeStatus } from "@/server/system/integrity";
import { readTradingAllocationConfig } from "@/server/trading/allocation-store";
import type { Alert, RiskLimit } from "@/types/risk";
import type { MarketAsset, Trade } from "@/types/trading";

export type DataSourceStatus = {
  market: "connected" | "unavailable";
  llm: "connected" | "pending";
  trading: "paper" | "live-locked" | "live-enabled";
  paperRuntime: PaperRuntimeHealth;
  demoData: "off" | "included";
  killSwitch: "active" | "inactive";
  marketError?: string;
};

export type AppDataSnapshot = Awaited<ReturnType<typeof buildAppData>>;

type GetAppDataOptions = {
  bypassCache?: boolean;
};

let appDataCache: { expiresAt: number; snapshot: AppDataSnapshot } | null = null;
let appDataInFlight: Promise<AppDataSnapshot> | null = null;

function appDataCacheTtlMs() {
  const provider = getMarketProviderConfig();
  const fallback = provider.id === "dydx" ? 2_000 : 10_000;
  const configured = Number(process.env.APP_DATA_CACHE_TTL_MS ?? fallback);
  return Math.max(0, Number.isFinite(configured) ? configured : fallback);
}

export function invalidateAppDataCache() {
  appDataCache = null;
  appDataInFlight = null;
}

function emptyPriceSeries(): PricePoint[] {
  return [];
}

function monthlyHeatmapFromSeries(series: PricePoint[]) {
  if (!series.length) return [];
  const buckets = Array.from({ length: 3 }, () => Array.from({ length: 12 }, () => 0));
  series.forEach((point, index) => {
    const row = Math.floor(index / 16);
    const col = index % 12;
    if (row < buckets.length) buckets[row][col] += point.pnl;
  });
  return buckets.map((row) => row.map((value) => Number(value.toFixed(2))));
}

function distributionFromTrades(allTrades: Trade[]) {
  const buckets = [-500, -250, -100, -50, 0, 50, 100, 250, 500];
  return buckets.map((bucket) => ({ bucket: `${bucket}`, trades: allTrades.filter((trade) => Math.round(trade.pnl * 100) <= bucket).length }));
}

function marketStatusFromEnv(sourceConnected: boolean): DataSourceStatus["trading"] {
  if (process.env.LIVE_TRADING_ENABLED === "true") return "live-enabled";
  return process.env.NEXT_PUBLIC_DEFAULT_TRADING_MODE === "paper" || sourceConnected ? "paper" : "live-locked";
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function buildTradeMetrics(allTrades: Trade[], paperState?: PaperTradingState) {
  const closedTrades = allTrades.filter((trade) => trade.status === "closed");
  const winningTrades = closedTrades.filter((trade) => trade.pnl > 0);
  const openTrades = allTrades.filter((trade) => trade.status === "open");
  const refusedTrades = allTrades.filter((trade) => trade.status === "refused");
  const refusedCount = Math.max(paperState?.metrics.refusedSignals ?? 0, refusedTrades.length);
  const pnlTotal = round(closedTrades.reduce((total, trade) => total + trade.pnl, 0), 2);
  const unrealizedPnl = paperState?.metrics.unrealizedPnlUsd ?? round(openTrades.reduce((total, trade) => total + trade.pnl, 0), 2);
  const winRate = closedTrades.length ? round((winningTrades.length / closedTrades.length) * 100, 1) : 0;
  const averageDiscipline = paperState?.metrics.disciplineScore ?? round(average(allTrades.map((trade) => trade.disciplineScore)), 0);

  return {
    closed: closedTrades.length,
    open: openTrades.length,
    refused: refusedCount,
    total: allTrades.length + Math.max(0, refusedCount - refusedTrades.length),
    pnlTotal,
    unrealizedPnl,
    winRate,
    averageDiscipline,
    latest: allTrades[0],
  };
}

function buildMarketMetrics(assets: MarketAsset[], series: PricePoint[]) {
  const provider = getMarketProviderConfig();
  const btc = assets.find((asset) => asset.baseAsset === "BTC" || asset.baseAsset === "XBT" || asset.symbol === "BTC/USDT" || asset.symbol === "BTC/USD") || assets[0];
  const avgVolatility = round(average(assets.map((asset) => asset.volatility)), 2);
  const avgConfidence = round(average(assets.map((asset) => asset.confidence)), 0);
  const opportunities = assets.filter((asset) => asset.confidence >= 65 || asset.strength === "Fort" || asset.strength === "Très fort");
  const positiveAssets = assets.filter((asset) => asset.change24h >= 0);
  const latestPoint = series.at(-1);
  const firstPoint = series[0];
  const primaryChange = firstPoint && latestPoint ? round(((latestPoint.price - firstPoint.price) / firstPoint.price) * 100, 2) : btc?.change24h ?? 0;

  return {
    primaryAsset: btc,
    primarySymbol: btc?.symbol || (provider.id === "binance" ? "BTC/USDT" : "BTC/USD"),
    primaryPrice: btc?.price || latestPoint?.price || 0,
    primaryChange,
    sourceLabel: btc?.exchangeName || provider.label,
    marketType: btc?.marketType || provider.instrumentType,
    avgVolatility,
    avgConfidence,
    watchedPairs: assets.length,
    authorizedPairs: assets.filter((asset) => asset.authorized).length,
    opportunities: opportunities.length,
    positiveRatio: assets.length ? round((positiveAssets.length / assets.length) * 100, 0) : 0,
    trendLabel: primaryChange >= 0 ? "HAUSSIER" : "BAISSIER",
    regime: avgVolatility > 5 ? "Volatil" : primaryChange >= 0 ? "Neutre-haussier" : "Neutre-baissier",
    sentiment: (btc?.confidence || avgConfidence) >= 60 ? "POSITIF" : "PRUDENT",
  };
}

function includeDemoData() {
  return process.env.INCLUDE_DEMO_DATA === "true" || process.env.NEXT_PUBLIC_INCLUDE_DEMO_DATA === "true";
}

function eventTimeLabel(event: PaperTradingEvent) {
  return new Date(event.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function replayStepsFromPaperState(state: PaperTradingState) {
  const importantEvents = state.events
    .filter((event) => ["signal_detected", "strategy_plan", "risk_check", "audit_check", "paper_order", "trade_closed", "kill_switch", "supervisor_review"].includes(event.type))
    .slice(-8);

  return importantEvents.map((event) => ({
    time: eventTimeLabel(event),
    title: event.title,
    detail: event.detail,
  }));
}

function buildOperationalAlerts(runtime: PaperRuntimeStatus, killSwitch: KillSwitchState): Alert[] {
  const alerts: Alert[] = [];
  const now = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  if (runtime.status === "stale") {
    alerts.push({
      id: "runtime-paper-stale",
      time: runtime.lastCycleAt ? new Date(runtime.lastCycleAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : now,
      severity: "warning",
      type: "Système",
      title: "Runtime paper en retard",
      detail: `Dernier cycle il y a ${runtime.lastCycleAgeSeconds ?? "?"}s.`,
      agent: "Superviseur",
      market: "-",
      status: "active",
      rootCause: runtime.process.alive ? "Cycle non récent." : "Processus runtime arrêté ou PID absent.",
      recommendedAction: "Relancer paper-runtime ou déclencher un cycle manuel.",
    });
  }

  if (killSwitch.active) {
    alerts.push({
      id: "kill-switch-active",
      time: new Date(killSwitch.updatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      severity: "critical",
      type: "Risque",
      title: "Kill switch actif",
      detail: "Aucune nouvelle position paper/live ne peut être ouverte.",
      agent: "Risk Engine",
      market: "-",
      status: "active",
      rootCause: killSwitch.reason,
      recommendedAction: "Lever le kill switch seulement après revue.",
    });
  }

  return alerts;
}

function buildRiskLimitAlerts(runtimeRiskLimits: RiskLimit[]): Alert[] {
  const now = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return runtimeRiskLimits
    .filter((limit) => limit.limit > 0 && limit.current >= limit.limit * 0.8)
    .map((limit) => {
      const breached = limit.current > limit.limit;
      const reached = limit.current >= limit.limit;
      return {
        id: `risk-limit-${limit.label.toLowerCase().replaceAll(" ", "-")}`,
        time: now,
        severity: reached ? "critical" : "warning",
        type: "Risque",
        title: breached ? `Limite ${limit.label.toLowerCase()} dépassée` : reached ? `Limite ${limit.label.toLowerCase()} atteinte` : `Limite ${limit.label.toLowerCase()} proche`,
        detail: `${limit.current}${limit.unit} utilisés / ${limit.limit}${limit.unit} autorisés.`,
        agent: "Risk Engine",
        market: "ALL",
        status: "active",
        rootCause: "Exposition paper calculée depuis les positions ouvertes.",
        recommendedAction: reached ? "Bloquer toute nouvelle entrée et réduire l'exposition paper." : "Surveiller avant d'autoriser une nouvelle entrée.",
      } satisfies Alert;
    });
}

async function buildRuntimeRiskLimits(paperState?: PaperTradingState) {
  const allocationConfig = await readTradingAllocationConfig();
  const paperAllocation = allocationConfig.paper;
  const capitalUsd = Math.max(1, paperState?.capitalUsd ?? paperAllocation.capitalUsd);
  const equityUsd = Math.max(1, paperState?.metrics.equityUsd ?? capitalUsd);
  const positions = paperState?.positions ?? [];
  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const closed = positions.filter((position) => position.status === "closed");
  const todayLossUsd = closed
    .filter((position) => new Date(position.closedAt ?? position.openedAt).getTime() >= startOfDay.getTime())
    .reduce((total, position) => total + Math.min(0, position.realizedPnlUsd ?? 0), 0);
  const weeklyLossUsd = closed
    .filter((position) => new Date(position.closedAt ?? position.openedAt).getTime() >= sevenDaysAgo)
    .reduce((total, position) => total + Math.min(0, position.realizedPnlUsd ?? 0), 0);
  const openPositions = positions.filter((position) => position.status === "open");
  const openRiskPercent = openPositions.reduce((max, position) => Math.max(max, position.riskPercent), 0);
  const exposurePercent = openPositions.reduce((total, position) => total + position.notionalUsd, 0) / equityUsd * 100;

  return [
    { label: "Risque journalier", current: round(Math.abs(todayLossUsd) / capitalUsd * 100, 2), limit: paperAllocation.dailyLossLimitPercent, unit: "%" },
    { label: "Risque par trade", current: round(openRiskPercent, 2), limit: paperAllocation.riskPerTradePercent, unit: "%" },
    { label: "Perte hebdomadaire", current: round(Math.abs(weeklyLossUsd) / capitalUsd * 100, 2), limit: paperAllocation.weeklyLossLimitPercent, unit: "%" },
    { label: "Exposition totale", current: round(exposurePercent, 2), limit: paperAllocation.maxPortfolioExposurePercent, unit: "%" },
  ];
}

function maxPaperDrawdownPercent(paperState?: PaperTradingState) {
  if (!paperState?.positions.length) return 0;
  let equity = paperState.capitalUsd;
  let peak = equity;
  let maxDrawdown = 0;
  paperState.positions
    .filter((position) => position.status === "closed")
    .toSorted((a, b) => new Date(a.closedAt ?? a.openedAt).getTime() - new Date(b.closedAt ?? b.openedAt).getTime())
    .forEach((position) => {
      equity += position.realizedPnlUsd ?? 0;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, peak ? (peak - equity) / peak * 100 : 0);
    });
  return round(maxDrawdown, 2);
}

function buildRiskMetrics(alerts: Alert[], runtimeRiskLimits = referenceRiskLimits, paperState?: PaperTradingState) {
  const activeAlerts = alerts.filter((alert) => alert.status === "active");
  const criticalAlerts = alerts.filter((alert) => alert.severity === "critical");
  const warningAlerts = alerts.filter((alert) => alert.severity === "warning");
  const activeRules = riskRules.filter((rule) => rule.status === "active");
  const criticalRules = riskRules.filter((rule) => rule.severity === "critical");
  const exposureLimit = runtimeRiskLimits.find((limit) => limit.label.toLowerCase().includes("exposition"));
  const dailyRisk = runtimeRiskLimits.find((limit) => limit.label.toLowerCase().includes("journalier"));
  const tradeRisk = runtimeRiskLimits.find((limit) => limit.label.toLowerCase().includes("trade"));
  const riskChecks = paperState?.events.filter((event) => event.type === "risk_check") ?? [];
  const passedRiskChecks = riskChecks.filter((event) => event.severity === "success").length;
  const conformityPercent = riskChecks.length ? round((passedRiskChecks / riskChecks.length) * 100, 0) : activeRules.length ? 100 : 0;
  const drawdownPercent = maxPaperDrawdownPercent(paperState);
  const equityUsd = Math.max(1, paperState?.metrics.equityUsd ?? paperState?.capitalUsd ?? 10_000);
  const openExposures = (paperState?.positions ?? [])
    .filter((position) => position.status === "open")
    .map((position) => ({
      asset: position.pair,
      current: round(position.notionalUsd / equityUsd * 100, 2),
      notionalUsd: position.notionalUsd,
      pnlUsd: position.unrealizedPnlUsd,
    }));

  return {
    activeAlerts: activeAlerts.length,
    criticalAlerts: criticalAlerts.length,
    warningAlerts: warningAlerts.length,
    activeRules: activeRules.length,
    criticalRules: criticalRules.length,
    exposurePercent: exposureLimit?.current ?? 0,
    exposureLimit: exposureLimit?.limit ?? 0,
    dailyRiskPercent: dailyRisk?.current ?? 0,
    dailyRiskLimit: dailyRisk?.limit ?? 0,
    drawdownPercent,
    drawdownLimit: 15,
    tradeRiskPercent: tradeRisk?.current ?? 0,
    tradeRiskLimit: tradeRisk?.limit ?? 0,
    conformityPercent,
    openExposures,
  };
}

function buildAlertMetrics(alerts: Alert[]) {
  const active = alerts.filter((alert) => alert.status === "active");
  const critical = alerts.filter((alert) => alert.severity === "critical");
  const warning = alerts.filter((alert) => alert.severity === "warning");
  const info = alerts.filter((alert) => alert.severity === "info");
  const apiIncidents = alerts.filter((alert) => alert.type === "API");
  const actionRequired = alerts.filter((alert) => alert.status !== "resolved");

  return {
    total: alerts.length,
    active: active.length,
    critical: critical.length,
    warning: warning.length,
    info: info.length,
    apiIncidents: apiIncidents.length,
    actionRequired: actionRequired.length,
    resolved: alerts.filter((alert) => alert.status === "resolved").length,
    pending: alerts.filter((alert) => alert.status === "pending").length,
    criticalShare: alerts.length ? round((critical.length / alerts.length) * 100, 0) : 0,
    warningShare: alerts.length ? round((warning.length / alerts.length) * 100, 0) : 0,
    infoShare: alerts.length ? round((info.length / alerts.length) * 100, 0) : 0,
  };
}

function buildRulesMetrics() {
  const activeRules = riskRules.filter((rule) => rule.status === "active");
  const criticalRules = riskRules.filter((rule) => rule.severity === "critical");
  const warningRules = riskRules.filter((rule) => rule.severity === "warning");
  const customRules = riskRules.filter((rule) => rule.type !== "Système");
  const coveredAgents = Math.max(...riskRules.map((rule) => rule.targets.agents), 0);
  const coveredStrategies = Math.max(...riskRules.map((rule) => rule.targets.strategies), 0);

  return {
    total: riskRules.length,
    active: activeRules.length,
    critical: criticalRules.length,
    warning: warningRules.length,
    system: riskRules.length - customRules.length,
    custom: customRules.length,
    coveredAgents,
    coveredStrategies,
    conformityPercent: activeRules.length ? 100 : 0,
  };
}

function buildStrategyMetrics(runtimeStrategies = strategies) {
  const activeStrategies = runtimeStrategies.filter((strategy) => strategy.status === "active");
  const measuredWinRates = runtimeStrategies
    .filter((strategy) => !strategy.paperStats || strategy.paperStats.closedTrades > 0)
    .map((strategy) => strategy.winRate);

  return {
    total: runtimeStrategies.length,
    active: activeStrategies.length,
    inactive: runtimeStrategies.filter((strategy) => strategy.status === "inactive").length,
    averagePerformance: round(average(runtimeStrategies.map((strategy) => strategy.performance)), 2),
    averageDrawdown: round(average(runtimeStrategies.map((strategy) => strategy.drawdown)), 2),
    averageValidationRate: round(average(runtimeStrategies.map((strategy) => strategy.validationRate)), 1),
    averageWinRate: round(average(measuredWinRates), 1),
  };
}

function buildMaturityMetrics() {
  const weightedScores = maturityScores.filter((score) => score.weight > 0);
  const weightTotal = weightedScores.reduce((total, score) => total + score.weight, 0);
  const globalScore = weightTotal
    ? round(weightedScores.reduce((total, score) => total + score.score * score.weight, 0) / weightTotal, 0)
    : 0;
  const firstEvolution = scoreEvolution[0]?.global ?? globalScore;
  const lastEvolution = scoreEvolution.at(-1)?.global ?? globalScore;

  return {
    globalScore,
    evolution: round(lastEvolution - firstEvolution, 0),
    previousScore: firstEvolution,
    latestScore: lastEvolution,
    lowestScore: Math.min(...weightedScores.map((score) => score.score)),
    readiness: globalScore >= 78 ? "Promotion possible" : globalScore >= 70 ? "Maintenir sous surveillance" : "Rester en paper trading",
  };
}

function buildWeeklyMetrics(allTrades: Trade[], alerts: Alert[]) {
  const closedTrades = allTrades.filter((trade) => trade.status === "closed");
  const winners = closedTrades.filter((trade) => trade.pnl > 0);
  const losers = closedTrades.filter((trade) => trade.pnl < 0);
  const avoided = allTrades.filter((trade) => trade.status === "refused");
  const violations = alerts.filter((alert) => alert.severity === "critical").length;
  const netPerformance = round(closedTrades.reduce((total, trade) => total + trade.pnl, 0), 2);

  return {
    analyzed: allTrades.length,
    winners: winners.length,
    losers: losers.length,
    avoided: avoided.length,
    avoidedQuality: avoided.length ? round(average(avoided.map((trade) => trade.disciplineScore)), 0) : 0,
    violations,
    mainLesson: weeklyLessons.adjustments[0] || "Maintenir discipline",
    netPerformance,
    bestTrade: closedTrades.toSorted((a, b) => b.pnl - a.pnl)[0],
    worstTrade: closedTrades.toSorted((a, b) => a.pnl - b.pnl)[0],
  };
}

function buildCapitalMetrics() {
  const currentIndex = CAPITAL_STAGES.findIndex((stage) => stage.state === "current");
  const current = CAPITAL_STAGES[currentIndex] ?? CAPITAL_STAGES[0];
  const next = CAPITAL_STAGES[currentIndex + 1];
  const readiness = 64;

  return {
    current,
    next,
    currentIndex,
    readiness,
    completedStages: CAPITAL_STAGES.filter((stage) => stage.state === "completed").length,
    lockedStages: CAPITAL_STAGES.filter((stage) => stage.state === "locked").length,
  };
}

function buildCrisisMetrics() {
  const selected = crisisScenarios[0];

  return {
    selected,
    scenarioCount: crisisScenarios.length,
    robustScenarios: crisisScenarios.filter((scenario) => scenario.robustness >= 85).length,
    averageRobustness: round(average(crisisScenarios.map((scenario) => scenario.robustness)), 0),
    averageSurvival: round(average(crisisScenarios.map((scenario) => scenario.survival)), 0),
    worstImpact: crisisScenarios.toSorted((a, b) => a.impact - b.impact)[0],
  };
}

function buildExchangeMetrics(sourceStatus: DataSourceStatus) {
  const provider = getMarketProviderConfig();
  const walletProvider = (process.env.EXCHANGE_WALLET_PROVIDER || process.env.DYDX_WALLET_PROVIDER || "").trim();
  const apiKeyConfigured = Boolean(process.env.EXCHANGE_API_KEY || process.env.BINANCE_API_KEY);
  const secretConfigured = Boolean(process.env.EXCHANGE_SECRET_KEY || process.env.EXCHANGE_API_SECRET || process.env.BINANCE_API_SECRET);
  const passphraseConfigured = Boolean(process.env.EXCHANGE_PASSPHRASE || process.env.EXCHANGE_API_PASSPHRASE);
  const tradingEnabled = process.env.LIVE_TRADING_ENABLED === "true";
  const withdrawalsEnabled = process.env.WITHDRAWALS_ENABLED === "true" || process.env.EXCHANGE_WITHDRAWALS_ENABLED === "true";

  return {
    providerId: provider.id,
    providerLabel: provider.label,
    provider: provider.label,
    marketType: provider.instrumentType,
    walletProvider: walletProvider || "non configuré",
    walletConfigured: Boolean(walletProvider),
    marketDataStatus: sourceStatus.market,
    apiKeyConfigured,
    secretConfigured,
    passphraseConfigured,
    tradingEnabled,
    withdrawalsEnabled,
    permissions: [
      "Lecture",
      tradingEnabled ? "Trading live configuré" : "Trading live verrouillé",
      withdrawalsEnabled ? "Retraits activés" : "Retraits désactivés",
    ],
  };
}

export async function getAppData(options: GetAppDataOptions = {}) {
  const now = Date.now();
  const ttlMs = appDataCacheTtlMs();

  if (!options.bypassCache && ttlMs > 0 && appDataCache && appDataCache.expiresAt > now) {
    return appDataCache.snapshot;
  }

  if (!options.bypassCache && appDataInFlight) {
    return appDataInFlight;
  }

  const load = buildAppData().then((snapshot) => {
    if (ttlMs > 0) {
      appDataCache = { snapshot, expiresAt: Date.now() + ttlMs };
    }
    return snapshot;
  }).finally(() => {
    appDataInFlight = null;
  });

  if (!options.bypassCache) {
    appDataInFlight = load;
  }

  return load;
}

async function buildAppData() {
  let marketAssets: MarketAsset[] = [];
  let priceSeries = emptyPriceSeries();
  let paperTrades: Trade[] = [];
  let paperState: PaperTradingState | undefined;
  let marketError: string | undefined;

  try {
    [marketAssets, priceSeries] = await Promise.all([fetchMarketAssets(), fetchPriceSeries()]);
  } catch (error) {
    marketError = error instanceof Error ? error.message : "Market data unavailable";
  }

  try {
    paperState = await readPaperTradingState();
    paperTrades = paperStateToTrades(paperState);
  } catch {
    paperTrades = [];
  }

  const [paperRuntime, killSwitch] = await Promise.all([buildPaperRuntimeStatus(paperState), readKillSwitchState()]);
  const showDemoData = includeDemoData();
  const runtimeRiskLimits = await buildRuntimeRiskLimits(paperState);
  const alerts = showDemoData ? referenceAlerts : [...buildOperationalAlerts(paperRuntime, killSwitch), ...buildRiskLimitAlerts(runtimeRiskLimits)];
  const validationRequests = showDemoData ? referenceValidationRequests : [];
  const replaySteps = paperState ? replayStepsFromPaperState(paperState) : [];
  const allLlmProviders = getConfiguredLlmProviders();
  const llmRoleConfig = getConfiguredLlmRoles();
  const sourceStatus: DataSourceStatus = {
    market: marketAssets.length ? "connected" : "unavailable",
    llm: allLlmProviders.some((provider) => provider.status === "connected") ? "connected" : "pending",
    trading: marketStatusFromEnv(Boolean(marketAssets.length)),
    paperRuntime: paperRuntime.status,
    demoData: showDemoData ? "included" : "off",
    killSwitch: killSwitch.active ? "active" : "inactive",
    marketError,
  };
  const allTrades = showDemoData ? [...paperTrades, ...referenceTrades] : paperTrades;
  const runtimeStrategies = await buildStrategyLibrary(strategies, paperState);
  const tradeMetrics = buildTradeMetrics(allTrades, paperState);
  const marketMetrics = buildMarketMetrics(marketAssets, priceSeries);
  const riskMetrics = buildRiskMetrics(alerts, runtimeRiskLimits, paperState);
  const alertMetrics = buildAlertMetrics(alerts);
  const rulesMetrics = buildRulesMetrics();
  const strategyMetrics = buildStrategyMetrics(runtimeStrategies);
  const maturityMetrics = buildMaturityMetrics();
  const weeklyMetrics = buildWeeklyMetrics(allTrades, alerts);
  const capitalMetrics = buildCapitalMetrics();
  const crisisMetrics = buildCrisisMetrics();
  const exchangeMetrics = buildExchangeMetrics(sourceStatus);
  const agentMetrics = {
    total: agents.length,
    active: agents.filter((agent) => agent.status === "active").length,
    paused: agents.filter((agent) => agent.status === "paused").length,
    averagePerformance30d: round(average(agents.map((agent) => agent.performance30d)), 2),
    averageDiscipline: round(average(agents.map((agent) => agent.disciplineScore)), 0),
    incidents7d: agents.reduce((total, agent) => total + agent.incidents7d, 0),
  };
  const llmMetrics = {
    totalProviders: allLlmProviders.length,
    connectedProviders: allLlmProviders.filter((provider) => provider.status === "connected").length,
    rolesConfigured: llmRoleConfig.length,
    tokensToday: allLlmProviders.reduce((total, provider) => total + provider.tokensToday, 0),
    estimatedDailyCost: round(allLlmProviders.reduce((total, provider) => total + provider.estimatedDailyCost, 0), 2),
  };
  const validationMetrics = {
    pending: validationRequests.length,
    highRisk: validationRequests.filter((request) => request.risk.includes("2,")).length,
    lowConfidence: validationRequests.filter((request) => request.confidence < 65).length,
    amountTotal: validationRequests.reduce((total, request) => total + Number(request.amount.replace(/[^\d,.]/g, "").replace(",", ".")), 0),
  };

  return {
    agents,
    marketAssets,
    priceSeries,
    monthlyHeatmap: monthlyHeatmapFromSeries(priceSeries),
    resultDistribution: distributionFromTrades(allTrades),
    strategies: runtimeStrategies,
    strategyComparison,
    replaySteps: replaySteps.length ? replaySteps : showDemoData ? referenceReplaySteps : [],
    trades: allTrades,
    alerts,
    riskLimits: runtimeRiskLimits,
    riskRules,
    paperEvents: paperState?.events ?? [],
    allLlmProviders,
    llmRoleConfig,
    crisisScenarios,
    crisisTimeline,
    maturityScores,
    scoreEvolution,
    validationRequests,
    weeklyBars,
    weeklyLessons,
    sourceStatus,
    paperRuntime,
    killSwitch,
    dataMode: {
      demoTradesIncluded: showDemoData,
      tradeSource: showDemoData ? "paper-runtime+demo-reference" : "paper-runtime-only",
    },
    metrics: {
      agent: agentMetrics,
      alert: alertMetrics,
      capital: capitalMetrics,
      crisis: crisisMetrics,
      exchange: exchangeMetrics,
      llm: llmMetrics,
      market: marketMetrics,
      maturity: maturityMetrics,
      risk: riskMetrics,
      rules: rulesMetrics,
      strategy: strategyMetrics,
      trade: tradeMetrics,
      validation: validationMetrics,
      weekly: weeklyMetrics,
      runtime: {
        paper: paperRuntime,
        killSwitch,
        demoTradesIncluded: showDemoData,
      },
    },
  };
}
