import type { Trade } from "@/types/trading";

export const trades: Trade[] = [
  { id: "TRD-20250524-091712", date: "24/05/2025", time: "09:17:12", agentId: "alpha-01", asset: "BTC/USDT", side: "LONG", entry: 66210.5, exit: 67960.3, stopLoss: 65100, takeProfit: 68200, riskPercent: 0.68, confidence: 82, pnl: 1.77, status: "closed", initialReason: "Breakout + volume", exitReason: "TP atteint", lesson: "Les breakouts avec volume sur BTC 15m sont fiables.", disciplineScore: 92, tag: "Breakout" },
  { id: "TRD-20250524-085110", date: "24/05/2025", time: "08:51:10", agentId: "alpha-01", asset: "BTC/USDT", side: "LONG", entry: 66102.3, exit: 66205.1, stopLoss: 65620, takeProfit: 67200, riskPercent: 0.52, confidence: 71, pnl: -0.5, status: "closed", initialReason: "Rebond support", exitReason: "Stop-loss atteint", lesson: "Attendre une meilleure confluence après pullback.", disciplineScore: 83, tag: "Rebond" },
  { id: "TRD-20250524-083644", date: "24/05/2025", time: "08:36:44", agentId: "alpha-01", asset: "ETH/USDT", side: "SHORT", entry: 3145.2, exit: 3040.1, stopLoss: 3220, takeProfit: 3080.1, riskPercent: 0.61, confidence: 77, pnl: 0.63, status: "closed", initialReason: "Rejet résistance 3.2k", exitReason: "TP partiel", lesson: "Le rejet résistance fonctionne mieux avec volume décroissant.", disciplineScore: 88, tag: "Rejet" },
  { id: "TRD-20250524-064231", date: "24/05/2025", time: "06:42:31", agentId: "alpha-01", asset: "SOL/USDT", side: "LONG", entry: 171.3, stopLoss: 166.2, takeProfit: 181.9, riskPercent: 0.47, confidence: 69, pnl: 0, status: "open", initialReason: "Continuation trend", exitReason: "-", lesson: "Position sous surveillance, trailing désactivé avant confirmation.", disciplineScore: 86, tag: "Trend" },
  { id: "TRD-20250524-032217", date: "24/05/2025", time: "03:22:17", agentId: "alpha-01", asset: "XRP/USDT", side: "SHORT", entry: 0.5123, exit: 0.515, stopLoss: 0.518, takeProfit: 0.49, riskPercent: 0.42, confidence: 58, pnl: -0.38, status: "closed", initialReason: "Divergence + OB", exitReason: "Stop serré", lesson: "Ne pas trader XRP si confiance sous 60%.", disciplineScore: 74, tag: "Divergence" },
  { id: "TRD-20250524-090932", date: "24/05/2025", time: "09:09:32", agentId: "gamma-scalp", asset: "SOL/USDT", side: "LONG", entry: 170.9, stopLoss: 168.8, takeProfit: 176.2, riskPercent: 1.12, confidence: 59, pnl: 0, status: "refused", initialReason: "Signal faible avec spread élevé", exitReason: "Refus moteur risque", lesson: "Spread trop élevé, ordre bloqué correctement.", disciplineScore: 96, tag: "Refus" },
];

export const replaySteps = [
  { step: 1, title: "Signal détecté", time: "09:11:12", detail: "Cassure haussière confirmée au-dessus de 66 000 avec volume." },
  { step: 2, title: "Analyse terminée", time: "09:11:26", detail: "Structure H1 haussière et pullback sur zone support." },
  { step: 3, title: "Risque validé", time: "09:11:38", detail: "Risque 0,68 %, stop obligatoire présent, exposition acceptable." },
  { step: 4, title: "Ordre exécuté", time: "09:11:42", detail: "Achat marché exécuté, slippage faible." },
  { step: 5, title: "Stop déplacé", time: "09:34:18", detail: "Stop déplacé au break-even après +0,8R." },
  { step: 6, title: "TP atteint", time: "10:23:58", detail: "TP1 atteint, sortie partielle automatique." },
  { step: 7, title: "Trade clôturé", time: "10:24:00", detail: "Trade clôturé avec résultat positif." },
];
