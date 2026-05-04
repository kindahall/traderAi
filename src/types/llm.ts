import type { ConnectionStatus } from "./trading";

export type LLMRole = "principal" | "rapide" | "auditeur" | "fallback";
export type LLMProviderRegion = "US" | "EU" | "Chine" | "Japon" | "Corée" | "Global" | "Custom";
export type LLMApiFormat = "OpenAI-compatible" | "Anthropic-compatible" | "Native" | "Custom adapter";

export type LLMModel = {
  name: string;
  modelId: string;
  recommendedRoles: LLMRole[];
  contextWindow: string;
  reasoning: boolean;
  toolCalling: boolean;
  multimodal: boolean;
  custom?: boolean;
  availability: "catalog" | "custom" | "private" | "deprecated_alias";
};

export type LLMProvider = {
  id: string;
  name: string;
  region: LLMProviderRegion;
  envKey: string;
  endpoint: string;
  apiFormat: LLMApiFormat;
  status: ConnectionStatus;
  maskedKey: string;
  latencyMs: number;
  estimatedDailyCost: number;
  errorRate: number;
  tokensToday: number;
  models: LLMModel[];
};

export type LLMRoleConfig = {
  role: LLMRole;
  providerId: string;
  modelId: string;
  fallbackModelId?: string;
  temperature: number;
  reasoningLevel: "low" | "medium" | "high" | "xhigh";
  tokenLimit: number;
};
