"use client";

import { useCallback, useMemo, useState } from "react";
import { BrainCircuit, Cpu, Power, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard, InfoHint, StatusBadge } from "@/components/ui/dashboard";
import { cn } from "@/lib/utils";

type PaperAgentRuntimeRole = "scanner" | "analyst" | "risk" | "auditor" | "executor";
type PaperAgentRuntimeMode = "deterministic" | "ai";
type LocalAnalysisProviderSelection = "none" | "codex" | "openclaw";

export type PaperAgentRoutingConfig = {
  version: 1;
  updatedAt: string;
  roles: Record<PaperAgentRuntimeRole, PaperAgentRuntimeMode>;
  providerId: "openclaw" | "codex" | null;
  failClosed: boolean;
  source: "file" | "env" | "defaults";
};

export type LocalAnalysisProviderConfig = {
  version: 1;
  updatedAt: string;
  selection: LocalAnalysisProviderSelection;
  providerId: "openclaw" | "codex" | null;
  source: "file" | "env" | "defaults";
};

type PaperAgentRoutingPanelProps = {
  initialConfig: PaperAgentRoutingConfig;
  initialProviderConfig: LocalAnalysisProviderConfig;
};

const ROLE_ROWS: Array<{ role: PaperAgentRuntimeRole; label: string; hint: string }> = [
  { role: "scanner", label: "Scanner", hint: "Observe les bougies et transforme le marché en signal exploitable." },
  { role: "analyst", label: "Analyste", hint: "Transforme un signal en plan avec entrée, stop, objectif et thèse." },
  { role: "risk", label: "Risk Engine", hint: "Autorise, bloque ou réduit le risque d'un plan paper." },
  { role: "auditor", label: "Auditeur", hint: "Contrôle la cohérence finale avant ouverture paper." },
  { role: "executor", label: "Exécuteur", hint: "Confirme ou ignore l'ouverture d'un ordre paper." },
];

const PROVIDER_ROWS: Array<{ selection: LocalAnalysisProviderSelection; label: string; icon: "off" | "codex" }> = [
  { selection: "none", label: "Off", icon: "off" },
  { selection: "codex", label: "Codex", icon: "codex" },
  { selection: "openclaw", label: "OpenClaw", icon: "codex" },
];

function formatTime(iso?: string) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso));
}

