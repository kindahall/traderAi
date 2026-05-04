import type { MarketAsset } from "@/types/trading";

export const marketAssets: MarketAsset[] = [
  { symbol: "BTC/USDT", name: "Bitcoin", price: 67432.18, change24h: 2.45, volume24h: "28,45B $", volatility: 2.45, confidence: 68, authorized: true, correlationBtc: 1, signal: "Accumulation", strength: "Fort" },
  { symbol: "ETH/USDT", name: "Ethereum", price: 3145.2, change24h: 3.12, volume24h: "15,87B $", volatility: 3.12, confidence: 62, authorized: true, correlationBtc: 0.89, signal: "Rebond support", strength: "Moyen" },
  { symbol: "SOL/USDT", name: "Solana", price: 171.3, change24h: 4.18, volume24h: "4,92B $", volatility: 4.18, confidence: 55, authorized: true, correlationBtc: 0.76, signal: "Breakout résistance", strength: "Très fort" },
  { symbol: "XRP/USDT", name: "XRP", price: 0.5152, change24h: 3.01, volume24h: "2,31B $", volatility: 3.01, confidence: 48, authorized: false, correlationBtc: 0.42, signal: "Volume en hausse", strength: "Moyen" },
  { symbol: "ADA/USDT", name: "Cardano", price: 0.4618, change24h: 2.21, volume24h: "1,12B $", volatility: 2.21, confidence: 46, authorized: false, correlationBtc: 0.35, signal: "Range", strength: "Faible" },
  { symbol: "AVAX/USDT", name: "Avalanche", price: 35.62, change24h: 3.89, volume24h: "1,05B $", volatility: 3.89, confidence: 66, authorized: true, correlationBtc: 0.28, signal: "Momentum haussier", strength: "Fort" },
  { symbol: "DOGE/USDT", name: "Dogecoin", price: 0.1512, change24h: 1.64, volume24h: "1,78B $", volatility: 3.18, confidence: 63, authorized: true, correlationBtc: 0.21, signal: "Compression", strength: "Moyen" },
  { symbol: "DOT/USDT", name: "Polkadot", price: 6.21, change24h: -0.25, volume24h: "241,2M $", volatility: 3.96, confidence: 45, authorized: false, correlationBtc: -0.12, signal: "Faible liquidité", strength: "Faible" },
  { symbol: "LINK/USDT", name: "Chainlink", price: 15.82, change24h: -0.48, volume24h: "692M $", volatility: 3.42, confidence: 43, authorized: false, correlationBtc: 0.18, signal: "Attente", strength: "Faible" },
  { symbol: "LTC/USDT", name: "Litecoin", price: 82.34, change24h: -0.92, volume24h: "410M $", volatility: 3.2, confidence: 41, authorized: false, correlationBtc: 0.26, signal: "Sous EMA", strength: "Faible" },
];

export const priceSeries = Array.from({ length: 48 }, (_, index) => {
  const base = 65000 + index * 56 + Math.sin(index / 2.7) * 760 + Math.cos(index / 5) * 520;
  return {
    label: index % 8 === 0 ? `${20 + Math.floor(index / 8)}` : "",
    price: Math.round(base),
    equity: Math.round(8200 + index * 125 + Math.sin(index / 3) * 420),
    benchmark: Math.round(8000 + index * 83 + Math.cos(index / 4) * 360),
    volume: Math.round(300 + Math.abs(Math.sin(index)) * 780),
    pnl: Number((Math.sin(index / 2) * 0.85 + (index % 9 === 0 ? -0.65 : 0.42)).toFixed(2)),
  };
});

export const monthlyHeatmap = [
  [4.8, 6.2, -1.8, 7.3, 3.2, 8.4, 0.8, 2.1, -1.3, 2.8, 6.6, 2.9],
  [3.2, -1.5, 4.7, 6.3, -0.8, 4.9, 3.1, -2.0, 7.0, 1.8, 2.4, 4.1],
  [-3.2, 1.5, 2.7, -0.3, 0.8, -4.9, 3.1, -2.0, 7.0, 1.8, 2.4, 4.1],
];
