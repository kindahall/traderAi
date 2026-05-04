"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, BookOpenCheck, Download, GitBranch, Lock, Shield } from "lucide-react";
import type { Alert, RiskLimit, RiskRule } from "@/types/risk";
import { Button } from "@/components/ui/button";
import { GlassCard, InfoHint, ProgressBar, StatusBadge, Timeline } from "@/components/ui/dashboard";
import { cn } from "@/lib/utils";

type RuleLibraryWorkspaceProps = {
  rules: RiskRule[];
  alerts: Alert[];
  riskLimits: RiskLimit[];
};

const filters = ["Toutes", "Risque", "Marché", "Comportement", "Validation", "Critiques"] as const;
type RuleFilter = (typeof filters)[number];

function severityTone(severity: RiskRule["severity"]) {
  if (severity === "critical") return "danger" as const;
  if (severity === "warning") return "warning" as const;
  return "info" as const;
}

function statusTone(status: RiskRule["status"]) {
  if (status === "active") return "success" as const;
  if (status === "draft") return "warning" as const;
  return "neutral" as const;
}

function FieldLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#16314a] py-2 text-sm last:border-b-0">
      <span className="text-slate-400">{label}</span>
      <span className="text-right font-medium text-slate-100">{value}</span>
    </div>
  );
}

function limitTone(limit: RiskLimit) {
  if (limit.current >= limit.limit) return "danger" as const;
  if (limit.current >= limit.limit * 0.8) return "warning" as const;
  return "success" as const;
}

