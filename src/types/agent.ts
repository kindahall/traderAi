import type { TradingMode } from "./trading";

export type AgentRole = "Scanner" | "Analyste" | "Exécuteur" | "Auditeur";

export type Agent = {
  id: string;
  name: string;
  avatar: string;
  status: "active" | "paused" | "inactive";
  mode: TradingMode;
  focus: string;
  roles: AgentRole[];
  strategy: string;
  modelVersion: string;
  learningState: "learning" | "stable" | "needs_review";
  confidence: number;
  disciplineScore: number;
  performance30d: number;
  incidents7d: number;
  latencyMs: number;
  autonomyLevel: number;
  behavior: {
    aggressiveness: number;
    prudence: number;
    frequency: number;
    adaptation: number;
  };
  capabilities: Record<AgentRole, number>;
  allowedPairs: string[];
  lastAction: string;
};
