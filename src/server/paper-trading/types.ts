import type { Agent } from "@/types/agent";
import type { MarketAsset, MarketCandle, TradeSide } from "@/types/trading";

export type PaperEventType =
  | "agent_heartbeat"
  | "agent_standby"
  | "market_snapshot"
  | "signal_detected"
  | "signal_ignored"
  | "analysis_rejected"
  | "strategy_plan"
  | "strategy_adjustment"
  | "risk_check"
  | "audit_check"
  | "paper_order"
  | "position_update"
  | "trade_closed"
  | "supervisor_review"
  | "kill_switch";

export type PaperEventSeverity = "info" | "success" | "warning" | "danger" | "ai";

export type PaperTradingEvent = {
  id: string;
  cycleId: string;
  decisionId?: string;
  timestamp: string;
  type: PaperEventType;
  severity: PaperEventSeverity;
  agentId: string;
  agentName: string;
  pair: string;
  title: string;
  detail: string;
  payload?: Record<string, string | number | boolean | null | string[]>;
};

export type PaperPositionStatus = "open" | "closed";

export type PaperPosition = {
  id: string;
  decisionId: string;
  agentId: string;
  agentName: string;
  pair: string;
  side: TradeSide;
  status: PaperPositionStatus;
  openedAt: string;
  closedAt?: string;
  entryPrice: number;
  currentPrice: number;
  exitPrice?: number;
  stopLoss: number;
  takeProfit: number;
  quantity: number;
  notionalUsd: number;
  marginUsd?: number;
  leverage?: number;
  riskUsd: number;
  riskPercent: number;
  confidence: number;
  rationale: string;
  exitReason?: string;
  realizedPnlUsd?: number;
  unrealizedPnlUsd: number;
  pnlPercent: number;
};

export type PaperTradingMetrics = {
  equityUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  openPositions: number;
  closedPositions: number;
  refusedSignals: number;
  cycles: number;
  winRate: number;
  disciplineScore: number;
  lastCycleAt?: string;
};

export type PaperTradingState = {
  version: 1;
  createdAt: string;
  updatedAt: string;
  capitalUsd: number;
  metrics: PaperTradingMetrics;
  strategyProfiles: StrategyRuntimeProfile[];
  positions: PaperPosition[];
  events: PaperTradingEvent[];
};

export type MarketSignal = {
  agent: Agent;
  pair: string;
  asset: MarketAsset;
  candles: MarketCandle[];
  lastPrice: number;
  momentumPct: number;
  volatilityPct: number;
  volumeRatio: number;
  atr: number;
  confidence: number;
  direction: "bullish" | "bearish" | "neutral";
  reason: string;
};

export type StrategyPlan = {
  decisionId: string;
  agent: Agent;
  pair: string;
  side: TradeSide;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskPercent: number;
  confidence: number;
  volumeRatio: number;
  rationale: string;
  invalidation: string;
};

export type RiskDecision = {
  allowed: boolean;
  severity: PaperEventSeverity;
  reasons: string[];
  adjustedRiskPercent: number;
  executorMode: "agent" | "central-paper" | "blocked";
};

export type StrategyRuntimeProfile = {
  agentId: string;
  strategy: string;
  minConfidence: number;
  minVolumeRatio: number;
  cooldownMinutes: number;
  advisoryExecutorMinConfidence: number;
  riskMultiplier: number;
  reviewCount: number;
  updatedAt: string;
  rationale: string;
};

export type PaperCycleResult = {
  state: PaperTradingState;
  cycleId: string;
  events: PaperTradingEvent[];
};