export function RuleLibraryWorkspace({ rules, alerts, riskLimits }: RuleLibraryWorkspaceProps) {
  const [filter, setFilter] = useState<RuleFilter>("Toutes");
  const [selectedId, setSelectedId] = useState(rules[0]?.id ?? "");

  const visibleRules = useMemo(() => {
    if (filter === "Toutes") return rules;
    if (filter === "Critiques") return rules.filter((rule) => rule.severity === "critical");
    return rules.filter((rule) => rule.type === filter);
  }, [filter, rules]);

  const selected = useMemo(() => {
    return visibleRules.find((rule) => rule.id === selectedId) ?? visibleRules[0] ?? rules[0];
  }, [rules, selectedId, visibleRules]);

  const relatedAlerts = useMemo(() => {
    if (!selected) return [];
    return alerts
      .filter((alert) => alert.type === selected.type || (selected.type === "Risque" && alert.type === "Risque") || alert.severity === selected.severity)
      .slice(0, 4);
  }, [alerts, selected]);

  function exportVisibleRules() {
    downloadJson("regles-filtrees.json", {
      generatedAt: new Date().toISOString(),
      filter,
      count: visibleRules.length,
      rules: visibleRules,
    });
  }

  function exportSelectedRule() {
    if (!selected) return;
    downloadJson(`regle-${selected.id}.json`, {
      generatedAt: new Date().toISOString(),
      rule: selected,
      relatedAlerts,
      riskLimits,
    });
  }

  if (!selected) {
    return (
      <GlassCard className="mt-4">
        <StatusBadge tone="warning">Aucune règle chargée</StatusBadge>
      </GlassCard>
    );
  }

  return (
    <div className="mt-4 grid grid-cols-[1fr_420px_320px] gap-4">
      <GlassCard>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-bold text-white"><BookOpenCheck className="size-5 text-sky-300" /> Règles actives</div>
          <div className="flex items-center gap-2">
            <Button onClick={exportVisibleRules} size="sm" variant="ghost"><Download className="size-4" /> Exporter vue</Button>
            <StatusBadge tone="neutral"><Lock className="size-3" /> édition verrouillée</StatusBadge>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {filters.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={cn(
                "rounded-xl border px-3 py-2 text-xs font-semibold transition",
                filter === item ? "border-sky-400/70 bg-sky-500/20 text-sky-100" : "border-[#16314a] bg-white/[0.025] text-slate-300 hover:border-sky-400/40",
              )}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#16314a]">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Nom</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Sévérité</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Dernier déclenchement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#16314a] text-slate-300">
              {visibleRules.map((rule) => {
                const active = rule.id === selected.id;
                return (
                  <tr key={rule.id} className={cn("transition", active ? "bg-sky-500/12" : "hover:bg-sky-500/[0.04]")}>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => setSelectedId(rule.id)} aria-pressed={active} className="text-left font-semibold text-white transition hover:text-sky-200">
                        {rule.name}
                      </button>
                    </td>
                    <td className="px-4 py-3"><StatusBadge tone="info">{rule.type}</StatusBadge></td>
                    <td className="px-4 py-3"><StatusBadge tone={severityTone(rule.severity)}>{rule.severity}</StatusBadge></td>
                    <td className="px-4 py-3"><StatusBadge tone={statusTone(rule.status)}>{rule.status}</StatusBadge></td>
                    <td className="px-4 py-3 text-xs text-slate-400">{rule.lastTriggered}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-lg font-bold text-white">{selected.name}<InfoHint content={selected.description} /></div>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge tone="info">{selected.type}</StatusBadge>
              <StatusBadge tone={severityTone(selected.severity)}>{selected.severity}</StatusBadge>
              <StatusBadge tone={statusTone(selected.status)}>{selected.status}</StatusBadge>
            </div>
          </div>
          <Button onClick={exportSelectedRule} size="sm" variant="ghost"><GitBranch className="size-4" /> Exporter</Button>
        </div>

        <div className="rounded-2xl border border-[#16314a] bg-slate-950/35 p-3">
          <FieldLine label="Cibles agents" value={selected.targets.agents} />
          <FieldLine label="Cibles stratégies" value={selected.targets.strategies} />
          <FieldLine label="Marchés" value={selected.targets.markets?.join(", ") ?? "Runtime"} />
          <FieldLine label="Impact" value={selected.impact} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-3">
            <div className="mb-2 text-xs uppercase tracking-wide text-emerald-200">Conditions</div>
            <div className="space-y-2">
              {selected.conditions.map((condition) => <div key={condition} className="rounded-lg bg-slate-950/45 px-2 py-1 font-mono text-xs text-slate-200">{condition}</div>)}
            </div>
          </div>

          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/8 p-3">
            <div className="mb-2 text-xs uppercase tracking-wide text-sky-200">Actions</div>
            <div className="space-y-2">
              {selected.actions.map((action) => <div key={action} className="rounded-lg bg-slate-950/45 px-2 py-1 text-xs text-slate-200">{action}</div>)}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-[#16314a] bg-white/[0.025] p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-white"><AlertTriangle className="size-4 text-amber-300" /> Conflits</div>
          {selected.conflicts.length ? (
            <Timeline items={selected.conflicts.map((conflict) => ({ title: conflict, tone: "warning" }))} />
          ) : (
            <StatusBadge tone="success">Aucun conflit déclaré</StatusBadge>
          )}
        </div>
      </GlassCard>

      <div className="space-y-4">
        <GlassCard>
          <div className="mb-4 flex items-center gap-2 font-bold text-white"><Shield className="size-5 text-emerald-300" /> Limites runtime</div>
          <div className="space-y-4">
            {riskLimits.map((limit) => (
              <div key={limit.label}>
                <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-300">{limit.label}</span>
                  <span className="font-mono text-slate-100">{limit.current}/{limit.limit}{limit.unit}</span>
                </div>
                <ProgressBar value={(limit.current / Math.max(limit.limit, 1)) * 100} tone={limitTone(limit)} />
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="font-bold text-white">Alertes liées</div>
            <StatusBadge tone={relatedAlerts.length ? "warning" : "success"}>{relatedAlerts.length}</StatusBadge>
          </div>
          {relatedAlerts.length ? (
            <Timeline items={relatedAlerts.map((alert) => ({ time: alert.time, title: alert.title, detail: alert.recommendedAction, tone: alert.severity === "critical" ? "danger" : alert.severity === "warning" ? "warning" : "info" }))} />
          ) : (
            <StatusBadge tone="success">Aucune alerte liée</StatusBadge>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link href="/alerts"><Button className="w-full" variant="ghost" size="sm">Alertes</Button></Link>
            <Link href="/risk"><Button className="w-full" variant="ghost" size="sm">Risque</Button></Link>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="mb-3 flex items-center gap-2 font-bold text-white">Versioning</div>
          <StatusBadge tone="neutral"><Lock className="size-3" /> lecture seule</StatusBadge>
          <div className="mt-3 text-xs text-slate-400">Store versionné requis.</div>
        </GlassCard>
      </div>
    </div>
  );
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
