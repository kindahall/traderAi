"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Bot, BrainCircuit, CheckCircle2, Clock, Play, Radio, RefreshCw, ShieldCheck, Square, Zap } from "lucide-react";
import type { PaperPosition, PaperTradingEvent, PaperTradingMetrics, PaperTradingState } from "@/server/paper-trading/types";
import { Button } from "@/components/ui/button";
import { GlassCard, InfoHint, ProgressBar, StatusBadge, Timeline } from "@/components/ui/dashboard";
import { cn } from "@/lib/utils";

type PaperStatePayload = PaperTradingState & {
  source?: string;
  file?: string;
};

type RuntimeHealthPayload = {
  pid: number;
  baseUrl: string;
  intervalMs: number;
  minAgeMs: number;
  maxCycles: number;
  cyclesTriggered: number;
  updatedAt: string;
  status: string;
  stateCycles?: number;
  cycleId?: string;
  eventsCreated?: number;
  equityUsd?: number;
  openPositions?: number;
  closedPositions?: number;
  unrealizedPnlUsd?: number;
  lastCycleAt?: string | null;
};

type RuntimeStatusPayload = {
  pid: number | null;
  alive: boolean;
  pidFile: string;
  logFile: string;
  healthFile: string;
  health: RuntimeHealthPayload | null;
  changed?: boolean;
  message?: string;
};

