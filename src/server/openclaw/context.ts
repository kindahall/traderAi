import { getAppData } from "@/server/app-data";
import type { OpenClawContextSource } from "@/types/openclaw";

export function getOpenClawContextSources(): OpenClawContextSource[] {
  return [
    {
      id: "market-snapshot",
      label: "Marché live",
      endpoint: "/api/markets",
      roles: ["scanner"],
      access: "read",
      cadence: "live",
      status: "active",
      hint: "Tickers, variations 24h, volumes, volatilité et signaux marché exposés par le backend de l'application.",
    },
    {
      id: "market-candles",
      label: "Bougies",
      endpoint: "/api/markets/candles",
      roles: ["scanner", "analyst"],
      access: "read",
      cadence: "1m+",
      status: "active",
      hint: "OHLCV utilisés pour confirmer tendance, momentum, volatilité et niveaux de prix.",
    },
    {
      id: "strategy-library",
      label: "Stratégies",
      endpoint: "/api/openclaw/context",
      roles: ["analyst"],
      access: "guarded",
      cadence: "on demand",
      status: "active",
      hint: "Règles d'entrée, règles de sortie, filtres et actifs autorisés. Lecture uniquement.",
    },
    {
      id: "risk-engine",
      label: "Risque",
      endpoint: "/api/openclaw/context",
      roles: ["analyst", "auditor"],
      access: "guarded",
      cadence: "on demand",
      status: "active",
      hint: "Limites, règles critiques, kill switch et contraintes de validation. OpenClaw ne peut pas modifier ces règles.",
    },
    {
      id: "trade-journal",
      label: "Journal",
      endpoint: "/api/openclaw/context",
      roles: ["analyst", "auditor"],
      access: "guarded",
      cadence: "recent",
      status: "active",
      hint: "Trades récents, refus, raisons initiales, leçons et score de discipline.",
    },
    {
      id: "execution",
      label: "Exécution",
      endpoint: "/api/trading/order",
      roles: ["executor"],
      access: "blocked",
      cadence: "locked",
      status: "blocked",
      hint: "Endpoint verrouillé. Une proposition OpenClaw doit passer par le Risk Engine et la validation humaine.",
    },
  ];
}

export async function getOpenClawAgentContext() {
  const data = await getAppData();

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    mode: data.sourceStatus.trading,
    sources: getOpenClawContextSources(),
    scanner: {
      primarySymbol: data.metrics.market.primarySymbol,
      watchedPairs: data.marketAssets.map((asset) => asset.symbol),
      authorizedPairs: data.marketAssets.filter((asset) => asset.authorized).map((asset) => asset.symbol),
      marketEndpoint: "/api/markets",
      candlesEndpoint: `/api/markets/candles?symbol=${encodeURIComponent(data.metrics.market.primarySymbol)}`,
      marketStatus: data.sourceStatus.market,
    },
    analyst: {
      strategies: data.strategies.map((strategy) => ({
        id: strategy.id,
        name: strategy.name,
        status: strategy.status,
        timeframe: strategy.timeframe,
        risk: strategy.risk,
        assets: strategy.assets,
        entryRules: strategy.entryRules,
        exitRules: strategy.exitRules,
        filters: strategy.filters,
      })),
      riskLimits: data.riskLimits,
      activeRules: data.riskRules.filter((rule) => rule.status === "active").map((rule) => ({
        id: rule.id,
        name: rule.name,
        severity: rule.severity,
        conditions: rule.conditions,
        actions: rule.actions,
      })),
      recentTrades: data.trades.slice(0, 12).map((trade) => ({
        id: trade.id,
        agentId: trade.agentId,
        asset: trade.asset,
        side: trade.side,
        status: trade.status,
        confidence: trade.confidence,
        riskPercent: trade.riskPercent,
        initialReason: trade.initialReason,
        lesson: trade.lesson,
        disciplineScore: trade.disciplineScore,
      })),
    },
    guardrails: {
      executionDirect: "blocked",
      finalAuthority: "agent-trader-risk-engine",
      humanValidation: "required_for_sensitive_trades",
      liveTrading: data.sourceStatus.trading === "live-enabled" ? "configured" : "locked",
    },
  };
}
