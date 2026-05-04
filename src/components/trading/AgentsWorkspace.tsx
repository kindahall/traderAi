"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Activity, BrainCircuit, Plus, Search } from "lucide-react";
import type { Agent } from "@/types/agent";
import type { Trade } from "@/types/trading";
import type { AppDataSnapshot } from "@/server/app-data";
import type { PaperTradingEvent } from "@/server/paper-trading/types";
import { formatPercent, signed } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checklist, GlassCard, InfoHint, KpiCard, ProgressBar, StatusBadge, Timeline, TogglePill } from "@/components/ui/dashboard";
import { Sparkline } from "@/components/charts/charts";
import { PaperAgentRoutingPanel } from "@/components/trading/PaperAgentRoutingPanel";
import type { LocalAnalysisProviderConfig, PaperAgentRoutingConfig } from "@/components/trading/PaperAgentRoutingPanel";

type Props = {
  agents: Agent[];
  priceSeries: Array<{ price: number }>;
  trades: Trade[];
  metrics: AppDataSnapshot["metrics"];
  paperAgentRoutingConfig: PaperAgentRoutingConfig;
  localAnalysisProviderConfig: LocalAnalysisProviderConfig;
  paperEvents: PaperTradingEvent[];
};

type AgentStatusFilter = "all" | Agent["status"];

