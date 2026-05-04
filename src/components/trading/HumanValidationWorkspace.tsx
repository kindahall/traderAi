"use client";

import { useMemo, useState } from "react";
import { Eye, Search } from "lucide-react";
import type { AppDataSnapshot } from "@/server/app-data";
import type { Trade } from "@/types/trading";
import { Button } from "@/components/ui/button";
import { Checklist, DataTable, GlassCard, InfoHint, ProgressBar, StatusBadge, Timeline } from "@/components/ui/dashboard";
import { Donut } from "@/components/charts/charts";
import { LocalActionButton } from "@/components/system/LocalActionButton";
import { TradingDeskChart } from "@/components/trading/TradingDeskChart";

type ValidationRequest = AppDataSnapshot["validationRequests"][number];

type Props = {
  requests: ValidationRequest[];
  trades: Trade[];
  riskPercent: number;
};

export function HumanValidationWorkspace({ requests, trades, riskPercent }: Props) {
  const [selectedKey, setSelectedKey] = useState(requests[0]?.time ?? "");
  const [query, setQuery] = useState("");
  const [reasonFilter, setReasonFilter] = useState("all");
  const reasons = useMemo(() => [...new Set(requests.map((request) => request.reason))].sort(), [requests]);
  const visibleRequests = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return requests
      .filter((request) => reasonFilter === "all" || request.reason === reasonFilter)
      .filter((request) => {
        if (!normalizedQuery) return true;
        return [request.agent, request.asset, request.side, request.reason, request.amount, request.risk]
          .some((value) => value.toLowerCase().includes(normalizedQuery));
      });
  }, [query, reasonFilter, requests]);
  const selected = visibleRequests.find((request) => request.time === selectedKey) ?? visibleRequests[0] ?? requests[0];

  if (!selected) {
    return <GlassCard className="mt-4"><StatusBadge tone="success">Aucune validation humaine en attente</StatusBadge></GlassCard>;
  }

  return (
    <>
      <GlassCard className="mt-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-bold text-white"><Search className="size-5 text-sky-300" /> Filtres connectés</div>
          <StatusBadge tone="info">{visibleRequests.length}/{requests.length}</StatusBadge>
        </div>
        <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Agent, actif, motif..." className="h-10 rounded-xl border border-[#1b3a55] bg-slate-950/60 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600" />
          <select value={reasonFilter} onChange={(event) => setReasonFilter(event.target.value)} className="h-10 rounded-xl border border-[#1b3a55] bg-slate-950/60 px-3 text-sm text-slate-100 outline-none">
            <option value="all">Tous motifs</option>
            {reasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
          </select>
        </div>
      </GlassCard>

      <div className="mt-4 grid grid-cols-[1fr_300px] gap-4">
        <div className="space-y-4">
          <GlassCard>
            <DataTable
              headers={["Heure", "Agent", "Actif", "Type", "Confiance", "Risque", "Motif", "Deadline", "Montant", "Actions"]}
              rows={visibleRequests.map((request) => [
                request.time,
                request.agent,
                request.asset,
                <StatusBadge key={`${request.time}-side`} tone={request.side === "LONG" ? "success" : "danger"}>{request.side}</StatusBadge>,
                `${request.confidence}%`,
                <span key={`${request.time}-risk`} className={request.risk.includes("2,") ? "text-red-300" : "text-amber-300"}>{request.risk}</span>,
                request.reason,
                <span key={`${request.time}-dead`} className="text-amber-300">{request.deadline}</span>,
                request.amount,
                <Button key={`${request.time}-view`} onClick={() => setSelectedKey(request.time)} size="sm" variant={request.time === selected.time ? "ai" : "ghost"}><Eye className="size-4" /> Voir</Button>,
              ])}
            />
          </GlassCard>
          <GlassCard>
            <CardTitle title="Détails du trade sélectionné" />
            <div className="grid grid-cols-[320px_1fr_360px] gap-4">
              <div><div className="text-xl font-bold text-white">{selected.asset}</div><StatusBadge tone={selected.side === "LONG" ? "success" : "danger"}>{selected.side}</StatusBadge><TradingDeskChart compact symbol={selected.asset} trades={trades} riskPercent={riskPercent} title={`${selected.asset} · validation paper`} /><FieldRows rows={[["Entrée", "niveau calculé par le chart"], ["Stop Loss", "niveau rouge agent"], ["Take Profit", "niveau vert agent"], ["R/R attendu", "calculé sur niveaux affichés"]]} /></div>
              <div><CardTitle title="Raisonnement de l'agent" hint={`${selected.reason} · confiance ${selected.confidence}%`} /><ProgressBar value={selected.confidence} tone={selected.confidence >= 70 ? "success" : "warning"} /><CardTitle title="Checklist de validation" /><Checklist items={[{ label: "Risque conforme", status: selected.risk.includes("2,") ? "warning" : "ok" }, { label: "Corrélation portefeuille", status: "ok" }, { label: "Drawdown agent", status: "ok" }, { label: "Règles stratégie", status: "ok" }, { label: "Liquidité suffisante", status: "ok" }]} /></div>
              <div><CardTitle title="Évaluation du risque" /><FieldRows rows={[["Risque par trade", selected.risk], ["Risque capital", "dérivé runtime"], ["Risque portefeuille", "surveillance"], ["Impact drawdown", "à confirmer"], ["Sensibilité", <StatusBadge key="m" tone="warning">MOYEN</StatusBadge>]]} /><Donut value={Math.min(100, Math.round(riskPercent * 50))} colors={["#f59e0b"]} /></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3"><LocalActionButton actionLabel="Validation trade" variant="success">Valider</LocalActionButton><LocalActionButton actionLabel="Refus trade" variant="danger">Refuser</LocalActionButton><LocalActionButton actionLabel="Conditions modifiées" variant="ghost">Modifier conditions</LocalActionButton><LocalActionButton actionLabel="Demande d'infos" variant="ghost">Demander plus d'infos</LocalActionButton></div>
          </GlassCard>
          <div className="grid grid-cols-2 gap-4"><GlassCard><CardTitle title="Règles de déclenchement" /><div className="flex flex-wrap gap-2">{reasons.map((reason) => <StatusBadge key={reason} tone="info">{reason}</StatusBadge>)}</div></GlassCard><GlassCard><CardTitle title="Journal d'audit" /><DataTable headers={["Heure", "Réviseur", "Décision", "Motif"]} rows={[["session", "Reviewer local", <span key="pending" className="text-amber-300">En attente</span>, selected.reason]]} /></GlassCard></div>
        </div>
        <div className="space-y-4"><GlassCard><CardTitle title="Statut du réviseur" /><StatusBadge tone="success">En ligne</StatusBadge><FieldRows rows={[["Réviseur", "Session locale"], ["Rôle", "Principal"], ["SLA", selected.deadline], ["File visible", `${visibleRequests.length}`]]} /></GlassCard><GlassCard><CardTitle title="Charge actuelle" /><ProgressBar value={Math.min(100, visibleRequests.length * 11)} /><div className="mt-2 flex items-center gap-2 text-sm text-slate-300">{visibleRequests.length} en attente<InfoHint content="Capacité recommandée < 15." /></div></GlassCard><GlassCard><CardTitle title="Recommandations IA" /><Timeline items={[{ title: selected.reason, detail: `${selected.asset} · ${selected.amount}`, tone: selected.confidence < 65 ? "warning" : "info" }, { title: "Vérifier risque", detail: selected.risk, tone: selected.risk.includes("2,") ? "danger" : "warning" }, { title: "Décision locale", detail: "Aucune écriture persistante tant que l'API validation n'est pas branchée.", tone: "ai" }]} /></GlassCard></div>
      </div>
    </>
  );
}

function CardTitle({ title, hint }: { title: string; hint?: string }) {
  return <div className="mb-4 flex items-center gap-2 text-base font-bold text-white">{title}{hint ? <InfoHint content={hint} /> : null}</div>;
}

function FieldRows({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <div className="divide-y divide-[#16314a] text-sm">
      {rows.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 py-2"><span className="text-slate-400">{label}</span><span className="text-right font-medium text-slate-100">{value}</span></div>)}
    </div>
  );
}
