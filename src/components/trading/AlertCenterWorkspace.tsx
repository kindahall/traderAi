"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Bell, Download, Search, Shield, UserCheck } from "lucide-react";
import type { Alert } from "@/types/risk";
import { Button } from "@/components/ui/button";
import { GlassCard, InfoHint, StatusBadge, Timeline } from "@/components/ui/dashboard";
import { cn } from "@/lib/utils";

type AlertCenterWorkspaceProps = {
  alerts: Alert[];
  dailyRiskPercent: number;
};

type AlertSeverityFilter = "all" | Alert["severity"];
type AlertTypeFilter = "all" | Alert["type"];
type AlertStatusFilter = "all" | Alert["status"];

function severityTone(severity: Alert["severity"]) {
  if (severity === "critical") return "danger" as const;
  if (severity === "warning") return "warning" as const;
  return "info" as const;
}

function statusTone(status: Alert["status"]) {
  if (status === "resolved") return "success" as const;
  if (status === "pending") return "info" as const;
  return "danger" as const;
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#16314a] py-2 text-sm last:border-b-0">
      <span className="text-slate-400">{label}</span>
      <span className="text-right font-medium text-slate-100">{value}</span>
    </div>
  );
}

export function AlertCenterWorkspace({ alerts, dailyRiskPercent }: AlertCenterWorkspaceProps) {
  const [query, setQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<AlertSeverityFilter>("all");
  const [typeFilter, setTypeFilter] = useState<AlertTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<AlertStatusFilter>("all");
  const [statusOverrides, setStatusOverrides] = useState<Record<string, Alert["status"]>>({});
  const [selectedId, setSelectedId] = useState(alerts[0]?.id ?? "");
  const effectiveAlerts = useMemo(() => alerts.map((alert) => ({ ...alert, status: statusOverrides[alert.id] ?? alert.status })), [alerts, statusOverrides]);
  const visibleAlerts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return effectiveAlerts
      .filter((alert) => severityFilter === "all" || alert.severity === severityFilter)
      .filter((alert) => typeFilter === "all" || alert.type === typeFilter)
      .filter((alert) => statusFilter === "all" || alert.status === statusFilter)
      .filter((alert) => {
        if (!normalizedQuery) return true;
        return [alert.id, alert.title, alert.detail, alert.agent, alert.market, alert.rootCause, alert.recommendedAction, alert.type, alert.status, alert.severity]
          .some((value) => value.toLowerCase().includes(normalizedQuery));
      });
  }, [effectiveAlerts, query, severityFilter, statusFilter, typeFilter]);
  const selected = useMemo(() => visibleAlerts.find((alert) => alert.id === selectedId) ?? visibleAlerts[0], [selectedId, visibleAlerts]);
  const typeOptions = useMemo(() => [...new Set(effectiveAlerts.map((alert) => alert.type))].sort(), [effectiveAlerts]);

  function updateSelectedStatus(status: Alert["status"]) {
    if (!selected) return;
    setStatusOverrides((current) => ({ ...current, [selected.id]: status }));
  }

  function exportVisibleAlerts() {
    downloadJson("alertes-vue.json", {
      generatedAt: new Date().toISOString(),
      filters: { query, severityFilter, typeFilter, statusFilter },
      count: visibleAlerts.length,
      alerts: visibleAlerts,
    });
  }

  if (!selected) {
    return (
      <>
        <AlertFilters
          onQueryChange={setQuery}
          onSeverityChange={setSeverityFilter}
          onStatusChange={setStatusFilter}
          onTypeChange={setTypeFilter}
          query={query}
          severityFilter={severityFilter}
          statusFilter={statusFilter}
          totalCount={effectiveAlerts.length}
          typeFilter={typeFilter}
          typeOptions={typeOptions}
          visibleCount={visibleAlerts.length}
        />
        <GlassCard className="mt-4">
          <div className="flex items-center gap-2 font-bold text-white"><Bell className="size-5 text-emerald-300" /> Flux d'alertes</div>
          <StatusBadge className="mt-4" tone="success">Aucune alerte pour ces filtres</StatusBadge>
        </GlassCard>
      </>
    );
  }

  return (
    <>
      <AlertFilters
        onQueryChange={setQuery}
        onSeverityChange={setSeverityFilter}
        onStatusChange={setStatusFilter}
        onTypeChange={setTypeFilter}
        query={query}
        severityFilter={severityFilter}
        statusFilter={statusFilter}
        totalCount={effectiveAlerts.length}
        typeFilter={typeFilter}
        typeOptions={typeOptions}
        visibleCount={visibleAlerts.length}
      />
      <div className="mt-4 grid grid-cols-[1.05fr_0.55fr_0.75fr] gap-4">
      <GlassCard>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-bold text-white"><Bell className="size-5 text-sky-300" /> Flux d'alertes</div>
          <div className="flex items-center gap-2">
            <Button disabled={!visibleAlerts.length} onClick={exportVisibleAlerts} size="sm" variant="ghost"><Download className="size-4" /> Exporter vue</Button>
            <StatusBadge tone={visibleAlerts.length ? "warning" : "success"}>{visibleAlerts.length} / {effectiveAlerts.length}</StatusBadge>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#16314a]">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Heure</th>
                <th className="px-4 py-3 font-medium">Gravité</th>
                <th className="px-4 py-3 font-medium">Titre</th>
                <th className="px-4 py-3 font-medium">Marché</th>
                <th className="px-4 py-3 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#16314a] text-slate-300">
              {visibleAlerts.map((alert) => {
                const active = alert.id === selected.id;
                return (
                  <tr key={alert.id} className={cn("transition", active ? "bg-sky-500/12" : "hover:bg-sky-500/[0.04]")}>
                    <td className="px-4 py-3 font-mono text-xs">{alert.time}</td>
                    <td className="px-4 py-3"><StatusBadge tone={severityTone(alert.severity)}>{alert.severity}</StatusBadge></td>
                    <td className="px-4 py-3">
                      <button type="button" aria-pressed={active} onClick={() => setSelectedId(alert.id)} className="text-left font-semibold text-white transition hover:text-sky-200">
                        {alert.title}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{alert.market}</td>
                    <td className="px-4 py-3"><StatusBadge tone={statusTone(alert.status)}>{alert.status}</StatusBadge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <div className="space-y-4">
        <GlassCard>
          <div className="mb-4 flex items-center gap-2 font-bold text-white"><AlertTriangle className="size-5 text-amber-300" /> Timeline</div>
          <Timeline items={visibleAlerts.slice(0, 5).map((alert) => ({ time: alert.time, title: alert.title, detail: alert.detail, tone: severityTone(alert.severity) }))} />
        </GlassCard>

        <GlassCard>
          <div className="mb-4 flex items-center gap-2 font-bold text-white">Répartition</div>
          <DetailRow label="Critiques" value={visibleAlerts.filter((alert) => alert.severity === "critical").length} />
          <DetailRow label="Avertissements" value={visibleAlerts.filter((alert) => alert.severity === "warning").length} />
          <DetailRow label="Information" value={visibleAlerts.filter((alert) => alert.severity === "info").length} />
        </GlassCard>
      </div>

      <GlassCard>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-bold text-white">Détail de l'alerte<InfoHint content={selected.detail} /></div>
          <StatusBadge tone={severityTone(selected.severity)}>{selected.severity}</StatusBadge>
        </div>

        <h2 className="text-xl font-bold text-white">{selected.title}</h2>
        <div className="mt-4 rounded-2xl border border-[#16314a] bg-slate-950/35 p-3">
          <DetailRow label="Agent" value={selected.agent} />
          <DetailRow label="Marché" value={selected.market} />
          <DetailRow label="Risque journalier" value={`${dailyRiskPercent}%`} />
          <DetailRow label="Statut" value={<span className={selected.status === "active" ? "text-red-300" : "text-sky-300"}>{selected.status}</span>} />
          <DetailRow label="ID" value={<span className="font-mono text-xs">{selected.id}</span>} />
        </div>

        <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/8 p-3">
          <div className="text-xs uppercase tracking-wide text-red-200">Cause racine</div>
          <div className="mt-1 text-sm text-slate-200">{selected.rootCause}</div>
        </div>

        <div className="mt-3 rounded-2xl border border-sky-500/20 bg-sky-500/8 p-3">
          <div className="text-xs uppercase tracking-wide text-sky-200">Action recommandée</div>
          <div className="mt-1 text-sm text-slate-200">{selected.recommendedAction}</div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link href="/risk"><Button className="w-full" variant="danger" size="sm"><Shield className="size-4" /> Voir risque</Button></Link>
          <Link href="/rules"><Button className="w-full" variant="ghost" size="sm">Voir règles</Button></Link>
          <Button onClick={() => updateSelectedStatus("resolved")} className="w-full" variant="success" size="sm">Acquitter</Button>
          <Button onClick={() => updateSelectedStatus("pending")} className="w-full" variant="warning" size="sm"><UserCheck className="size-4" /> Escalader</Button>
        </div>
      </GlassCard>
      </div>
    </>
  );
}

function AlertFilters({
  onQueryChange,
  onSeverityChange,
  onStatusChange,
  onTypeChange,
  query,
  severityFilter,
  statusFilter,
  totalCount,
  typeFilter,
  typeOptions,
  visibleCount,
}: {
  onQueryChange: (value: string) => void;
  onSeverityChange: (value: AlertSeverityFilter) => void;
  onStatusChange: (value: AlertStatusFilter) => void;
  onTypeChange: (value: AlertTypeFilter) => void;
  query: string;
  severityFilter: AlertSeverityFilter;
  statusFilter: AlertStatusFilter;
  totalCount: number;
  typeFilter: AlertTypeFilter;
  typeOptions: Alert["type"][];
  visibleCount: number;
}) {
  return (
    <GlassCard className="mt-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-bold text-white"><Search className="size-5 text-sky-300" /> Filtres connectés</div>
        <StatusBadge tone="info">{visibleCount}/{totalCount}</StatusBadge>
      </div>
      <div className="grid gap-3 md:grid-cols-[1.2fr_0.7fr_0.8fr_0.7fr]">
        <label className="block text-xs text-slate-400">
          Recherche
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Titre, cause, agent, marché..."
            className="mt-1 h-10 w-full rounded-xl border border-[#1b3a55] bg-slate-950/60 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
          />
        </label>
        <label className="block text-xs text-slate-400">
          Gravité
          <select value={severityFilter} onChange={(event) => onSeverityChange(event.target.value as AlertSeverityFilter)} className="mt-1 h-10 w-full rounded-xl border border-[#1b3a55] bg-slate-950/60 px-3 text-sm text-slate-100 outline-none">
            <option value="all">Toutes</option>
            <option value="critical">Critiques</option>
            <option value="warning">Warnings</option>
            <option value="info">Infos</option>
          </select>
        </label>
        <label className="block text-xs text-slate-400">
          Type
          <select value={typeFilter} onChange={(event) => onTypeChange(event.target.value as AlertTypeFilter)} className="mt-1 h-10 w-full rounded-xl border border-[#1b3a55] bg-slate-950/60 px-3 text-sm text-slate-100 outline-none">
            <option value="all">Tous</option>
            {typeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label className="block text-xs text-slate-400">
          Statut
          <select value={statusFilter} onChange={(event) => onStatusChange(event.target.value as AlertStatusFilter)} className="mt-1 h-10 w-full rounded-xl border border-[#1b3a55] bg-slate-950/60 px-3 text-sm text-slate-100 outline-none">
            <option value="all">Tous</option>
            <option value="active">Actives</option>
            <option value="pending">En attente</option>
            <option value="resolved">Résolues</option>
          </select>
        </label>
      </div>
    </GlassCard>
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