type PaperTradingRuntimePanelProps = {
  selectedAgentId?: string;
  selectedAgentName?: string;
  selectedPair?: string;
};

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)} $`;
}

function formatTime(iso?: string) {
  if (!iso) return "en attente";
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso));
}

function formatAge(iso?: string | null) {
  if (!iso) return "jamais";
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return "inconnu";

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function eventTone(event: PaperTradingEvent) {
  if (event.severity === "danger") return "danger" as const;
  if (event.severity === "warning") return "warning" as const;
  if (event.severity === "success") return "success" as const;
  if (event.severity === "ai") return "ai" as const;
  return "info" as const;
}

function MetricLine({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "success" | "danger" | "warning" | "info" | "ai" | "neutral" }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#16314a] py-2 text-sm last:border-b-0">
      <span className="text-slate-400">{label}</span>
      <span className={cn("font-mono font-semibold", tone === "success" && "text-emerald-300", tone === "danger" && "text-red-300", tone === "warning" && "text-amber-300", tone === "info" && "text-sky-300", tone === "ai" && "text-violet-300", tone === "neutral" && "text-slate-100")}>{value}</span>
    </div>
  );
}

function PositionRow({ position }: { position: PaperPosition }) {
  const pnl = position.status === "closed" ? position.realizedPnlUsd ?? 0 : position.unrealizedPnlUsd;

  return (
    <div className="rounded-xl border border-[#16314a] bg-white/[0.025] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-bold text-white">{position.pair} · {position.side}</div>
          <div className="text-xs text-slate-500">{position.agentName} · risque {position.riskPercent}%</div>
        </div>
        <StatusBadge tone={position.status === "open" ? "info" : pnl >= 0 ? "success" : "danger"}>{position.status}</StatusBadge>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <span className="rounded-lg bg-slate-950/50 px-2 py-1 text-sky-200">Entry {position.entryPrice}</span>
        <span className="rounded-lg bg-slate-950/50 px-2 py-1 text-red-200">SL {position.stopLoss}</span>
        <span className="rounded-lg bg-slate-950/50 px-2 py-1 text-emerald-200">TP {position.takeProfit}</span>
      </div>
      <div className={cn("mt-2 font-mono text-sm font-bold", pnl >= 0 ? "text-emerald-300" : "text-red-300")}>{formatMoney(pnl)}</div>
    </div>
  );
}

export function PaperTradingRuntimePanel({ selectedAgentId, selectedAgentName, selectedPair }: PaperTradingRuntimePanelProps) {
  const [state, setState] = useState<PaperStatePayload | null>(null);
  const [runtime, setRuntime] = useState<RuntimeStatusPayload | null>(null);
  const [cycleBusy, setCycleBusy] = useState(false);
  const [runtimeBusy, setRuntimeBusy] = useState<"start" | "stop" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const metrics: PaperTradingMetrics | undefined = state?.metrics;
  const workerAlive = runtime?.alive ?? false;
  const workerHealth = runtime?.health ?? null;
  const busy = cycleBusy || runtimeBusy !== null;
  const recentEvents = useMemo(() => (state?.events ?? []).slice(-7).toReversed(), [state?.events]);
  const selectedEvents = useMemo(() => recentEvents.filter((event) => (!selectedPair || event.pair === selectedPair || event.pair === "ALL") && (!selectedAgentId || event.agentId === selectedAgentId || event.agentId === "supervisor")).slice(0, 4), [recentEvents, selectedAgentId, selectedPair]);
  const openPositions = useMemo(() => (state?.positions ?? []).filter((position) => position.status === "open").slice(0, 4), [state?.positions]);
  const selectedProfile = useMemo(() => (state?.strategyProfiles ?? []).find((profile) => profile.agentId === selectedAgentId), [selectedAgentId, state?.strategyProfiles]);

  const loadSnapshot = useCallback(async () => {
    const [stateResponse, runtimeResponse] = await Promise.all([
      fetch("/api/paper-trading/state", { cache: "no-store" }),
      fetch("/api/paper-trading/runtime", { cache: "no-store" }),
    ]);

    if (!stateResponse.ok) throw new Error(`state ${stateResponse.status}`);
    if (!runtimeResponse.ok) throw new Error(`runtime ${runtimeResponse.status}`);

    const statePayload = await stateResponse.json() as PaperStatePayload;
    const runtimePayload = await runtimeResponse.json() as { status: RuntimeStatusPayload };
    setState(statePayload);
    setRuntime(runtimePayload.status);
    setError(null);
  }, []);

  const runCycle = useCallback(async (focused = false) => {
    if (workerAlive) {
      setError("Worker actif : cycle manuel bloqué pour éviter un double scheduler.");
      return;
    }

    setCycleBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/paper-trading/cycle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(focused ? { targetAgentId: selectedAgentId, targetPair: selectedPair } : {}),
      });
      if (!response.ok) throw new Error(`cycle ${response.status}`);
      const payload = await response.json() as { state: PaperStatePayload };
      setState(payload.state);
      window.dispatchEvent(new Event("paper-runtime-cycle"));
      window.dispatchEvent(new Event("system-integrity-refresh"));
    } catch (cycleError) {
      setError(cycleError instanceof Error ? cycleError.message : "cycle impossible");
    } finally {
      setCycleBusy(false);
    }
  }, [selectedAgentId, selectedPair, workerAlive]);

  const controlRuntime = useCallback(async (action: "start" | "stop") => {
    if (action === "stop" && !window.confirm("Arrêter le worker paper ? Les chiffres ne se mettront plus à jour automatiquement.")) {
      return;
    }

    setRuntimeBusy(action);
    setError(null);
    try {
      const response = await fetch("/api/paper-trading/runtime", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error(`runtime ${response.status}`);

      const payload = await response.json() as { status: RuntimeStatusPayload };
      setRuntime(payload.status);
      await loadSnapshot();
      window.dispatchEvent(new Event("system-integrity-refresh"));
    } catch (runtimeError) {
      setError(runtimeError instanceof Error ? runtimeError.message : "runtime impossible");
    } finally {
      setRuntimeBusy(null);
    }
  }, [loadSnapshot]);

  useEffect(() => {
    let active = true;

    const refresh = () => {
      void loadSnapshot().catch((snapshotError) => {
        if (active) setError(snapshotError instanceof Error ? snapshotError.message : "snapshot impossible");
      });
    };

    refresh();
    const interval = window.setInterval(refresh, 15_000);
    window.addEventListener("paper-runtime-cycle", refresh);
    window.addEventListener("system-integrity-refresh", refresh);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("paper-runtime-cycle", refresh);
      window.removeEventListener("system-integrity-refresh", refresh);
    };
  }, [loadSnapshot]);

  return (
    <GlassCard glow className="border-emerald-500/25">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-bold text-white"><Bot className="size-5 text-emerald-300" /> Runtime paper<InfoHint content="Worker serveur local. Il lance les cycles paper même si le navigateur reste passif." /></div>
        </div>
        <StatusBadge tone={workerAlive ? "success" : "warning"}><Radio className={cn("size-3", workerAlive && "animate-pulse")} /> {workerAlive ? "worker actif" : "worker arrêté"}</StatusBadge>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant={workerAlive ? "danger" : "success"} size="sm" onClick={() => void controlRuntime(workerAlive ? "stop" : "start")} disabled={busy}>
          {workerAlive ? <Square className="size-4" /> : <Play className="size-4" />} {workerAlive ? "Arrêter worker" : "Démarrer worker"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void loadSnapshot()} disabled={busy}>
          <RefreshCw className="size-4" /> Actualiser
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void runCycle(true)} disabled={busy || workerAlive} title={workerAlive ? "Le worker est actif : cycle manuel désactivé." : undefined}>
          <Zap className="size-4" /> Cycle agent
        </Button>
        <Button variant="ai" size="sm" onClick={() => void runCycle(false)} disabled={busy || workerAlive} title={workerAlive ? "Le worker est actif : cycle manuel désactivé." : undefined}>
          <Activity className="size-4" /> Cycle global tous agents
        </Button>
      </div>

      {error ? <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div> : null}

      <div className="mt-4 rounded-2xl border border-[#16314a] bg-slate-950/35 p-3">
        <MetricLine label="Processus" value={workerAlive ? `PID ${runtime?.pid ?? "-"}` : "arrêté"} tone={workerAlive ? "success" : "warning"} />
        <MetricLine label="Santé worker" value={workerHealth?.status ?? "-"} tone={workerAlive ? "success" : "neutral"} />
        <MetricLine label="Cycles worker" value={`${workerHealth?.cyclesTriggered ?? 0}`} tone="ai" />
        <MetricLine label="Dernière santé" value={formatAge(workerHealth?.updatedAt)} tone={workerAlive ? "info" : "neutral"} />
      </div>

      <div className="mt-4 rounded-2xl border border-[#16314a] bg-slate-950/35 p-3">
        <MetricLine label="Equity paper" value={formatMoney(metrics?.equityUsd ?? 0)} tone={(metrics?.equityUsd ?? 0) >= (state?.capitalUsd ?? 0) ? "success" : "danger"} />
        <MetricLine label="P&L réalisé" value={formatMoney(metrics?.realizedPnlUsd ?? 0)} tone={(metrics?.realizedPnlUsd ?? 0) >= 0 ? "success" : "danger"} />
        <MetricLine label="P&L latent" value={formatMoney(metrics?.unrealizedPnlUsd ?? 0)} tone={(metrics?.unrealizedPnlUsd ?? 0) >= 0 ? "success" : "danger"} />
        <MetricLine label="Positions ouvertes" value={`${metrics?.openPositions ?? 0}`} tone="info" />
        <MetricLine label="Cycles" value={`${metrics?.cycles ?? 0}`} tone="ai" />
        <MetricLine label="Dernier cycle" value={formatTime(metrics?.lastCycleAt)} tone="neutral" />
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 font-bold text-white"><ShieldCheck className="size-4 text-emerald-300" /> Discipline</span>
          <span className="font-mono text-slate-100">{metrics?.disciplineScore ?? 100}/100</span>
        </div>
        <ProgressBar value={metrics?.disciplineScore ?? 100} tone={(metrics?.disciplineScore ?? 100) >= 80 ? "success" : "warning"} />
      </div>

      {selectedAgentName || selectedPair ? (
        <div className="mt-4 rounded-2xl border border-violet-500/20 bg-violet-500/8 p-3 text-xs text-violet-100">
          Vue ciblée : {selectedAgentName ?? "agent"} · {selectedPair ?? "paire"}.
        </div>
      ) : null}

      {selectedProfile ? (
        <div className="mt-4 rounded-2xl border border-violet-500/25 bg-violet-500/[0.06] p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-bold text-white"><BrainCircuit className="size-4 text-violet-300" /> Stratégie évolutive</span>
            <StatusBadge tone="ai">{selectedProfile.reviewCount} revue(s)</StatusBadge>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <span className="rounded-lg bg-slate-950/45 px-2 py-1 text-slate-300">Confiance min <b className="font-mono text-white">{selectedProfile.minConfidence}</b></span>
            <span className="rounded-lg bg-slate-950/45 px-2 py-1 text-slate-300">Volume min <b className="font-mono text-white">x{selectedProfile.minVolumeRatio}</b></span>
            <span className="rounded-lg bg-slate-950/45 px-2 py-1 text-slate-300">Cooldown <b className="font-mono text-white">{selectedProfile.cooldownMinutes}m</b></span>
            <span className="rounded-lg bg-slate-950/45 px-2 py-1 text-slate-300">Risque x <b className="font-mono text-white">{selectedProfile.riskMultiplier}</b></span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-violet-100/80">Rationale <InfoHint content={selectedProfile.rationale} /></div>
        </div>
      ) : null}

      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2 font-bold text-white"><Clock className="size-4 text-sky-300" /> Événements récents</div>
        <Timeline items={(selectedEvents.length ? selectedEvents : recentEvents.slice(0, 4)).map((event) => ({
          time: formatTime(event.timestamp),
          title: `${event.agentName} · ${event.title}`,
          detail: event.detail,
          tone: eventTone(event),
        }))} />
      </div>

      {openPositions.length ? (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-2 font-bold text-white"><BrainCircuit className="size-4 text-violet-300" /> Positions paper</div>
          <div className="space-y-2">{openPositions.map((position) => <PositionRow key={position.id} position={position} />)}</div>
        </div>
      ) : (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-[#16314a] bg-white/[0.025] p-3 text-xs text-slate-400">
          <CheckCircle2 className="mt-0.5 size-4 text-emerald-300" />
          Aucune position paper ouverte.
        </div>
      )}
    </GlassCard>
  );
}
