import type { Severity } from "./trading";

export type RiskRule = {
  id: string;
  name: string;
  description: string;
  type: "Risque" | "Marché" | "Comportement" | "Validation" | "Système";
  severity: Severity;
  status: "active" | "draft" | "disabled";
  targets: { agents: number; strategies: number; markets?: string[] };
  lastTriggered: string;
  conditions: string[];
  actions: string[];
  conflicts: string[];
  impact: string;
};

export type RiskLimit = {
  label: string;
  current: number;
  limit: number;
  unit: string;
};

export type Alert = {
  id: string;
  time: string;
  severity: Severity;
  type: "Risque" | "API" | "Stratégie" | "Apprentissage" | "Validation humaine" | "Système";
  title: string;
  detail: string;
  agent: string;
  market: string;
  status: "active" | "pending" | "resolved";
  rootCause: string;
  recommendedAction: string;
};
