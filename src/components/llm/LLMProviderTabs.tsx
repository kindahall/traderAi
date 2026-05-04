"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, GitCompareArrows, Globe2, Network, Search, Sparkles, UserCheck } from "lucide-react";
import type { LLMProvider } from "@/types/llm";
import { Button } from "@/components/ui/button";
import { GlassCard, InfoHint, ProgressBar, StatusBadge } from "@/components/ui/dashboard";
import { cn } from "@/lib/utils";

type ProviderTab = "recommended" | "western" | "asia" | "custom" | "connected";
type ProviderTestResult = {
  ok: boolean;
  status: "connected" | "pending" | "error";
  latencyMs: number;
  modelCount?: number;
  message: string;
};
type ProviderRole = "principal" | "rapide" | "auditeur" | "fallback";

const tabs: Array<{ id: ProviderTab; label: string; hint: string }> = [
  { id: "recommended", label: "Recommandés", hint: "Stack de départ" },
  { id: "western", label: "US & Europe", hint: "OpenAI, Claude, Gemini" },
  { id: "asia", label: "LLM asiatiques", hint: "DeepSeek, Qwen, Kimi" },
  { id: "custom", label: "Custom", hint: "Endpoints privés" },
  { id: "connected", label: "Connectés", hint: "Clés prêtes" },
];

function providerMatchesTab(provider: LLMProvider, activeTab: ProviderTab) {
  if (activeTab === "connected") {
    return provider.status === "connected";
  }

  if (activeTab === "custom") {
    return provider.id.includes("custom") || provider.region === "Custom";
  }

  if (activeTab === "asia") {
    return ["Chine", "Japon", "Corée"].includes(provider.region);
  }

  if (activeTab === "western") {
    return ["US", "EU", "Global"].includes(provider.region) && !provider.id.includes("custom");
  }

  return ["openai", "anthropic", "google", "mistral", "deepseek", "qwen"].includes(provider.id);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#16314a] py-2 text-sm last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className="max-w-[62%] truncate text-right font-mono text-xs font-semibold text-slate-200">{value}</span>
    </div>
  );
}

