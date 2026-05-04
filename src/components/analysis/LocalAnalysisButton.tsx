"use client";

import { useState } from "react";
import { BrainCircuit, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/dashboard";

type AnalysisSurface =
  | "backtest"
  | "strategy-discovery"
  | "strategy-architect"
  | "decision-replay"
  | "weekly-postmortem"
  | "crisis-simulator"
  | "general";

type AnalysisResult = {
  ok: boolean;
  enabled: boolean;
  providerId?: string;
  latencyMs: number;
  text?: string;
  error?: string;
};

type LocalAnalysisButtonProps = {
  surface: AnalysisSurface;
  task: string;
  instruction?: string;
  context?: unknown;
  label?: string;
};

export function LocalAnalysisButton({ surface, task, instruction, context, label = "Analyser avec Codex" }: LocalAnalysisButtonProps) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  async function runAnalysis() {
    setBusy(true);
    setResult(null);

    try {
      const response = await fetch("/api/analysis/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ surface, task, instruction, context }),
      });
      const payload = (await response.json()) as AnalysisResult;
      setResult(payload);
    } catch {
      setResult({
        ok: false,
        enabled: true,
        latencyMs: 0,
        error: "Endpoint d'analyse local indisponible.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.06] p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <BrainCircuit className="size-4 text-violet-300" />
          Analyse locale
        </div>
        <Button size="sm" variant="ai" onClick={() => void runAnalysis()} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {busy ? "Analyse..." : label}
        </Button>
      </div>

      {result ? (
        <div className="mt-3 space-y-2">
          <StatusBadge tone={result.ok ? "success" : result.enabled ? "danger" : "warning"}>
            {result.ok ? `${result.providerId ?? "provider"} · ${result.latencyMs} ms` : result.enabled ? "erreur analyse" : "désactivé"}
          </StatusBadge>
          <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-[#16314a] bg-slate-950/65 p-3 text-xs leading-relaxed text-slate-200">
            {result.text || result.error || "Aucun résultat exploitable."}
          </div>
        </div>
      ) : null}
    </div>
  );
}
