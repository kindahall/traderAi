export const APP_NAME = "Agent Trader AI";

export const DISCLAIMERS = [
  "Cette application ne fournit pas de conseil financier.",
  "Les performances passées ou simulées ne garantissent pas les performances futures.",
  "Le trading comporte un risque de perte en capital.",
  "L'utilisateur reste responsable de l'activation du mode réel.",
  "Le paper trading doit être utilisé avant tout déploiement réel.",
];

export const CAPITAL_STAGES = [
  { id: "observer", label: "Observateur", capital: "0 $", state: "completed" },
  { id: "paper", label: "Paper Trading", capital: "1 000 $", state: "completed" },
  { id: "real-5", label: "5 $", capital: "5 $", state: "current" },
  { id: "real-10", label: "10 $", capital: "10 $", state: "pending" },
  { id: "real-25", label: "25 $", capital: "25 $", state: "locked" },
  { id: "real-50", label: "50 $", capital: "50 $", state: "locked" },
  { id: "real-100", label: "100 $", capital: "100 $", state: "locked" },
] as const;