export function LLMProviderTabs({ providers }: { providers: LLMProvider[] }) {
  const [activeTab, setActiveTab] = useState<ProviderTab>("recommended");
  const [query, setQuery] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, ProviderTestResult>>({});
  const [comparisonId, setComparisonId] = useState<string | null>(null);
  const [roleAssignments, setRoleAssignments] = useState<Record<string, ProviderRole>>({});

  async function testProvider(providerId: string) {
    setTestingId(providerId);
    try {
      const response = await fetch("/api/llm/providers/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ providerId }),
      });
      const payload = (await response.json()) as ProviderTestResult;
      setTestResults((current) => ({ ...current, [providerId]: payload }));
    } catch {
      setTestResults((current) => ({
        ...current,
        [providerId]: { ok: false, status: "error", latencyMs: 0, message: "Erreur réseau pendant le test." },
      }));
    } finally {
      setTestingId(null);
    }
  }

  function compareProvider(providerId: string) {
    setComparisonId((current) => current === providerId ? null : providerId);
  }

  function assignNextRole(providerId: string) {
    const roles: ProviderRole[] = ["principal", "rapide", "auditeur", "fallback"];
    const current = roleAssignments[providerId];
    const nextRole = roles[((current ? roles.indexOf(current) : -1) + 1) % roles.length];
    setRoleAssignments((state) => ({ ...state, [providerId]: nextRole }));
  }

  const visibleProviders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return providers
      .filter((provider) => providerMatchesTab(provider, activeTab))
      .filter((provider) => {
        if (!normalizedQuery) return true;
        return [provider.name, provider.region, provider.envKey, ...provider.models.map((model) => model.name)]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      });
  }, [activeTab, providers, query]);

  return (
    <GlassCard>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-base font-bold text-white">
            <Network className="size-5 text-sky-300" /> Fournisseurs connectables
            <InfoHint content="Catalogue filtré par onglets pour garder la configuration lisible." />
          </div>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-2.5 size-4 text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher provider ou modèle..."
            className="h-10 w-full rounded-xl border border-[#1b3a55] bg-slate-950/70 pl-10 pr-3 text-sm text-slate-100 outline-none focus:border-sky-400/70"
          />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-5 gap-2 rounded-2xl border border-[#16314a] bg-slate-950/40 p-2">
        {tabs.map((tab) => {
          const count = providers.filter((provider) => providerMatchesTab(provider, tab.id)).length;
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "rounded-xl border px-3 py-3 text-left transition-all",
                active
                  ? "border-sky-400/70 bg-sky-500/18 text-white shadow-[0_0_28px_rgba(14,165,233,0.16)]"
                  : "border-transparent bg-white/[0.03] text-slate-400 hover:border-sky-400/30 hover:text-sky-100",
              )}
            >
              <span className="flex items-center justify-between gap-2 text-sm font-bold">
                <span className="flex items-center gap-2">{tab.label}<InfoHint content={tab.hint} /></span>
                <span className="rounded-lg border border-white/10 bg-slate-950/60 px-2 py-0.5 font-mono text-[11px]">{count}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-4 grid grid-cols-4 gap-3">
        <div className="rounded-2xl border border-[#16314a] bg-white/[0.03] p-3">
          <div className="text-xs text-slate-500">Catégorie active</div>
          <div className="mt-1 font-bold text-sky-200">{tabs.find((tab) => tab.id === activeTab)?.label}</div>
        </div>
        <div className="rounded-2xl border border-[#16314a] bg-white/[0.03] p-3">
          <div className="text-xs text-slate-500">Providers visibles</div>
          <div className="mt-1 font-mono text-xl font-bold text-white">{visibleProviders.length}</div>
        </div>
        <div className="rounded-2xl border border-[#16314a] bg-white/[0.03] p-3">
          <div className="text-xs text-slate-500">Connectés</div>
          <div className="mt-1 font-mono text-xl font-bold text-emerald-300">
            {visibleProviders.filter((provider) => provider.status === "connected").length}
          </div>
        </div>
        <div className="rounded-2xl border border-[#16314a] bg-white/[0.03] p-3">
          <div className="text-xs text-slate-500">Modèles listés</div>
          <div className="mt-1 font-mono text-xl font-bold text-violet-300">
            {visibleProviders.reduce((total, provider) => total + provider.models.length, 0)}
          </div>
        </div>
      </div>

      <div className="grid max-h-[610px] grid-cols-2 gap-4 overflow-y-auto pr-2">
        {visibleProviders.map((provider) => {
          const connected = provider.status === "connected";
          const testResult = testResults[provider.id];
          const comparisonOpen = comparisonId === provider.id;
          const role = roleAssignments[provider.id];
          const baseline = providers.find((candidate) => candidate.status === "connected") ?? providers[0];
          const providerScore = Math.max(0, 100 - provider.errorRate * 12 - provider.latencyMs / 120);
          const baselineScore = baseline ? Math.max(0, 100 - baseline.errorRate * 12 - baseline.latencyMs / 120) : 0;
          return (
            <section key={provider.id} className="rounded-2xl border border-[#1b3a55] bg-[linear-gradient(145deg,rgba(8,31,56,0.82),rgba(5,15,29,0.86))] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-bold text-white">
                    {provider.region === "Custom" ? <Sparkles className="size-4 text-violet-300" /> : <Globe2 className="size-4 text-sky-300" />}
                    {provider.name}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{provider.region} · {provider.apiFormat}</div>
                </div>
                <StatusBadge tone={connected ? "success" : "neutral"}>{provider.status}</StatusBadge>
              </div>

              <div className="mt-4">
                <Row label="Env" value={provider.envKey} />
                <Row label="Endpoint" value={provider.endpoint || "custom endpoint"} />
                <Row label="Clé" value={provider.maskedKey} />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-xs text-slate-500">Latence</div>
                  <div className="font-mono font-bold text-slate-100">{provider.latencyMs} ms</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Coût/jour</div>
                  <div className="font-mono font-bold text-slate-100">{provider.estimatedDailyCost} $</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Erreur</div>
                  <div className="font-mono font-bold text-slate-100">{provider.errorRate}%</div>
                </div>
              </div>
              <div className="mt-3"><ProgressBar value={Math.max(8, Math.min(100, 100 - provider.errorRate * 10))} tone={connected ? "success" : "info"} /></div>
              {testResult ? (
                <div className={cn(
                  "mt-3 rounded-xl border px-3 py-2 text-xs",
                  testResult.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-red-500/30 bg-red-500/10 text-red-200",
                )}>
                  {testResult.message} {testResult.latencyMs ? `· ${testResult.latencyMs} ms` : ""}
                </div>
              ) : null}
              {comparisonOpen ? (
                <div className="mt-3 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
                  Comparé à {baseline?.name ?? "baseline"} · score local {Math.round(providerScore)} vs {Math.round(baselineScore)} · {providerScore >= baselineScore ? "candidat prioritaire" : "candidat secondaire"}.
                </div>
              ) : null}
              {role ? (
                <div className="mt-3 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-100">
                  Rôle local attribué : {role}. À persister côté serveur avant usage production.
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {provider.models.slice(0, 6).map((model) => (
                  <StatusBadge key={model.modelId} tone={model.custom ? "ai" : model.reasoning ? "info" : "neutral"}>
                    {model.name}
                  </StatusBadge>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" onClick={() => testProvider(provider.id)} disabled={testingId === provider.id}>
                  <CheckCircle2 className="size-4" /> {testingId === provider.id ? "Test..." : "Tester réel"}
                </Button>
                <Button title="Comparer localement avec le provider connecté de référence" variant="ghost" size="sm" onClick={() => compareProvider(provider.id)}>
                  <GitCompareArrows className="size-4" /> {comparisonOpen ? "Masquer" : "Comparer"}
                </Button>
                <Button title="Attribuer un rôle local de configuration" variant="ghost" size="sm" onClick={() => assignNextRole(provider.id)}>
                  <UserCheck className="size-4" /> {role ? `Rôle ${role}` : "Définir rôle"}
                </Button>
              </div>
            </section>
          );
        })}
      </div>
    </GlassCard>
  );
}
