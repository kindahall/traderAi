"use client";

import { useMemo, useState } from "react";
import { Download, Pause, Play, Rewind, Search, Star } from "lucide-react";
import type { AppDataSnapshot, DataSourceStatus } from "@/server/app-data";
import type { Trade } from "@/types/trading";
import { formatPercent, signed } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checklist, DataTable, GlassCard, InfoHint, MetricGauge, StatusBadge, Stepper, Timeline } from "@/components/ui/dashboard";
import { TradingDeskChart } from "@/components/trading/TradingDeskChart";

type ReplayStep = AppDataSnapshot["replaySteps"][number];
type MarketMetrics = AppDataSnapshot["metrics"]["market"];
type RiskMetrics = AppDataSnapshot["metrics"]["risk"];

type Props = {
  initialTradeId?: string;
  trades: Trade[];
  replaySteps: ReplayStep[];
  marketMetrics: MarketMetrics;
  riskMetrics: RiskMetrics;
  sourceStatus: DataSourceStatus;
};

export function DecisionReplayWorkspace({ initialTradeId, trades, replaySteps, marketMetrics, riskMetrics, sourceStatus }: Props) {
  const initialId = trades.some((trade) => trade.id === initialTradeId) ? initialTradeId : trades[0]?.id;
  const [selectedId, setSelectedId] = useState(initialId ?? "");
  const [query, setQuery] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [speed, setSpeed] = useState<"1x" | "2x">("1x");
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  const visibleTrades = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return trades;
    return trades.filter((trade) => [trade.id, trade.decisionId, trade.asset, trade.side, trade.status, trade.initialReason, trade.lesson]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedQuery)));
  }, [query, trades]);

  const selected = trades.find((trade) => trade.id === selectedId) ?? visibleTrades[0] ?? trades[0];
  const stepCount = Math.max(replaySteps.length, 1);
  const favorite = selected ? favoriteIds.includes(selected.id) : false;

  function selectTrade(tradeId: string) {
    setSelectedId(tradeId);
    setActiveStep(0);
  }

  function exportReplay() {
    if (!selected) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      trade: selected,
      visibleMarket: marketMetrics,
      replaySteps,
      audit: buildAudit(selected, riskMetrics.tradeRiskLimit),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `decision-replay-${selected.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function toggleFavorite() {
    if (!selected) return;
    setFavoriteIds((current) => current.includes(selected.id) ? current.filter((id) => id !== selected.id) : [...current, selected.id]);
  }

  if (!selected) {
    return <GlassCard><StatusBadge tone="warning">Aucun trade disponible pour le replay</StatusBadge></GlassCard>;
  }

  const riskReward = Math.abs(selected.takeProfit - selected.entry) / Math.max(Math.abs(selected.entry - selected.stopLoss), 1);
  const audit = buildAudit(selected, riskMetrics.tradeRiskLimit);

  return (
    <>
      <GlassCard>
        <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
          <div>
            <div className="mb-3 flex items-center gap-2 font-bold text-white"><Search className="size-5 text-sky-300" /> Trade rejoué</div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Chercher id, actif, statut, leçon..."
              className="h-10 w-full rounded-xl border border-[#1b3a55] bg-slate-950/60 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
            />
            <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
              {visibleTrades.map((trade) => (
                <button
                  key={trade.id}
                  type="button"
                  onClick={() => selectTrade(trade.id)}
                  className={cn(
                    "w-full rounded-2xl border p-3 text-left transition",
                    trade.id === selected.id ? "border-sky-400/70 bg-sky-500/12" : "border-[#16314a] bg-white/[0.025] hover:border-sky-400/45",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-white">{trade.asset}</div>
                      <div className="font-mono text-xs text-slate-500">{trade.date} {trade.time}</div>
                    </div>
                    <StatusBadge tone={trade.side === "LONG" ? "success" : "danger"}>{trade.side}</StatusBadge>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                    <span className={trade.pnl >= 0 ? "text-emerald-300" : "text-red-300"}>{signed(trade.pnl, " $")}</span>
                    <span className="text-slate-400">{trade.status}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <SummaryCell label="Actif" value={selected.asset} badge={<StatusBadge tone={selected.side === "LONG" ? "success" : "danger"}>{selected.side}</StatusBadge>} />
              <SummaryCell label="Résultat" value={signed(selected.pnl, " $")} tone={selected.pnl >= 0 ? "success" : "danger"} />
              <SummaryCell label="Date" value={`${selected.date} ${selected.time}`} />
              <SummaryCell label="Statut" value={selected.status} />
            </div>
            <div className="grid gap-3 md:grid-cols-[120px_1fr_1fr_1fr]">
              <MetricGauge value={selected.confidence} label="Confiance" tone="ai" />
              <FieldRows rows={[["Entrée", selected.entry], ["Sortie", selected.exit ?? "-"]]} />
              <FieldRows rows={[["TP / SL", `${selected.takeProfit} / ${selected.stopLoss}`], ["R:R initial", riskReward.toFixed(2)]]} />
              <FieldRows rows={[["Risque", `${selected.riskPercent}%`], ["Discipline", `${selected.disciplineScore}/100`]]} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={exportReplay}><Download className="size-4" /> Export JSON</Button>
              <Button onClick={toggleFavorite} variant={favorite ? "ai" : "ghost"}><Star className="size-4" /> {favorite ? "Favori" : "Ajouter favori"}</Button>
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="mt-4">
        <CardTitle title="Chronologie du replay" action={<StatusBadge tone="info">Étape {activeStep + 1}/{stepCount}</StatusBadge>} />
        <Stepper active={activeStep} steps={replaySteps.map((step) => step.title)} />
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Button onClick={() => setActiveStep(0)} variant="ghost"><Rewind className="size-4" /> Début</Button>
          <Button onClick={() => setActiveStep((step) => Math.min(step + 1, stepCount - 1))} variant="ghost"><Play className="size-4" /> Avancer</Button>
          <Button onClick={() => setActiveStep((step) => Math.max(step - 1, 0))} variant="ghost"><Pause className="size-4" /> Reculer</Button>
          <Button onClick={() => setSpeed("1x")} variant={speed === "1x" ? "default" : "ghost"}>1x</Button>
          <Button onClick={() => setSpeed("2x")} variant={speed === "2x" ? "default" : "ghost"}>2x</Button>
        </div>
      </GlassCard>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr_1.25fr_1fr_300px]">
        <GlassCard><CardTitle title="Données visibles" /><FieldRows rows={[["Prix principal", marketMetrics.primaryPrice], ["Régime", <span key="r" className={marketMetrics.primaryChange >= 0 ? "text-emerald-300" : "text-red-300"}>{marketMetrics.regime}</span>], ["Trend", marketMetrics.trendLabel], ["Volatilité moyenne", formatPercent(marketMetrics.avgVolatility)], ["Volume 24h", marketMetrics.primaryAsset?.volume24h ?? "-"], ["Confiance marché", `${marketMetrics.avgConfidence}%`], ["Source", sourceStatus.market], ["Sentiment", marketMetrics.sentiment]]} /></GlassCard>
        <GlassCard><CardTitle title="Raisonnement de l'agent" /><Timeline items={replaySteps.map((step, index) => ({ time: step.time, title: step.title, detail: step.detail, tone: index <= activeStep ? "success" : "neutral" }))} /></GlassCard>
        <GlassCard><CardTitle title="Instantané du marché avec niveaux" /><TradingDeskChart compact symbol={selected.asset} trades={[selected]} riskPercent={selected.riskPercent} title={`${selected.asset} · décision rejouée`} /></GlassCard>
        <GlassCard><CardTitle title="Action réelle vs optimale" /><FieldRows rows={[["Entrée", selected.entry], ["Type", selected.source ?? "ordre journalisé"], ["Stop initial", selected.stopLoss], ["Take Profit", <span key="tp" className="text-emerald-300">{selected.takeProfit}</span>], ["R:R initial", riskReward.toFixed(2)], ["Amélioration potentielle", <span key="imp" className={audit.riskOk ? "text-emerald-300" : "text-amber-300"}>{audit.recommendation}</span>]]} /></GlassCard>
        <GlassCard><CardTitle title="Verdict d'audit" /><MetricGauge value={selected.disciplineScore} label={`${selected.disciplineScore}/100`} tone={audit.overallTone} /><div className="flex items-center gap-2 text-sm text-slate-300">Leçon<InfoHint content={selected.lesson} /></div><Checklist items={[{ label: "Contexte interprété", status: "ok" }, { label: "Signal validé", status: selected.confidence >= 60 ? "ok" : "warning" }, { label: "Risque maîtrisé", status: audit.riskOk ? "ok" : "danger" }, { label: "Journalisation complète", status: selected.decisionId || selected.id ? "ok" : "warning" }]} /></GlassCard>
      </div>

      <GlassCard className="mt-4">
        <CardTitle title="Trades disponibles" action={<StatusBadge tone="info">{visibleTrades.length}/{trades.length}</StatusBadge>} />
        <DataTable
          headers={["Trade", "Actif", "Side", "Statut", "Confiance", "Risque", "P&L", "Action"]}
          rows={visibleTrades.slice(0, 8).map((trade) => [
            trade.id,
            trade.asset,
            <StatusBadge key={`${trade.id}-side`} tone={trade.side === "LONG" ? "success" : "danger"}>{trade.side}</StatusBadge>,
            trade.status,
            `${trade.confidence}%`,
            `${trade.riskPercent}%`,
            <span key={`${trade.id}-pnl`} className={trade.pnl >= 0 ? "text-emerald-300" : "text-red-300"}>{signed(trade.pnl, " $")}</span>,
            <Button key={`${trade.id}-select`} onClick={() => selectTrade(trade.id)} size="sm" variant={trade.id === selected.id ? "ai" : "ghost"}>Rejouer</Button>,
          ])}
        />
      </GlassCard>
    </>
  );
}

function buildAudit(trade: Trade, riskLimit: number) {
  const riskOk = trade.riskPercent <= riskLimit;
  const confidenceOk = trade.confidence >= 60;
  return {
    riskOk,
    recommendation: riskOk && confidenceOk ? "conserver le setup" : riskOk ? "renforcer signal LLM" : "réduire risque avant exécution",
    overallTone: riskOk && trade.disciplineScore >= 70 ? "success" as const : "warning" as const,
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

function SummaryCell({ label, value, badge, tone }: { label: string; value: React.ReactNode; badge?: React.ReactNode; tone?: "success" | "danger" }) {
  return (
    <div className="rounded-2xl border border-[#16314a] bg-white/[0.025] p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cn("mt-1 font-mono text-lg font-bold text-white", tone === "success" && "text-emerald-300", tone === "danger" && "text-red-300")}>{value}</div>
      {badge ? <div className="mt-2">{badge}</div> : null}
    </div>
  );
}
