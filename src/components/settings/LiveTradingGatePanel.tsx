"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BrainCircuit, CheckCircle2, Lock, Power, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checklist, GlassCard, ProgressBar, StatusBadge } from "@/components/ui/dashboard";

type Eligibility = {
  thresholdPercent: number;
  eligible: boolean;
  liveEnabled: boolean;
  performance: {
    pass: boolean;
    bestScore: number;
    source: "paper" | "backtest" | "none";
    paper: {
      pass: boolean;
      winRate: number;
      closedTrades: number;
      minimumTrades: number;
    };
    backtest: {
      pass: boolean;
      score: number;
      strategyName: string;
      winRate: number;
      validationRate: number;
    };
  };
  llm: {
    pass: boolean;
    localProviderId: string | null;
    connectedExternalProviders: string[];
    requiredRoles: string[];
    aiRoles: string[];
  };
  exchange: {
    pass: boolean;
    providerLabel: string;
    apiKeyConfigured: boolean;
    walletConfigured: boolean;
    walletProvider: string;
  };
  risk: {
    pass: boolean;
    killSwitchActive: boolean;
    paperRuntimeAlive: boolean;
    paperRuntimeFresh: boolean;
    openPositions: number;
    exposurePercent: number;
    exposureLimitPercent: number;
  };
  blockers: string[];
};

type GatePayload = {
  ok: boolean;
  eligibility?: Eligibility;
  error?: string;
  message?: string;
};

const confirmation = "ACTIVER LIVE LLM";

export function LiveTradingGatePanel() {
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Chargement gate live...");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/trading/live-gate", { cache: "no-store" });
      const payload = await response.json() as GatePayload;
      setEligibility(payload.eligibility ?? null);
      setMessage(payload.eligibility?.eligible ? "Conditions live remplies" : "Conditions live incomplètes");
    } catch {
      setMessage("Gate live indisponible");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    window.queueMicrotask(() => {
      if (mounted) void load();
    });
    return () => {
      mounted = false;
    };
  }, [load]);

  async function updateLive(enabled: boolean) {
    if (enabled && !window.confirm(`Activer le live trading LLM ? Confirmation envoyée: ${confirmation}`)) return;
    setBusy(true);
    setMessage(enabled ? "Activation live..." : "Désactivation live...");

    try {
      const response = await fetch("/api/trading/live-gate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled, confirmation: enabled ? confirmation : undefined }),
      });
      const payload = await response.json() as GatePayload;
      setEligibility(payload.eligibility ?? null);
      setMessage(payload.ok ? enabled ? "Live LLM armé" : "Live désactivé" : payload.message || payload.error || `Erreur ${response.status}`);
      window.dispatchEvent(new Event("system-integrity-refresh"));
    } catch {
      setMessage("Action live impossible");
    } finally {
      setBusy(false);
    }
  }

  const tone = eligibility?.liveEnabled ? "danger" : eligibility?.eligible ? "success" : "warning";
  const bestScore = eligibility?.performance.bestScore ?? 0;

  return (
    <GlassCard glow>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-bold text-white">
          <BrainCircuit className="size-5 text-violet-300" />
          Gate live LLM
        </div>
        <StatusBadge tone={tone}>{eligibility?.liveEnabled ? "live armé" : eligibility?.eligible ? "éligible" : "verrouillé"}</StatusBadge>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <ScoreBlock
          label="Meilleur score"
          value={`${bestScore}%`}
          detail={eligibility?.performance.source === "paper" ? "paper trading" : eligibility?.performance.source === "backtest" ? "backtest" : `seuil ${eligibility?.thresholdPercent ?? 80}%`}
          progress={bestScore}
          pass={Boolean(eligibility?.performance.pass)}
        />
        <ScoreBlock
          label="Paper"
          value={`${eligibility?.performance.paper.winRate ?? 0}%`}
          detail={`${eligibility?.performance.paper.closedTrades ?? 0}/${eligibility?.performance.paper.minimumTrades ?? 20} trades`}
          progress={eligibility?.performance.paper.winRate ?? 0}
          pass={Boolean(eligibility?.performance.paper.pass)}
        />
        <ScoreBlock
          label="Backtest"
          value={`${eligibility?.performance.backtest.score ?? 0}%`}
          detail={eligibility?.performance.backtest.strategyName ?? "aucun"}
          progress={eligibility?.performance.backtest.score ?? 0}
          pass={Boolean(eligibility?.performance.backtest.pass)}
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Checklist
          items={[
            { label: "Score >= seuil", status: eligibility?.performance.pass ? "ok" : "danger" },
            { label: "LLM dans la boucle", status: eligibility?.llm.pass ? "ok" : "danger" },
            { label: "Exchange prêt", status: eligibility?.exchange.pass ? "ok" : "warning" },
          ]}
        />
        <Checklist
          items={[
            { label: "Runtime paper frais", status: eligibility?.risk.paperRuntimeFresh ? "ok" : "warning" },
            { label: "Kill switch inactif", status: eligibility?.risk.killSwitchActive ? "danger" : "ok" },
            { label: "Aucune position paper", status: eligibility?.risk.openPositions ? "warning" : "ok" },
          ]}
        />
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400">Provider IA</span>
            <span className="font-mono text-violet-300">{eligibility?.llm.localProviderId || eligibility?.llm.connectedExternalProviders[0] || "pending"}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400">Rôles IA</span>
            <span className="font-mono text-slate-100">{eligibility?.llm.aiRoles.length ?? 0}/{eligibility?.llm.requiredRoles.length ?? 4}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400">Exposition</span>
            <span className="font-mono text-slate-100">{eligibility?.risk.exposurePercent ?? 0}%</span>
          </div>
        </div>
      </div>

      {eligibility?.blockers.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {eligibility.blockers.map((blocker) => (
            <StatusBadge key={blocker} tone="warning"><AlertTriangle className="size-3" /> {blocker}</StatusBadge>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2 max-sm:grid-cols-1">
        <Button disabled={busy || loading || !eligibility?.eligible || eligibility.liveEnabled} onClick={() => void updateLive(true)} variant="danger">
          <Power className="size-4" />
          Activer live LLM
        </Button>
        <Button disabled={busy || loading || !eligibility?.liveEnabled} onClick={() => void updateLive(false)} variant="ghost">
          <Lock className="size-4" />
          Revenir paper
        </Button>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
        {eligibility?.eligible ? <ShieldCheck className="size-4 text-emerald-300" /> : <AlertTriangle className="size-4 text-amber-300" />}
        {message}
      </div>
    </GlassCard>
  );
}

function ScoreBlock({ label, value, detail, progress, pass }: { label: string; value: string; detail: string; progress: number; pass: boolean }) {
  return (
    <div className="rounded-2xl border border-[#16314a] bg-slate-950/35 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
        {pass ? <CheckCircle2 className="size-4 text-emerald-300" /> : <Lock className="size-4 text-slate-500" />}
      </div>
      <div className={pass ? "mt-2 font-mono text-2xl font-bold text-emerald-300" : "mt-2 font-mono text-2xl font-bold text-amber-300"}>{value}</div>
      <div className="mt-1 truncate text-xs text-slate-500">{detail}</div>
      <div className="mt-3">
        <ProgressBar value={progress} tone={pass ? "success" : "warning"} />
      </div>
    </div>
  );
}
