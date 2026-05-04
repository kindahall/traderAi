"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Lock, Server, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type IntegrityPayload = {
  market: {
    label: string;
    instrumentType: string;
    source: string;
  };
  paperRuntime: {
    status: "fresh" | "stale" | "empty";
    lastCycleAt: string | null;
    lastCycleAgeSeconds: number | null;
    cycles: number;
    process: {
      alive: boolean;
    };
  };
  killSwitch: {
    active: boolean;
  };
  dataMode: {
    demoTradesIncluded: boolean;
    tradeSource: string;
  };
  liveExecution: {
    status: string;
  };
  truthAudit?: {
    counts: {
      live: number;
      runtime: number;
      config: number;
      locked: number;
    };
  };
};

function ageLabel(seconds: number | null) {
  if (seconds === null) return "aucun cycle";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m${remaining.toString().padStart(2, "0")}`;
}

function timeLabel(iso: string | null) {
  if (!iso) return "--:--:--";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function SystemIntegrityBanner() {
  const [integrity, setIntegrity] = useState<IntegrityPayload | null>(null);
  const lastCyclesRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/system/integrity", { cache: "no-store" });
    if (!response.ok) return;
    const nextIntegrity = await response.json() as IntegrityPayload;
    const nextCycles = nextIntegrity.paperRuntime.cycles;
    if (lastCyclesRef.current !== null && nextCycles !== lastCyclesRef.current) {
      window.dispatchEvent(new CustomEvent("paper-runtime-cycle", { detail: { cycles: nextCycles } }));
    }
    lastCyclesRef.current = nextCycles;
    setIntegrity(nextIntegrity);
  }, []);

  useEffect(() => {
    const firstLoad = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 15_000);
    window.addEventListener("system-integrity-refresh", load);
    return () => {
      window.clearTimeout(firstLoad);
      window.clearInterval(timer);
      window.removeEventListener("system-integrity-refresh", load);
    };
  }, [load]);

  if (!integrity) return null;

  const runtimeOk = integrity.paperRuntime.status === "fresh";

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl border border-[#16314a] bg-slate-950/45 px-3 py-2 text-xs text-slate-300">
      <span className={cn("inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-semibold", runtimeOk ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : "border-amber-400/30 bg-amber-500/10 text-amber-300")}>
        {runtimeOk ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
        Paper {integrity.paperRuntime.status} · {timeLabel(integrity.paperRuntime.lastCycleAt)} · {ageLabel(integrity.paperRuntime.lastCycleAgeSeconds)}
      </span>
      <span className={cn("inline-flex items-center gap-1 rounded-lg border px-2 py-1", integrity.paperRuntime.process.alive ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : "border-amber-400/30 bg-amber-500/10 text-amber-300")}>
        Worker {integrity.paperRuntime.process.alive ? "actif" : "arrêté"}
      </span>
      <span className="inline-flex items-center gap-1 rounded-lg border border-sky-400/25 bg-sky-500/10 px-2 py-1 text-sky-200">
        <Server className="size-3.5" />
        {integrity.market.label} · {integrity.market.instrumentType}
      </span>
      <span className={cn("inline-flex items-center gap-1 rounded-lg border px-2 py-1", integrity.dataMode.demoTradesIncluded ? "border-red-400/30 bg-red-500/10 text-red-300" : "border-emerald-400/30 bg-emerald-500/10 text-emerald-300")}>
        Données démo {integrity.dataMode.demoTradesIncluded ? "ON" : "OFF"}
      </span>
      <span className="inline-flex items-center gap-1 rounded-lg border border-red-400/25 bg-red-500/10 px-2 py-1 text-red-200">
        <Lock className="size-3.5" />
        Live {integrity.liveExecution.status}
      </span>
      {integrity.truthAudit ? (
        <span className="inline-flex items-center gap-1 rounded-lg border border-violet-400/25 bg-violet-500/10 px-2 py-1 text-violet-200">
          Vérité · {integrity.truthAudit.counts.live} live · {integrity.truthAudit.counts.runtime} runtime · {integrity.truthAudit.counts.config} config · {integrity.truthAudit.counts.locked} locked
        </span>
      ) : null}
      {integrity.killSwitch.active ? (
        <span className="inline-flex items-center gap-1 rounded-lg border border-red-400/40 bg-red-500/15 px-2 py-1 font-semibold text-red-200">
          <ShieldAlert className="size-3.5" />
          Kill switch actif
        </span>
      ) : null}
    </div>
  );
}
