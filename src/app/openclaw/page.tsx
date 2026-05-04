export const dynamic = "force-dynamic";

import { OpenClawRuntimeWorkspace } from "@/components/openclaw/OpenClawRuntimeWorkspace";
import { getOpenClawConnectorConfig } from "@/server/openclaw/client";
import { getOpenClawContextSources } from "@/server/openclaw/context";
import { readOpenClawRolePolicy } from "@/server/openclaw/policy-store";
import type { OpenClawRuntimeSnapshot } from "@/types/openclaw";

export default async function Page() {
  const config = getOpenClawConnectorConfig();
  const rolePolicy = await readOpenClawRolePolicy();
  const configured = Boolean(config.gatewayUrl && (config.authMode === "none" || (config.authMode === "token" && config.tokenConfigured) || (config.authMode === "password" && config.passwordConfigured)));
  const initialSnapshot: OpenClawRuntimeSnapshot = {
    config,
    status: {
      state: configured ? "configured" : "missing_config",
      configured,
      gatewayUrl: config.gatewayUrl,
      authMode: config.authMode,
      defaultAgentId: config.defaultAgentId,
      message: configured ? "Configuration prête à tester" : "Configuration OpenClaw incomplète",
    },
    agents: [],
    rolePolicy,
    dataSources: getOpenClawContextSources(),
    logs: [],
  };

  return <OpenClawRuntimeWorkspace initialSnapshot={initialSnapshot} />;
}
