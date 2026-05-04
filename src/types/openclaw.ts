export type OpenClawAuthMode = "token" | "password" | "none";

export type OpenClawConnectionState = "configured" | "missing_config" | "connected" | "unavailable" | "error";

export type OpenClawRole = "scanner" | "analyst" | "auditor" | "executor";

export type OpenClawConnectorConfig = {
  gatewayUrl: string;
  authMode: OpenClawAuthMode;
  tokenConfigured: boolean;
  passwordConfigured: boolean;
  defaultAgentId: string;
  requestTimeoutMs: number;
};

export type OpenClawRuntimeStatus = {
  state: OpenClawConnectionState;
  configured: boolean;
  gatewayUrl: string;
  authMode: OpenClawAuthMode;
  defaultAgentId: string;
  version?: string;
  protocol?: number;
  heartbeat?: string;
  latencyMs?: number;
  message: string;
  details?: string;
};

export type OpenClawAgentSummary = {
  id: string;
  name: string;
  status: "active" | "paused" | "inactive" | "unknown";
  runtime: "OpenClaw";
  role: string;
  workspace?: string;
  model?: string;
  lastHeartbeat?: string;
  memory?: "active" | "unknown";
  workflow?: string;
};

export type OpenClawRolePolicy = {
  id: OpenClawRole;
  label: string;
  enabled: boolean;
  locked?: boolean;
  riskAuthority: "none" | "proposal_only" | "requires_risk_engine";
  description: string;
};

export type OpenClawContextSource = {
  id: string;
  label: string;
  endpoint: string;
  roles: OpenClawRole[];
  access: "read" | "guarded" | "blocked";
  cadence: string;
  status: "active" | "planned" | "blocked";
  hint: string;
};

export type OpenClawRuntimeSnapshot = {
  config: OpenClawConnectorConfig;
  status: OpenClawRuntimeStatus;
  agents: OpenClawAgentSummary[];
  rolePolicy: OpenClawRolePolicy[];
  dataSources: OpenClawContextSource[];
  logs: Array<{
    time: string;
    level: "info" | "warning" | "danger" | "success";
    message: string;
  }>;
};
