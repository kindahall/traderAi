"use client";

import { useState } from "react";
import { BrainCircuit, ShieldCheck } from "lucide-react";
import type { LLMRole } from "@/types/llm";
import { Button } from "@/components/ui/button";
import { GlassCard, InfoHint, StatusBadge } from "@/components/ui/dashboard";

export function LLMLiveInsight({ page = "llm-providers", role = "auditeur" }: { page?: string; role?: LLMRole }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | {
    ok: boolean;
    status: "connected" | "pending" | "error";
    providerId?: string;
    modelId?: string;
    latencyMs: number;
    message: string;
    text?: string;
    fallbackUsed?: boolean;
  }>(null);

  async function generateInsight() {
    setLoading(true);
    try {
      const response = await fetch("/api/llm/insight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ page, role }),
      });
      setResult(await response.json());
    } catch {
      setResult({ ok: false, status: "error", latencyMs: 0, message: "Impossible de joindre l'endpoint LLM local." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <GlassCard>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-bold text-white"><ShieldCheck className="size-5 text-violet-300" /> Audit LLM live<InfoHint content={`Déclenche un appel réel au rôle ${role}; aucune génération automatique au chargement.`} /></div>
        </div>
        <StatusBadge tone={result?.ok ? "success" : result ? "warning" : "neutral"}>{result?.status || "manuel"}</StatusBadge>
      </div>
      <Button className="w-full" variant="ai" onClick={generateInsight} disabled={loading}>
        <BrainCircuit className="size-4" /> {loading ? "Génération..." : "Générer audit live"}
      </Button>
      {result ? (
        <div className="mt-4 rounded-2xl border border-[#16314a] bg-slate-950/50 p-3 text-sm text-slate-300">
          <div className="mb-2 font-mono text-xs text-slate-500">
            {result.providerId || "provider"} · {result.modelId || "modèle"} · {result.latencyMs} ms {result.fallbackUsed ? "· fallback" : ""}
          </div>
          <p className={result.ok ? "text-emerald-200" : "text-amber-200"}>{result.message}</p>
          {result.text ? <p className="mt-3 whitespace-pre-wrap leading-relaxed">{result.text}</p> : null}
        </div>
      ) : null}
    </GlassCard>
  );
}
