export type TradingMode = "observer" | "paper" | "live";
export type TradeSide = "LONG" | "SHORT";
export type Severity = "info" | "warning" | "critical";
export type ConnectionStatus = "connected"  | "pending" | "error" | "locked";

export type CapitalStage = {
  id: string;
  label: string;
  capital: string;
  state: "completed" | "current" | "pending" | "locked";
};

export type MarketAsset = {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24h: string;
  volatility: number;
  confidence: number;
  authorized: boolean;
  exchange?: "dydx" | "binance" | "kraken" | "coinbase";
  exchangeName?: string;
  marketType?: "spot" | "perp";
  exchangeSymbol?: string;
  baseAsset?: string;
  quoteAsset?: string;
  status?: string;
  correlationBtc?: number;
  signal?: string;
  strength?: "Faible" | "Moyen" | "Fort" | "Très fort";
};

export type MarketCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closed?: boolean;
};

export type Trade = {
  id: string;
  decisionId?: string;
  source?: "paper-runtime" | "demo-reference" | "external";
  date: string;
  time: string;
  agentId: string;
  asset: string;
  side: TradeSide;
  entry: number;
  exit?: number;
  stopLoss: number;
  takeProfit: number;
  riskPercent: number;
  confidence: number;
  pnl: number;
  status: "closed" | "open" | "refused" | "pending_validation";
  initialReason: string;
  exitReason: string;
  lesson: string;
  disciplineScore: number;
  tag: string;
};

export type Kpi = {
  label: string;
  value: string;
  delta?: string;
  tone?: "success" | "danger" | "warning" | "info" | "ai" | "neutral";
};

export type AuditLogEvent = {
  time: string;
  title: string;
  detail: string;
  tone: "success" | "danger" | "warning" | "info" | "ai";
};