export function PaperAgentRoutingPanel({ initialConfig, initialProviderConfig }: PaperAgentRoutingPanelProps) {
  const [config, setConfig] = useState<PaperAgentRoutingConfig | null>(initialConfig);
  const [providerConfig, setProviderConfig] = useState<LocalAnalysisProviderConfig>(initialProviderConfig);
  const [busyRole, setBusyRole] = useState<PaperAgentRuntimeRole | "refresh" | null>(null);
  const [providerBusy, setProviderBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aiRoles = useMemo(() => {
    if (!config) return 0;
    return Object.values(config.roles).filter((mode) => mode === "ai").length;
  }, [config]);

  const loadConfig = useCallback(async () => {
    setBusyRole("refresh");
    try {
      const [routingResponse, providerResponse] = await Promise.all([
        fetch("/api/paper-trading/agent-routing", { cache: "no-store" }),
        fetch("/api/analysis/provider", { cache: "no-store" }),
      ]);
      if (!routingResponse.ok) throw new Error(`routing ${routingResponse.status}`);
      if (!providerResponse.ok) throw new Error(`provider ${providerResponse.status}`);
      const routingPayload = await routingResponse.json() as { config: PaperAgentRoutingConfig };
      const providerPayload = await providerResponse.json() as { config: LocalAnalysisProviderConfig };
      setConfig(routingPayload.config);
      setProviderConfig(providerPayload.config);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "routing indisponible");
    } finally {
      setBusyRole(null);
    }
  }, []);

  const updateProvider = useCallback(async (selection: LocalAnalysisProviderSelection) => {
    if (providerConfig.selection === selection) return;

    setProviderBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/analysis/provider", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selection }),
      });
      if (!response.ok) throw new Error(`provider ${response.status}`);
      const payload = await response.json() as { config: LocalAnalysisProviderConfig };
      setProviderConfig(payload.config);
      setConfig((current) => current ? { ...current, providerId: payload.config.providerId } : current);
      window.dispatchEvent(new Event("system-integrity-refresh"));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "provider impossible");
    } finally {
      setProviderBusy(false);
    }
  }, [providerConfig.selection]);

  const updateRole = useCallback(async (role: PaperAgentRuntimeRole, mode: PaperAgentRuntimeMode) => {
    if (!config || config.roles[role] === mode) return;

    setBusyRole(role);
    setError(null);
    try {
      const response = await fetch("/api/paper-trading/agent-routing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roles: { [role]: mode } }),
      });
      if (!response.ok) throw new Error(`routing ${response.status}`);
      const payload = await response.json() as { config: PaperAgentRoutingConfig };
      setConfig(payload.config);
      window.dispatchEvent(new Event("system-integrity-refresh"));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "mise à jour impossible");
    } finally {
      setBusyRole(null);
    }
  }, [config]);

  return (
    <GlassCard className="border-violet-500/25">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-bold text-white">
            <BrainCircuit className="size-5 text-violet-300" />
            Routing agents paper
            <InfoHint content="Choix du moteur utilisé par chaque rôle pendant les cycles paper. Le live trading garde ses verrous séparés." />
          </div>
          <div className="mt-1 text-xs text-slate-500">Dernière config {formatTime(config?.updatedAt)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={providerConfig.providerId ? "ai" : "warning"}>{providerConfig.providerId ?? "désactivé"}</StatusBadge>
          <StatusBadge tone="neutral">{providerConfig.source}</StatusBadge>
          <StatusBadge tone={aiRoles ? "ai" : "neutral"}>{aiRoles}/5 IA</StatusBadge>
          <StatusBadge tone={config?.failClosed ? "danger" : "success"}>{config?.failClosed ? "fail closed" : "fallback"}</StatusBadge>
          <Button size="sm" variant="ghost" onClick={() => void loadConfig()} disabled={busyRole !== null || providerBusy}>
            <RefreshCw className={cn("size-4", busyRole === "refresh" && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="mb-3 rounded-xl border border-[#16314a] bg-slate-950/35 p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-white">Provider analyse locale</span>
          <InfoHint content="Provider utilisé par les boutons d'analyse locale et par les rôles paper configurés en IA." />
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {PROVIDER_ROWS.map((row) => {
            const selected = providerConfig.selection === row.selection;
            const Icon = row.icon === "off" ? Power : BrainCircuit;

            return (
              <Button
                key={row.selection}
                className={cn("h-9 text-xs", !selected && "opacity-75")}
                disabled={providerBusy || busyRole === "refresh"}
                onClick={() => void updateProvider(row.selection)}
                size="sm"
                variant={selected ? row.selection === "none" ? "warning" : "ai" : "ghost"}
              >
                <Icon className="size-4" /> {row.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-5">
        {ROLE_ROWS.map((row) => {
          const mode = config?.roles[row.role] ?? "deterministic";
          const busy = busyRole === row.role;

          return (
            <div key={row.role} className="rounded-xl border border-[#16314a] bg-slate-950/35 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-bold text-white">{row.label}</span>
                <InfoHint content={row.hint} />
              </div>
              <div className="grid grid-cols-2 gap-1">
                <Button
                  className={cn("h-8 px-2 text-xs", mode !== "deterministic" && "opacity-70")}
                  disabled={!config || busy || busyRole === "refresh"}
                  onClick={() => void updateRole(row.role, "deterministic")}
                  size="sm"
                  variant={mode === "deterministic" ? "success" : "ghost"}
                >
                  <Cpu className="size-3.5" /> Déter.
                </Button>
                <Button
                  className={cn("h-8 px-2 text-xs", mode !== "ai" && "opacity-70")}
                  disabled={!config || busy || busyRole === "refresh"}
                  onClick={() => void updateRole(row.role, "ai")}
                  size="sm"
                  variant={mode === "ai" ? "ai" : "ghost"}
                >
                  <BrainCircuit className="size-3.5" /> IA
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>
      ) : (
        <div className="mt-3 flex items-center gap-2 text-xs text-emerald-200/80">
          <ShieldCheck className="size-4" />
          Paper uniquement.
        </div>
      )}
    </GlassCard>
  );
}
