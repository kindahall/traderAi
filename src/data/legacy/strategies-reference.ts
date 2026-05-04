export type StrategyDefinition = {
  id: string;
  name: string;
  status: "active" | "inactive" | "draft";
  timeframe: string;
  risk: "Faible" | "Modéré" | "Élevé";
  winRate: number;
  performance: number;
  drawdown: number;
  validationRate: number;
  assets: string[];
  entryRules: string[];
  exitRules: string[];
  filters: string[];
  recommendation: string;
};

export const strategies: StrategyDefinition[] = [
  {
    id: "trend-momentum",
    name: "Trend Momentum",
    status: "active",
    timeframe: "15m",
    risk: "Modéré",
    winRate: 64.3,
    performance: 31.74,
    drawdown: -8.21,
    validationRate: 71.3,
    assets: ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
    entryRules: ["EMA 20 (15m) > EMA 50", "RSI (14) > 55", "Volume > SMA 20", "Aucune news majeure"],
    exitRules: ["EMA 20 < EMA 50", "RSI < 45", "Take-profit atteint", "Stop-loss atteint"],
    filters: ["ADX > 20", "Spread faible", "Volatilité moyenne à élevée"],
    recommendation: "Augmenter le filtre de volume pour réduire les faux signaux.",
  },
  {
    id: "mean-reversion",
    name: "Mean Reversion",
    status: "active",
    timeframe: "1h",
    risk: "Modéré",
    winRate: 58.1,
    performance: 9.42,
    drawdown: -6.32,
    validationRate: 68.5,
    assets: ["ETH/USDT", "XRP/USDT"],
    entryRules: ["RSI < 32", "Prix proche support", "Volume stable"],
    exitRules: ["Retour EMA 20", "RSI > 52", "Temps max 36h"],
    filters: ["Range confirmé", "Pas de tendance forte"],
    recommendation: "Conserver en observation, utile en marché latéral.",
  },
  {
    id: "breakout-h4",
    name: "Breakout H4",
    status: "active",
    timeframe: "4h",
    risk: "Élevé",
    winRate: 61.8,
    performance: 19.86,
    drawdown: -12.84,
    validationRate: 64.8,
    assets: ["BTC/USDT", "SOL/USDT", "AVAX/USDT"],
    entryRules: ["Clôture au-dessus plus haut 20 périodes", "Volume > SMA 20", "Confluence H1/H4"],
    exitRules: ["Trailing stop ATR", "Sortie partielle 1,5R", "Stop dynamique"],
    filters: ["Volatilité > 0,5%", "Session liquide"],
    recommendation: "Backtester hors échantillon avant nouveau palier réel.",
  },
  {
    id: "scalp-volatility",
    name: "Scalp Volatilité",
    status: "inactive",
    timeframe: "5m",
    risk: "Élevé",
    winRate: 55.2,
    performance: -3.71,
    drawdown: -9.12,
    validationRate: 52.4,
    assets: ["SOL/USDT", "DOGE/USDT"],
    entryRules: ["ATR élevé", "Carnet favorable", "Spread normal"],
    exitRules: ["TP rapide", "Stop strict", "Pause après deux pertes"],
    filters: ["Pas de news", "Latence API < 80ms"],
    recommendation: "Désactiver tant que les faux signaux restent élevés.",
  },
];

export const strategyComparison = [
  { date: "24 avr.", trend: 0, breakout: 0, mean: 0, scalp: 0 },
  { date: "1 mai", trend: 8, breakout: 4, mean: 2, scalp: -1 },
  { date: "8 mai", trend: 19, breakout: 12, mean: 4, scalp: -2 },
  { date: "15 mai", trend: 33, breakout: 20, mean: 8, scalp: -4 },
  { date: "22 mai", trend: 52, breakout: 36, mean: 14, scalp: -7 },
];
