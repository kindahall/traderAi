"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Download, Play, Search } from "lucide-react";
import type { AppDataSnapshot, DataSourceStatus } from "@/server/app-data";
import { formatPercent, signed } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checklist, DataTable, GlassCard, InfoHint, KpiCard, ProgressBar, StatusBadge, Timeline } from "@/components/ui/dashboard";
import { Donut } from "@/components/charts/charts";

type Scenario = AppDataSnapshot["crisisScenarios"][number];
type TimelineStep = AppDataSnapshot["crisisTimeline"][number];
type CrisisMetrics = AppDataSnapshot["metrics"]["crisis"];

type Props = {
  scenarios: Scenario[];
  timeline: TimelineStep[];
  metrics: CrisisMetrics;
  killSwitchStatus: DataSourceStatus["killSwitch"];
};

export function CrisisSimulatorWorkspace({ scenarios, timeline, metrics, killSwitchStatus }: Props) {
  const [selectedName, setSelectedName] = useState(metrics.selected.name);
  const [query, setQuery] = useState("");
  const [runCount, setRunCount] = useState(0);
  const selected = scenarios.find((scenario) => scenario.name === selectedName) ?? scenarios[0];
  const visibleScenarios = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return scenarios;
    return scenarios.filter((scenario) => [scenario.name, scenario.detail, scenario.severity]
      .some((value) => value.toLowerCase().includes(normalizedQuery)));
  }, [query, scenarios]);

  if (!selected) {
    return <GlassCard><StatusBadge tone="warning">Aucun scénario de crise disponible</StatusBadge></GlassCard>;
  }

  const result = buildScenarioResult(selected);
  const severityTone = selected.severity === "CRITIQUE" || selected.severity === "ÉLEVÉE" ? "danger" : "warning";

  function runSimulation() {
    setRunCount((count) => count + 1);
  }

  function exportScenario() {
    const payload = {
      exportedAt: new Date().toISOString(),
      runCount,
      selected,
      result,
      timeline,
      killSwitchStatus,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `crisis-scenario-${selected.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="grid grid-cols-6 gap-4">
        <KpiCard label="Scénario sélectionné" value={selected.name} delta={selected.detail} tone="warning" />
        <KpiCard label="Impact estimé" value={signed(selected.impact, "%")} delta={metrics.worstImpact.name} tone="danger" />
        <KpiCard label="Réaction agent" value={selected.robustness >= 85 ? "Conforme" : "À renforcer"} delta={`${timeline.length}/${timeline.length} étapes`} tone={selected.robustness >= 85 ? "success" : "warning"} />
        <KpiCard label="Risque résiduel" value={signed(100 - selected.survival, "%")} delta="calculé scénario" tone="info"><Donut value={100 - selected.survival} /></KpiCard>
        <KpiCard label="Robustesse" value={`${selected.robustness}/100`} delta={`moyenne ${metrics.averageRobustness}/100`} tone="ai"><Donut value={selected.robustness} colors={["#8b5cf6"]} /></KpiCard>
        <KpiCard label="Taux de survie" value={`${selected.survival}%`} delta={`moyenne ${metrics.averageSurvival}%`} tone="success" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[300px_1fr_320px]">
        <GlassCard>
          <CardTitle title="Sélection du scénario" action={<StatusBadge tone="info">{visibleScenarios.length}/{scenarios.length}</StatusBadge>} />
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-[#1b3a55] bg-slate-950/60 px-3">
            <Search className="size-4 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Chercher scénario..."
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
            />
          </div>
          <div className="space-y-3">
            {visibleScenarios.map((scenario) => (
              <button
                key={scenario.name}
                type="button"
                onClick={() => setSelectedName(scenario.name)}
                className={cn(
                  "w-full rounded-2xl border p-3 text-left transition",
                  scenario.name === selected.name ? "border-sky-400/70 bg-sky-500/10" : "border-[#16314a] bg-white/[0.025] hover:border-sky-400/45",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-white">{scenario.name}</div>
                    <div className="mt-1 text-sm text-slate-400">{scenario.detail}</div>
                  </div>
                  <StatusBadge tone={scenario.severity === "CRITIQUE" ? "danger" : scenario.severity === "ÉLEVÉE" ? "warning" : "info"}>{scenario.severity}</StatusBadge>
                </div>
                <div className="mt-3"><ProgressBar value={scenario.robustness} tone={scenario.robustness >= 85 ? "success" : "warning"} /></div>
              </button>
            ))}
          </div>
        </GlassCard>

        <div className="space-y-4">
          <GlassCard>
            <CardTitle title="Déroulé de la simulation" action={<StatusBadge tone={runCount ? "success" : "neutral"}>{runCount ? `Run ${runCount}` : "Prêt"}</StatusBadge>} />
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              {timeline.map((step) => (
                <div key={step.title} className="text-center">
                  <div className="mx-auto grid size-14 place-items-center rounded-full border border-emerald-400/40 bg-emerald-500/10 text-emerald-300"><CheckCircle2 /></div>
                  <div className="mt-2 font-bold text-white">{step.title}</div>
                  <div className="font-mono text-xs text-slate-500">{step.time}</div>
                  <div className="mt-1 flex justify-center"><InfoHint content={step.detail} /></div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button onClick={runSimulation} variant="ai"><Play className="size-4" /> Lancer ce scénario</Button>
              <Button onClick={exportScenario} variant="ghost"><Download className="size-4" /> Export JSON</Button>
            </div>
          </GlassCard>

          <div className="grid gap-4 lg:grid-cols-4">
            <GlassCard><CardTitle title="Résultats" /><FieldRows rows={[["PnL simulé", <span key="p" className={selected.impact >= 0 ? "text-emerald-300" : "text-red-300"}>{signed(selected.impact, "%")}</span>], ["Drawdown", formatPercent(Math.abs(selected.impact))], ["Ordres bloqués", `${result.blockedOrders}`], ["Slippage évité", formatPercent(result.slippageAvoided)], ["Taux survie", <span key="s" className="text-emerald-300">{selected.survival}%</span>]]} /></GlassCard>
            <GlassCard><CardTitle title="Attendu vs agent" /><Checklist items={[{ label: "Détection < 5s", status: selected.robustness >= 80 ? "ok" : "warning" }, { label: "Freeze < 10s", status: "ok" }, { label: "Réduction exposition", status: selected.survival >= 90 ? "ok" : "warning" }, { label: "Kill switch < 60s", status: selected.severity === "CRITIQUE" ? "warning" : "ok" }]} /></GlassCard>
            <GlassCard><CardTitle title="Points de défaillance" /><Timeline items={result.failures.map((title) => ({ title, tone: title.includes("Kill") ? "danger" : "warning" }))} /></GlassCard>
            <GlassCard><CardTitle title="Mesures correctives" /><Timeline items={result.actions.map((title) => ({ title, tone: "success" }))} /></GlassCard>
          </div>
        </div>

        <GlassCard>
          <CardTitle title="Détails & recommandation" />
          <FieldRows rows={[["Sévérité", <StatusBadge key="sev" tone={severityTone}>{selected.severity}</StatusBadge>], ["Probabilité", formatPercent(100 - selected.survival, 0)], ["Type", result.type], ["Actifs", result.assets], ["Compatibilité", <StatusBadge key="comp" tone={selected.robustness >= 85 ? "success" : "warning"}>Compatible {selected.robustness}/100</StatusBadge>]]} />
          <div className={cn("mt-4 rounded-2xl border p-4", result.ready ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10")}>
            <div className={cn("flex items-center gap-2 font-bold", result.ready ? "text-emerald-300" : "text-amber-300")}>{result.ready ? "PRÊT SOUS SURVEILLANCE" : "RENFORCEMENT REQUIS"}<InfoHint content={result.recommendation} /></div>
          </div>
          <GlassCard className="mt-4 bg-slate-950/40">
            <CardTitle title="Comparatif scénarios" />
            <DataTable
              headers={["Scénario", "Impact", "Robustesse"]}
              rows={scenarios.slice(0, 5).map((scenario) => [
                scenario.name,
                <span key={`${scenario.name}-impact`} className="text-red-300">{signed(scenario.impact, "%")}</span>,
                `${scenario.robustness}/100`,
              ])}
            />
          </GlassCard>
        </GlassCard>
      </div>
    </>
  );
}

function buildScenarioResult(scenario: Scenario) {
  const critical = scenario.severity === "CRITIQUE";
  const high = scenario.severity === "ÉLEVÉE";
  return {
    blockedOrders: critical ? 5 : high ? 3 : 1,
    slippageAvoided: Math.max(0.05, Math.abs(scenario.impact) * 0.08),
    ready: scenario.robustness >= 85 && scenario.survival >= 90,
    type: scenario.name.includes("API") ? "Infrastructure" : scenario.name.includes("Ordre") ? "Exécution" : "Marché",
    assets: scenario.name.includes("BTC") ? "BTC, ETH, SOL" : "Portefeuille surveillé",
    recommendation: scenario.robustness >= 85 ? "Déploiement possible avec surveillance renforcée et limite journalière active." : "Abaisser l'exposition et ajouter une règle de blocage avant promotion.",
    failures: critical ? ["Gap sous stop-loss", "Kill switch trop proche", "Liquidité dégradée"] : high ? ["Latence détection élevée", "Exposition corrélée", "Seuil kill switch proche"] : ["Dépendance API unique", "Spread à surveiller", "Routage secours à confirmer"],
    actions: critical ? ["Réduire levier autorisé", "Ajouter circuit breaker volatilité", "Forcer validation humaine"] : ["Optimiser source données", "Ajouter circuit breaker API", "Abaisser seuil kill switch"],
  };
}

function CardTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return <div className="mb-4 flex items-center justify-between gap-3"><div className="font-bold text-white">{title}</div>{action}</div>;
}

function FieldRows({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <div className="divide-y divide-[#16314a] text-sm">
      {rows.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 py-2"><span className="text-slate-400">{label}</span><span className="text-right font-medium text-slate-100">{value}</span></div>)}
    </div>
  );
}
