export const maturityScores = [
  { subject: "Discipline", score: 78, weight: 30 },
  { subject: "Gestion du risque", score: 72, weight: 25 },
  { subject: "Qualité décisionnelle", score: 70, weight: 20 },
  { subject: "Patience", score: 68, weight: 15 },
  { subject: "Profit", score: 65, weight: 10 },
  { subject: "Robustesse", score: 74, weight: 0 },
  { subject: "Conformité", score: 80, weight: 0 },
];

export const scoreEvolution = [
  { day: "25 avr.", discipline: 78, risk: 72, decisions: 66, patience: 52, global: 67 },
  { day: "2 mai", discipline: 77, risk: 74, decisions: 67, patience: 56, global: 68 },
  { day: "9 mai", discipline: 79, risk: 75, decisions: 68, patience: 51, global: 69 },
  { day: "16 mai", discipline: 82, risk: 77, decisions: 70, patience: 55, global: 71 },
  { day: "23 mai", discipline: 84, risk: 79, decisions: 72, patience: 60, global: 73 },
];

export const weeklyBars = [
  { day: "Dim 18", pnl: 0.42 },
  { day: "Lun 19", pnl: 1.15 },
  { day: "Mar 20", pnl: -0.68 },
  { day: "Mer 21", pnl: 1.89 },
  { day: "Jeu 22", pnl: 0.37 },
  { day: "Ven 23", pnl: -0.42 },
  { day: "Sam 24", pnl: 0.54 },
];

export const weeklyLessons = {
  worked: ["Respect du plan de trading", "Gestion du risque disciplinée", "Entrées sur cassures validées", "Sorties partielles efficaces", "Filtrage des ranges"],
  failed: ["Trades en fin de journée", "Réactions aux news", "Surexposition BTC", "Entrées sans confirmation", "Stop déplacé trop tôt"],
  repeated: ["Entrée sans confluence", "Sortie anticipée gagnante", "Surtading après perte", "Taille position incohérente", "Oubli mise à jour stop"],
  adjustments: ["Attendre confluence multi-timeframe", "Réduire séances faibles", "Limiter exposition BTC < 40%", "Augmenter taille setups A+", "Utiliser trailing stop dynamique"],
};

export const crisisScenarios = [
  { name: "Flash crash BTC", detail: "-10 % en 15 min", severity: "ÉLEVÉE", impact: -2.14, survival: 98, robustness: 92 },
  { name: "API exchange indisponible", detail: "15 min", severity: "MOYENNE", impact: -0.42, survival: 94, robustness: 88 },
  { name: "Spread anormal", detail: "x5 du spread médian", severity: "MOYENNE", impact: -0.18, survival: 96, robustness: 90 },
  { name: "3 pertes consécutives", detail: "Sur 1h", severity: "ÉLEVÉE", impact: -1.2, survival: 90, robustness: 84 },
  { name: "News macro violente", detail: "CPI surprise / FOMC", severity: "ÉLEVÉE", impact: -1.65, survival: 91, robustness: 86 },
  { name: "Ordre partiellement exécuté", detail: "Remplissage < 50 %", severity: "MOYENNE", impact: -0.28, survival: 95, robustness: 89 },
  { name: "Gap sous stop-loss", detail: "Ouverture -8 %", severity: "CRITIQUE", impact: -3.1, survival: 82, robustness: 76 },
];

export const crisisTimeline = [
  { title: "Détection", time: "T0", detail: "Anomalie détectée BTC -4,8 %, volume +215 %", status: "ok" },
  { title: "Freeze", time: "T+00:05", detail: "Nouvelles entrées bloquées, stratégies en pause", status: "ok" },
  { title: "Réduction d'exposition", time: "T+00:15", detail: "Exposition réduite de 68 %, positions sécurisées", status: "ok" },
  { title: "Refus d'ordre", time: "T+00:32", detail: "Ordres à risque bloqués, slippage évité", status: "ok" },
  { title: "Kill Switch", time: "T+00:45", detail: "Drawdown > seuil, exposition = 0 %", status: "ok" },
  { title: "Reprise", time: "T+02:37", detail: "Conditions normales revalidées", status: "ok" },
];

export const validationRequests = [
  { time: "09:21:34", agent: "Alpha-01", asset: "BTC/USDT", side: "LONG", confidence: 78, risk: "1,82 ATR", reason: "Montant élevé", deadline: "09:51:34", amount: "6 210,50 $" },
  { time: "09:18:02", agent: "Alpha-02", asset: "ETH/USDT", side: "SHORT", confidence: 62, risk: "2,34 ATR", reason: "Confiance faible", deadline: "09:48:02", amount: "1 532,00 $" },
  { time: "09:15:44", agent: "Alpha-01", asset: "SOL/USDT", side: "LONG", confidence: 85, risk: "1,21 ATR", reason: "Premier trade stratégie", deadline: "09:45:44", amount: "1 710,30 $" },
  { time: "09:10:11", agent: "Alpha-03", asset: "XRP/USDT", side: "LONG", confidence: 71, risk: "1,65 ATR", reason: "Après 2 pertes", deadline: "09:40:11", amount: "845,40 $" },
  { time: "09:05:32", agent: "Alpha-02", asset: "AVAX/USDT", side: "LONG", confidence: 58, risk: "2,75 ATR", reason: "Actif non testé", deadline: "09:35:32", amount: "1 980,00 $" },
];