export function AgentsWorkspace({ agents, priceSeries, trades, metrics, paperAgentRoutingConfig, localAnalysisProviderConfig, paperEvents }: Props) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AgentStatusFilter>("all");
  const [selectedId, setSelectedId] = useState(agents[0]?.id ?? "");
  const [statusOverrides, setStatusOverrides] = useState<Record<string, Agent["status"]>>({});

  const latestRuntimeEventByAgent = useMemo(() => {
    const map = new Map<string, PaperTradingEvent>();
    paperEvents.forEach((event) => {
      if (!event.agentId || event.agentId === "supervisor") return;
      map.set(event.agentId, event);
    });
    return map;
  }, [paperEvents]);

  const effectiveAgents = useMemo(
    () => agents.map((agent) => ({ ...agent, status: statusOverrides[agent.id] ?? agent.status })),
    [agents, statusOverrides],
  );
  const visibleAgents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return effectiveAgents
      .filter((agent) => statusFilter === "all" || agent.status === statusFilter)
      .filter((agent) => {
        if (!normalizedQuery) return true;
        return [agent.name, agent.id, agent.focus, agent.strategy, agent.status, ...agent.roles, ...agent.allowedPairs]
          .some((value) => value.toLowerCase().includes(normalizedQuery));
      });
  }, [effectiveAgents, query, statusFilter]);

  const selected = effectiveAgents.find((agent) => agent.id === selectedId) ?? visibleAgents[0] ?? effectiveAgents[0];
  const activeCount = effectiveAgents.filter((agent) => agent.status === "active").length;
  const pausedCount = effectiveAgents.filter((agent) => agent.status === "paused").length;
  const activeRatio = effectiveAgents.length ? (activeCount / effectiveAgents.length) * 100 : 0;
  const overrideCount = Object.keys(statusOverrides).length;
  const selectedTrades = selected ? trades.filter((trade) => trade.agentId === selected.id) : [];
  const selectedRuntimeEvents = useMemo(
    () => selected ? paperEvents.filter((event) => event.agentId === selected.id).slice(-10).toReversed() : [],
    [paperEvents, selected],
  );
  const selectedLastRuntimeEvent = selected ? latestRuntimeEventByAgent.get(selected.id) : undefined;

  function toggleAgentStatus(agentId: string) {
    const agent = effectiveAgents.find((item) => item.id === agentId);
    if (!agent) return;
    setStatusOverrides((current) => ({
      ...current,
      [agentId]: agent.status === "active" ? "paused" : "active",
    }));
  }

  if (!selected) {
    return (
      <GlassCard className="mt-4">
        <div className="text-sm text-slate-400">Aucun agent configuré.</div>
      </GlassCard>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 size-4 text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 rounded-xl border border-[#16314a] bg-slate-950/60 pl-10 pr-4 text-sm text-slate-100 outline-none placeholder:text-slate-600"
            placeholder="Rechercher un agent..."
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as AgentStatusFilter)}
          className="h-10 rounded-xl border border-[#16314a] bg-slate-950/60 px-3 text-sm text-slate-100 outline-none"
        >
          <option value="all">Tous statuts</option>
          <option value="active">Actifs</option>
          <option value="paused">En pause</option>
          <option value="inactive">Inactifs</option>
        </select>
        <Button disabled={!overrideCount} onClick={() => setStatusOverrides({})} variant="ghost">Réinitialiser session</Button>
        <Link href="/llm-providers"><Button variant="ai"><BrainCircuit className="size-4" /> LLM</Button></Link>
        <Link href="/agents/new"><Button><Plus className="size-4" /> Nouvel agent</Button></Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Agents totaux" value={`${effectiveAgents.length}`} delta={`${pausedCount} en pause`} tone="info" />
        <KpiCard label="Agents actifs" value={`${activeCount}`} delta={`${formatPercent(activeRatio, 1)} du parc`} tone="success" />
        <KpiCard label="Performance moyenne" value={signed(metrics.agent.averagePerformance30d, " %")} delta="30 derniers jours" tone={metrics.agent.averagePerformance30d >= 0 ? "success" : "danger"}><Sparkline data={priceSeries.slice(-18)} color="#22c55e" /></KpiCard>
        <KpiCard label="Incidents (7D)" value={`${metrics.agent.incidents7d}`} delta={`${metrics.risk.activeAlerts} alertes actives`} tone={metrics.agent.incidents7d ? "warning" : "success"} />
        <KpiCard label="Session locale" value={`${overrideCount}`} delta="modification(s) non persistées" tone={overrideCount ? "warning" : "neutral"} />
      </div>

      <div className="mt-4">
        <PaperAgentRoutingPanel initialConfig={paperAgentRoutingConfig} initialProviderConfig={localAnalysisProviderConfig} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[320px_1fr]">
        <GlassCard>
          <CardTitle title="Liste des agents" action={<StatusBadge tone="info">{visibleAgents.length}/{effectiveAgents.length}</StatusBadge>} />
          <div className="space-y-3">
            {visibleAgents.length ? visibleAgents.map((agent) => (
              <div
                key={agent.id}
                className={cn("flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition hover:border-sky-400/60 hover:bg-sky-500/10", agent.id === selected.id ? "border-sky-400/70 bg-sky-500/10" : "border-[#16314a] bg-white/[0.025]")}
              >
                <button type="button" onClick={() => setSelectedId(agent.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <div className="grid size-14 place-items-center rounded-2xl border border-sky-400/30 bg-sky-500/10 text-2xl">{agent.avatar}</div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-white">{agent.name}</div>
                    <div className={agent.status === "active" ? "text-emerald-300" : agent.status === "paused" ? "text-amber-300" : "text-slate-500"}>● {agent.status}</div>
                    <div className="text-xs text-slate-500">Focus : {agent.focus}</div>
                    <div className="mt-1 truncate text-xs text-slate-500">{runtimeEventLabel(latestRuntimeEventByAgent.get(agent.id))}</div>
                  </div>
                </button>
                <TogglePill active={agent.status === "active"} onClick={() => toggleAgentStatus(agent.id)} title="Activation locale pour cette session" />
              </div>
            )) : (
              <div className="rounded-2xl border border-[#16314a] bg-white/[0.025] p-3 text-sm text-slate-400">Aucun agent ne correspond aux filtres.</div>
            )}
          </div>
        </GlassCard>

        <div className="space-y-4">
          <GlassCard>
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-[220px_1fr_260px_300px]">
              <div><div className="flex items-center gap-2"><h2 className="text-2xl font-bold text-white">{selected.name}</h2><StatusBadge tone={selected.status === "active" ? "success" : "warning"}>{selected.status}</StatusBadge></div><div className="mt-5 grid size-36 place-items-center rounded-full border border-sky-400/40 bg-sky-500/10 text-6xl">{selected.avatar}</div></div>
              <FieldRows rows={[["Mode", selected.mode === "paper" ? "Paper Trading" : selected.mode], ["Focus principal", selected.focus], ["Style de trading", selected.strategy], ["Paires autorisées", selected.allowedPairs.join(", ")], ["Dernière action", <span className="text-emerald-300" key="last">{selected.lastAction}</span>], ["Dernière trace runtime", selectedLastRuntimeEvent ? `${eventTime(selectedLastRuntimeEvent.timestamp)} · ${selectedLastRuntimeEvent.title}` : "aucune trace"], ["Latence moyenne", <span className="text-emerald-300" key="lat">{selected.latencyMs} ms</span>]]} />
              <div className="space-y-3">{Object.entries(selected.capabilities).map(([role, value]) => <SliderRow key={role} label={role} value={value} tone="info" />)}</div>
              <div className="space-y-3">{selected.roles.map((role) => <div key={role} className="flex items-center justify-between gap-3 rounded-2xl border border-[#16314a] bg-white/[0.03] p-3"><div className="font-semibold text-violet-200">{role}</div><InfoHint content={role === "Scanner" ? "Surveille le marché en continu" : role === "Analyste" ? "Identifie opportunités et signaux" : role === "Exécuteur" ? "Passe et gère les ordres paper" : "Contrôle risque et conformité"} /></div>)}</div>
            </div>
          </GlassCard>
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <GlassCard><CardTitle title="Paramètres de comportement" />{Object.entries(selected.behavior).map(([key, value]) => <div key={key} className="mb-4"><SliderRow label={key} value={value} tone="info" /></div>)}</GlassCard>
            <GlassCard>
              <CardTitle
                title="Boucle runtime"
                action={<StatusBadge tone={selectedLastRuntimeEvent ? eventTone(selectedLastRuntimeEvent) : "neutral"}><Activity className="size-3" /> {selectedLastRuntimeEvent ? eventTime(selectedLastRuntimeEvent.timestamp) : "aucune trace"}</StatusBadge>}
              />
              {selectedRuntimeEvents.length ? (
                <Timeline items={selectedRuntimeEvents.slice(0, 6).map((event) => ({ time: eventTime(event.timestamp), title: `${event.type.replaceAll("_", " ")} · ${event.title}`, detail: event.detail, tone: eventTone(event) }))} />
              ) : (
                <div className="rounded-2xl border border-amber-400/25 bg-amber-500/8 p-3 text-sm text-amber-100">Aucune trace runtime pour cet agent. Lancez un cycle paper ou démarrez le worker pour confirmer sa présence dans la boucle.</div>
              )}
            </GlassCard>
            <GlassCard><CardTitle title="Apprentissage" action={<StatusBadge tone={selected.learningState === "needs_review" ? "warning" : "success"}>{selected.learningState}</StatusBadge>} /><Checklist items={[{ label: "Détection tendance", status: selected.capabilities.Scanner >= 70 ? "ok" : "warning" }, { label: "Gestion du risque", status: selected.disciplineScore >= 75 ? "ok" : "warning" }, { label: "Réactivité news", status: selected.incidents7d > 2 ? "warning" : "ok" }, { label: "Sorties partielles", status: selected.roles.includes("Exécuteur") ? "ok" : "pending" }]} /></GlassCard>
            <GlassCard><CardTitle title="Actions & historique" action={<StatusBadge tone="info">{selectedTrades.length}</StatusBadge>} /><Timeline items={(selectedTrades.length ? selectedTrades.slice(0, 4) : trades.slice(0, 4)).map((trade) => ({ time: trade.time, title: `${trade.asset} · ${trade.status}`, detail: trade.initialReason, tone: trade.status === "refused" ? "danger" : trade.pnl >= 0 ? "success" : "warning" }))} /></GlassCard>
          </div>
        </div>
      </div>
    </>
  );
}

function eventTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function eventTone(event: PaperTradingEvent) {
  if (event.severity === "danger") return "danger" as const;
  if (event.severity === "warning") return "warning" as const;
  if (event.severity === "success") return "success" as const;
  if (event.severity === "ai") return "ai" as const;
  return "info" as const;
}

function runtimeEventLabel(event: PaperTradingEvent | undefined) {
  if (!event) return "runtime: aucune trace";
  return `${eventTime(event.timestamp)} · ${event.title}`;
}

function CardTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="text-base font-bold text-white">{title}</div>
      {action}
    </div>
  );
}

function FieldRows({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <div className="divide-y divide-[#16314a] text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-4 py-2">
          <span className="text-slate-400">{label}</span>
          <span className="text-right font-medium text-slate-100">{value}</span>
        </div>
      ))}
    </div>
  );
}

function SliderRow({ label, value, tone = "info" }: { label: string; value: number; tone?: "success" | "danger" | "warning" | "info" | "ai" | "neutral" }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="capitalize text-slate-300">{label}</span>
        <span className="font-mono text-white">{Math.round(value)}%</span>
      </div>
      <ProgressBar value={value} tone={tone} />
    </div>
  );
}
