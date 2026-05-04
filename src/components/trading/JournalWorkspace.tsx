"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Activity, BookOpenCheck, Download, Eye, FileText, Search, Shield, Target } from "lucide-react";
import type { RiskLimit, RiskRule } from "@/types/risk";
import type { Trade } from "@/types/trading";
import type { PaperTradingEvent } from "@/server/paper-trading/types";
import { formatPercent, signed } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checklist, GlassCard, InfoHint, MetricGauge, ProgressBar, StatusBadge, Timeline } from "@/components/ui/dashboard";
import { TradingDeskChart } from "@/components/trading/TradingDeskChart";

type ReplayStep = {
  time: string;
  title: string;
  detail: string;
};

type PricePoint = Record<string, string | number>;

type Props = {
  trades: Trade[];
  priceSeries: PricePoint[];
  replaySteps: ReplayStep[];
  riskRules: RiskRule[];
  riskLimits: RiskLimit[];
  paperEvents?: PaperTradingEvent[];
};

type TradeView = "all" | "opened" | "not-opened";
type ResultFilter = "all" | "win" | "loss" | "flat";
type JournalView = "trades" | "dossier" | "niveaux" | "decisions" | "risque" | "lecon" | "apprentissage";
type AgentLearningEntry = {
  id: string;
  agentId: string;
  tradeId: string;
  asset: string;
  title: string;
  detail: string;
  lesson: string;
  correctiveRule: string;
  tone: "success" | "danger" | "warning" | "info" | "ai";
  timestamp: number;
};

const durationLabel = "01:12:48";

export function JournalWorkspace({ trades, priceSeries, replaySteps, riskRules, riskLimits, paperEvents = [] }: Props) {
  const router = useRouter();
  const initialTradeView: TradeView = "all";
  const [selectedId, setSelectedId] = useState(() => filterTradesByView(trades, initialTradeView)[0]?.id);
  const [tradeView, setTradeView] = useState<TradeView>(initialTradeView);
  const [journalView, setJournalView] = useState<JournalView>("trades");
  const [agentFilter, setAgentFilter] = useState("all");
  const [assetFilter, setAssetFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [query, setQuery] = useState("");
  const tradeCounts = useMemo(() => countTradeViews(trades), [trades]);
  const agentOptions = useMemo(() => uniqueValues(trades.map((trade) => trade.agentId)), [trades]);
  const assetOptions = useMemo(() => uniqueValues(trades.map((trade) => trade.asset)), [trades]);
  const visibleTrades = useMemo(
    () => filterJournalTrades(trades, { tradeView, agentFilter, assetFilter, resultFilter, query }),
    [agentFilter, assetFilter, query, resultFilter, tradeView, trades],
  );
  const selected = visibleTrades.find((trade) => trade.id === selectedId) ?? visibleTrades[0];

  const exactEvents = useMemo(() => findTradeEvents(selected, paperEvents), [paperEvents, selected]);
  const decisionSteps = useMemo(() => buildDecisionSteps(selected, replaySteps, exactEvents), [exactEvents, selected, replaySteps]);
  const riskChecklist = useMemo(() => buildRiskChecklist(selected), [selected]);
  const learningEntries = useMemo(() => buildAgentLearningEntries(trades, paperEvents), [paperEvents, trades]);
  const rr = selected ? rewardRiskRatio(selected) : 0;
  const activeRiskRules = riskRules.filter((rule) => rule.status === "active").slice(0, 5);

  function resetFilters() {
    setTradeView(initialTradeView);
    setAgentFilter("all");
    setAssetFilter("all");
    setResultFilter("all");
    setQuery("");
  }

  function exportVisibleTrades() {
    downloadJson("journal-trading-vue.json", {
      generatedAt: new Date().toISOString(),
      filters: { tradeView, agentFilter, assetFilter, resultFilter, query },
      count: visibleTrades.length,
      trades: visibleTrades,
    });
  }

  function exportSelectedTrade() {
    if (!selected) return;
    downloadJson(`trade-${selected.id}.json`, {
      generatedAt: new Date().toISOString(),
      trade: selected,
      linkedEvents: exactEvents,
      decisionSteps,
      riskChecklist,
    });
  }

  function exportLearningJournal() {
    downloadJson("journal-apprentissage-agents.json", {
      generatedAt: new Date().toISOString(),
      count: learningEntries.length,
      entries: learningEntries,
    });
  }

  if (!selected) {
    return (
      <div className="mt-4">
        <JournalFilters
          agentFilter={agentFilter}
          agentOptions={agentOptions}
          assetFilter={assetFilter}
          assetOptions={assetOptions}
          onAgentChange={setAgentFilter}
          onAssetChange={setAssetFilter}
          onQueryChange={setQuery}
          onReset={resetFilters}
          onResultChange={setResultFilter}
          query={query}
          resultFilter={resultFilter}
          visibleCount={visibleTrades.length}
          totalCount={trades.length}
        />
        <GlassCard>
          <PanelTitle
            icon={<FileText className="size-5" />}
            title="Trades"
            action={<TradeViewSelector counts={tradeCounts} value={tradeView} onChange={setTradeView} />}
          />
          <div className="rounded-2xl border border-[#16314a] bg-white/[0.025] p-4 text-sm text-slate-400">
            Aucun élément pour ce filtre.
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <>
      <JournalFilters
        agentFilter={agentFilter}
        agentOptions={agentOptions}
        assetFilter={assetFilter}
        assetOptions={assetOptions}
        onAgentChange={setAgentFilter}
        onAssetChange={setAssetFilter}
        onQueryChange={setQuery}
        onReset={resetFilters}
        onResultChange={setResultFilter}
        query={query}
        resultFilter={resultFilter}
        visibleCount={visibleTrades.length}
        totalCount={trades.length}
      />
      <JournalViewTabs
        decisionCount={decisionSteps.length}
        eventCount={exactEvents.length}
        learningCount={learningEntries.length}
        selected={selected}
        tradeCount={visibleTrades.length}
        value={journalView}
        onChange={setJournalView}
      />
      <SelectedTradeSummary
        selected={selected}
        onExport={exportSelectedTrade}
        onReplay={() => router.push(`/decision-replay?trade=${encodeURIComponent(selected.id)}`)}
        onShowDossier={() => setJournalView("dossier")}
      />

      <div className="mt-4">
        {journalView === "trades" ? (
          <GlassCard>
            <PanelTitle
              icon={<FileText className="size-5" />}
              title="Trades"
              action={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <TradeViewSelector counts={tradeCounts} value={tradeView} onChange={setTradeView} />
                  <Button disabled={!visibleTrades.length} onClick={exportVisibleTrades} size="sm" variant="ghost"><Download className="size-4" /> Exporter vue</Button>
                  <StatusBadge tone="info">{visibleTrades.length}/{trades.length} · paper runtime</StatusBadge>
                </div>
              }
            />
            <div className="overflow-x-auto rounded-2xl border border-[#16314a]">
              <table className="min-w-[1180px] w-full text-left text-sm">
                <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    {["Date / Heure", "Agent", "Actif", "Type", "Entrée", "Sortie", "Résultat", "Durée", "Raison", "Discipline", "Tag"].map((header) => (
                      <th key={header} className="px-4 py-3 font-medium">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#16314a] text-slate-300">
                  {visibleTrades.map((trade) => {
                    const active = trade.id === selected.id;
                    const opened = isOpenedTrade(trade);
                    return (
                      <tr
                        key={trade.id}
                        onClick={() => setSelectedId(trade.id)}
                        className={cn("cursor-pointer transition hover:bg-sky-500/[0.08]", active && "bg-sky-500/[0.12] text-sky-50 shadow-[inset_3px_0_0_#0ea5e9]")}
                      >
                        <td className="px-4 py-3 font-mono text-xs">{trade.date}<br />{trade.time}</td>
                        <td className="px-4 py-3">{trade.agentId}</td>
                        <td className="px-4 py-3 font-semibold text-white">{trade.asset}</td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={opened ? trade.side === "LONG" ? "success" : "danger" : trade.tag === "Signal ignoré" ? "warning" : "info"}>
                            {opened ? trade.side : trade.tag}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3 font-mono">{trade.entry}</td>
                        <td className="px-4 py-3 font-mono">{trade.exit ?? "-"}</td>
                        <td className={cn("px-4 py-3 font-mono", trade.pnl >= 0 ? "text-emerald-300" : "text-red-300")}>{signed(trade.pnl, " $")}</td>
                        <td className="px-4 py-3 font-mono text-xs">{durationLabel}</td>
                        <td className="max-w-[240px] px-4 py-3">
                          <span className="line-clamp-2">{trade.initialReason}</span>
                        </td>
                        <td className="px-4 py-3"><StatusBadge tone={trade.disciplineScore >= 85 ? "success" : trade.disciplineScore >= 70 ? "warning" : "danger"}>{trade.disciplineScore}/100</StatusBadge></td>
                        <td className="px-4 py-3">{trade.tag}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </GlassCard>
        ) : null}

        {journalView === "dossier" ? (
          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <GlassCard>
              <PanelTitle icon={<Eye className="size-5" />} title="Dossier trade" action={<StatusBadge tone={statusTone(selected.status)}>{selected.status}</StatusBadge>} />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-2xl font-bold text-white">{selected.asset}</div>
                  <div className="mt-1 flex gap-2">
                    <StatusBadge tone={isOpenedTrade(selected) ? selected.side === "LONG" ? "success" : "danger" : selected.tag === "Signal ignoré" ? "warning" : "info"}>
                      {isOpenedTrade(selected) ? selected.side : selected.tag}
                    </StatusBadge>
                    <StatusBadge tone="neutral">{selected.agentId}</StatusBadge>
                  </div>
                </div>
                <div className={cn("font-mono text-2xl font-bold", selected.pnl >= 0 ? "text-emerald-300" : "text-red-300")}>{signed(selected.pnl, " $")}</div>
              </div>
              <FieldRows
                rows={[
                  ["ID", selected.id],
                  ["Decision ID", selected.decisionId ?? "-"],
                  ["Source", selected.source ?? "paper-runtime"],
                  ["Date", `${selected.date} ${selected.time}`],
                  ["Fenêtre OHLC", `${priceSeries.length} points`],
                  ["Événements liés", exactEvents.length],
                  ["Entrée", selected.entry],
                  ["Sortie", selected.exit ?? "-"],
                  ["Stop", selected.stopLoss],
                  ["Take profit", selected.takeProfit],
                  ["R:R", rr.toFixed(2)],
                ]}
              />
            </GlassCard>
            <GlassCard>
              <PanelTitle icon={<BookOpenCheck className="size-5" />} title="Synthèse de décision" />
              <div className="grid gap-4 md:grid-cols-[120px_1fr]">
                <MetricGauge value={selected.confidence} label="Confiance" tone={selected.confidence >= 70 ? "success" : "warning"} />
                <div className="space-y-3">
                  <SliderRow label="Confiance" value={selected.confidence} tone={selected.confidence >= 70 ? "success" : "warning"} />
                  <SliderRow label="Discipline" value={selected.disciplineScore} tone={selected.disciplineScore >= 85 ? "success" : "warning"} />
                  <SliderRow label="Risque" value={Math.min(100, selected.riskPercent * 100)} tone={selected.riskPercent <= 1 ? "success" : "danger"} />
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-[#16314a] bg-white/[0.025] p-3 text-sm leading-relaxed text-slate-300">{selected.initialReason}</div>
            </GlassCard>
          </div>
        ) : null}

        {journalView === "niveaux" ? (
          <GlassCard>
            <PanelTitle icon={<Target className="size-5" />} title="Niveaux & chart" action={<StatusBadge tone="info">{formatPercent(selected.riskPercent, 2)}</StatusBadge>} />
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <LevelTile label="Entrée" value={selected.entry} tone="info" />
              <LevelTile label="Stop" value={selected.stopLoss} tone="danger" />
              <LevelTile label="Take profit" value={selected.takeProfit} tone="success" />
            </div>
            <TradingDeskChart compact symbol={selected.asset} trades={[selected]} riskPercent={selected.riskPercent} title={`${selected.asset} · dossier`} />
          </GlassCard>
        ) : null}

        {journalView === "decisions" ? (
          <GlassCard>
            <PanelTitle icon={<Activity className="size-5" />} title="Décisions bot" action={<StatusBadge tone="info">{decisionSteps.length} étape(s)</StatusBadge>} />
            <Timeline items={decisionSteps} />
          </GlassCard>
        ) : null}

        {journalView === "risque" ? (
          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <GlassCard>
              <PanelTitle icon={<Shield className="size-5" />} title="Checklist risque" action={<InfoHint content={activeRiskRules.map((rule) => rule.name).join(" · ")} />} />
              <Checklist items={riskChecklist} />
            </GlassCard>
            <GlassCard>
              <PanelTitle icon={<Shield className="size-5" />} title="Limites runtime" />
              <div className="space-y-3">
                {riskLimits.slice(0, 5).map((limit) => (
                  <SliderRow key={limit.label} label={limit.label} value={(limit.current / limit.limit) * 100} tone={limit.current > limit.limit * 0.8 ? "warning" : "success"} />
                ))}
              </div>
            </GlassCard>
          </div>
        ) : null}

        {journalView === "lecon" ? (
          <GlassCard>
            <PanelTitle icon={<BookOpenCheck className="size-5" />} title="Leçon & export" />
            <div className="rounded-2xl border border-[#16314a] bg-white/[0.025] p-4 text-sm leading-relaxed text-slate-300">{selected.lesson}</div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={exportSelectedTrade} size="sm" variant="ghost"><Download className="size-4" /> Exporter</Button>
              <Button onClick={() => router.push(`/decision-replay?trade=${encodeURIComponent(selected.id)}`)} size="sm" variant="ai">Replay</Button>
            </div>
          </GlassCard>
        ) : null}

        {journalView === "apprentissage" ? (
          <AgentLearningJournal entries={learningEntries} onExport={exportLearningJournal} />
        ) : null}
      </div>
    </>
  );
}

function isOpenedTrade(trade: Trade) {
  return trade.status === "open" || trade.status === "closed";
}

function filterTradesByView(trades: Trade[], view: TradeView) {
  if (view === "opened") return trades.filter(isOpenedTrade);
  if (view === "not-opened") return trades.filter((trade) => !isOpenedTrade(trade));
  return trades;
}

function filterJournalTrades(
  trades: Trade[],
  filters: { tradeView: TradeView; agentFilter: string; assetFilter: string; resultFilter: ResultFilter; query: string },
) {
  const normalizedQuery = filters.query.trim().toLowerCase();
  return filterTradesByView(trades, filters.tradeView)
    .filter((trade) => filters.agentFilter === "all" || trade.agentId === filters.agentFilter)
    .filter((trade) => filters.assetFilter === "all" || trade.asset === filters.assetFilter)
    .filter((trade) => {
      if (filters.resultFilter === "win") return trade.pnl > 0;
      if (filters.resultFilter === "loss") return trade.pnl < 0;
      if (filters.resultFilter === "flat") return trade.pnl === 0;
      return true;
    })
    .filter((trade) => {
      if (!normalizedQuery) return true;
      return [trade.id, trade.decisionId, trade.agentId, trade.asset, trade.side, trade.status, trade.tag, trade.initialReason, trade.exitReason, trade.lesson]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    });
}

function countTradeViews(trades: Trade[]) {
  const opened = trades.filter(isOpenedTrade).length;
  return {
    all: trades.length,
    opened,
    "not-opened": trades.length - opened,
  };
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function buildAgentLearningEntries(trades: Trade[], events: PaperTradingEvent[]): AgentLearningEntry[] {
  const tradeEntries = trades.flatMap((trade) => learningSignalsForTrade(trade));
  const eventEntries = events
    .filter((event) => event.severity === "danger" || event.severity === "warning")
    .map((event) => ({
      id: `event-${event.id}`,
      agentId: event.agentId,
      tradeId: event.decisionId ?? event.id,
      asset: event.pair,
      title: event.severity === "danger" ? "Incident runtime" : "Alerte runtime",
      detail: `${event.title} · ${event.detail}`,
      lesson: event.detail,
      correctiveRule: correctiveRuleForEvent(event),
      tone: event.severity,
      timestamp: new Date(event.timestamp).getTime(),
    } satisfies AgentLearningEntry));
  const seen = new Set<string>();

  return [...tradeEntries, ...eventEntries]
    .toSorted((a, b) => b.timestamp - a.timestamp)
    .filter((entry) => {
      const key = `${entry.agentId}:${entry.tradeId}:${entry.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function learningSignalsForTrade(trade: Trade): AgentLearningEntry[] {
  const timestamp = tradeTimestampMs(trade);
  const entries: Array<Omit<AgentLearningEntry, "id" | "agentId" | "tradeId" | "asset" | "timestamp"> & { key: string }> = [];

  if (trade.pnl < 0) {
    entries.push({
      key: "loss",
      title: "Perte clôturée",
      detail: `${signed(trade.pnl, " $")} · ${trade.exitReason}`,
      lesson: trade.lesson,
      correctiveRule: correctiveRuleForTrade(trade, "loss"),
      tone: "danger",
    });
  }

  if (trade.status === "refused") {
    entries.push({
      key: "refused",
      title: "Signal refusé",
      detail: trade.initialReason,
      lesson: trade.lesson,
      correctiveRule: correctiveRuleForTrade(trade, "refused"),
      tone: "warning",
    });
  }

  if (trade.confidence < 60) {
    entries.push({
      key: "confidence",
      title: "Confiance trop basse",
      detail: `${trade.confidence}% · ${trade.initialReason}`,
      lesson: trade.lesson,
      correctiveRule: correctiveRuleForTrade(trade, "confidence"),
      tone: "warning",
    });
  }

  if (trade.disciplineScore < 80) {
    entries.push({
      key: "discipline",
      title: "Discipline à renforcer",
      detail: `${trade.disciplineScore}/100 · ${trade.tag}`,
      lesson: trade.lesson,
      correctiveRule: correctiveRuleForTrade(trade, "discipline"),
      tone: "ai",
    });
  }

  if (trade.riskPercent > 1) {
    entries.push({
      key: "risk",
      title: "Risque trop élevé",
      detail: `${formatPercent(trade.riskPercent, 2)} du capital`,
      lesson: trade.lesson,
      correctiveRule: correctiveRuleForTrade(trade, "risk"),
      tone: "danger",
    });
  }

  return entries.map((entry) => ({
    id: `${trade.id}-${entry.key}`,
    agentId: trade.agentId,
    tradeId: trade.id,
    asset: trade.asset,
    title: entry.title,
    detail: entry.detail,
    lesson: entry.lesson,
    correctiveRule: entry.correctiveRule,
    tone: entry.tone,
    timestamp,
  }));
}

function tradeTimestampMs(trade: Trade) {
  const [day = 1, month = 1, year = 1970] = trade.date.split("/").map((part) => Number(part));
  const [hour = 0, minute = 0, second = 0] = trade.time.split(":").map((part) => Number(part));
  const timestamp = new Date(year, month - 1, day, hour, minute, second).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function correctiveRuleForTrade(trade: Trade, type: "loss" | "refused" | "confidence" | "discipline" | "risk") {
  if (type === "loss") return `Réduire exposition sur ${trade.asset} tant que la confluence n'est pas meilleure.`;
  if (type === "refused") return "Conserver ce refus comme garde-fou et bloquer les signaux similaires.";
  if (type === "confidence") return "Interdire l'ouverture sous 60 % de confiance sans validation humaine.";
  if (type === "discipline") return "Ajouter une pause/revue si deux décisions faibles se répètent dans la session.";
  return "Ramener le risque sous 1 % avant toute nouvelle entrée.";
}

function correctiveRuleForEvent(event: PaperTradingEvent) {
  if (event.type === "risk_check") return "Durcir la règle de risque qui a déclenché cette alerte.";
  if (event.type === "analysis_rejected") return "Marquer le signal comme contre-exemple pour l'analyste.";
  if (event.type === "signal_ignored") return "Conserver le motif d'ignorance comme filtre de scan.";
  return "Ajouter cet événement au dossier d'apprentissage avant le prochain cycle.";
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

function JournalFilters({
  agentFilter,
  agentOptions,
  assetFilter,
  assetOptions,
  onAgentChange,
  onAssetChange,
  onQueryChange,
  onReset,
  onResultChange,
  query,
  resultFilter,
  visibleCount,
  totalCount,
}: {
  agentFilter: string;
  agentOptions: string[];
  assetFilter: string;
  assetOptions: string[];
  onAgentChange: (value: string) => void;
  onAssetChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onReset: () => void;
  onResultChange: (value: ResultFilter) => void;
  query: string;
  resultFilter: ResultFilter;
  visibleCount: number;
  totalCount: number;
}) {
  return (
    <GlassCard className="mt-4">
      <PanelTitle
        icon={<Search className="size-5" />}
        title="Filtres connectés"
        action={<div className="flex items-center gap-2"><StatusBadge tone="info">{visibleCount}/{totalCount}</StatusBadge><Button onClick={onReset} size="sm" variant="ghost">Réinitialiser</Button></div>}
      />
      <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.7fr]">
        <label className="block text-xs text-slate-400">
          Recherche
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="ID, raison, tag, leçon..."
            className="mt-1 h-10 w-full rounded-xl border border-[#1b3a55] bg-slate-950/60 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
          />
        </label>
        <SelectField label="Agent" value={agentFilter} onChange={onAgentChange} options={agentOptions} />
        <SelectField label="Actif" value={assetFilter} onChange={onAssetChange} options={assetOptions} />
        <label className="block text-xs text-slate-400">
          Résultat
          <select
            value={resultFilter}
            onChange={(event) => onResultChange(event.target.value as ResultFilter)}
            className="mt-1 h-10 w-full rounded-xl border border-[#1b3a55] bg-slate-950/60 px-3 text-sm text-slate-100 outline-none"
          >
            <option value="all">Tous</option>
            <option value="win">Gagnants</option>
            <option value="loss">Perdants</option>
            <option value="flat">Neutres/refusés</option>
          </select>
        </label>
      </div>
    </GlassCard>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="block text-xs text-slate-400">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-xl border border-[#1b3a55] bg-slate-950/60 px-3 text-sm text-slate-100 outline-none"
      >
        <option value="all">Tous</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function JournalViewTabs({
  decisionCount,
  eventCount,
  learningCount,
  selected,
  tradeCount,
  value,
  onChange,
}: {
  decisionCount: number;
  eventCount: number;
  learningCount: number;
  selected: Trade;
  tradeCount: number;
  value: JournalView;
  onChange: (view: JournalView) => void;
}) {
  const views: Array<{ value: JournalView; label: string; badge: string; icon: ReactNode }> = [
    { value: "trades", label: "Trades", badge: `${tradeCount}`, icon: <FileText className="size-4" /> },
    { value: "dossier", label: "Dossier", badge: selected.asset, icon: <Eye className="size-4" /> },
    { value: "niveaux", label: "Niveaux", badge: selected.side, icon: <Target className="size-4" /> },
    { value: "decisions", label: "Décisions", badge: `${decisionCount}`, icon: <Activity className="size-4" /> },
    { value: "risque", label: "Risque", badge: `${eventCount}`, icon: <Shield className="size-4" /> },
    { value: "lecon", label: "Leçon", badge: selected.disciplineScore >= 85 ? "OK" : "à revoir", icon: <BookOpenCheck className="size-4" /> },
    { value: "apprentissage", label: "Apprentissage", badge: `${learningCount}`, icon: <BookOpenCheck className="size-4" /> },
  ];

  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-[#16314a] bg-slate-950/40 p-1.5">
      <div className="grid min-w-[980px] grid-cols-7 gap-1.5">
        {views.map((view) => {
          const active = view.value === value;
          return (
            <button
              key={view.value}
              aria-pressed={active}
              className={cn(
                "flex h-12 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition",
                active
                  ? "border-sky-300/65 bg-sky-500/18 text-sky-100 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.25)]"
                  : "border-transparent bg-white/[0.03] text-slate-400 hover:border-sky-400/35 hover:text-sky-100",
              )}
              type="button"
              onClick={() => onChange(view.value)}
            >
              <span className={active ? "text-sky-200" : "text-slate-500"}>{view.icon}</span>
              <span>{view.label}</span>
              <span className="rounded-lg border border-white/10 bg-slate-950/50 px-2 py-0.5 text-[11px] font-mono text-slate-300">{view.badge}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AgentLearningJournal({ entries, onExport }: { entries: AgentLearningEntry[]; onExport: () => void }) {
  const grouped = useMemo(() => groupLearningByAgent(entries), [entries]);
  const criticalCount = entries.filter((entry) => entry.tone === "danger").length;
  const warningCount = entries.filter((entry) => entry.tone === "warning").length;

  return (
    <div className="space-y-4">
      <GlassCard>
        <PanelTitle
          icon={<BookOpenCheck className="size-5" />}
          title="Journal d'apprentissage des agents"
          action={<Button disabled={!entries.length} onClick={onExport} size="sm" variant="ghost"><Download className="size-4" /> Exporter</Button>}
        />
        <div className="grid gap-3 md:grid-cols-4">
          <LearningStat label="Erreurs journalisées" value={`${entries.length}`} tone={entries.length ? "warning" : "success"} />
          <LearningStat label="Critiques" value={`${criticalCount}`} tone={criticalCount ? "danger" : "success"} />
          <LearningStat label="À surveiller" value={`${warningCount}`} tone={warningCount ? "warning" : "success"} />
          <LearningStat label="Agents concernés" value={`${grouped.length}`} tone={grouped.length ? "ai" : "neutral"} />
        </div>
      </GlassCard>

      {grouped.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {grouped.map((group) => (
            <GlassCard key={group.agentId}>
              <PanelTitle
                title={group.agentId}
                action={<StatusBadge tone={group.criticalCount ? "danger" : group.warningCount ? "warning" : "info"}>{group.entries.length} leçon(s)</StatusBadge>}
              />
              <div className="mb-4 grid gap-3 md:grid-cols-3">
                <LearningStat label="Pertes/refus" value={`${group.criticalCount + group.warningCount}`} tone={group.criticalCount ? "danger" : "warning"} />
                <LearningStat label="Actifs" value={`${group.assets.length}`} tone="info" />
                <LearningStat label="Dernière erreur" value={group.latestLabel} tone="neutral" />
              </div>
              <Timeline
                items={group.entries.slice(0, 5).map((entry) => ({
                  title: entry.title,
                  detail: `${entry.asset} · ${entry.detail} · règle: ${entry.correctiveRule}`,
                  tone: entry.tone,
                }))}
              />
            </GlassCard>
          ))}
        </div>
      ) : (
        <GlassCard>
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-4 text-sm text-emerald-100">
            Aucun écart exploitable pour le moment. Dès qu'un agent perd, refuse un signal, baisse sous 60 % de confiance ou sort de discipline, une règle corrective apparaît ici.
          </div>
        </GlassCard>
      )}
    </div>
  );
}

function LearningStat({ label, value, tone }: { label: string; value: string; tone: "success" | "danger" | "warning" | "info" | "ai" | "neutral" }) {
  return (
    <div className="rounded-2xl border border-[#16314a] bg-white/[0.025] p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <div className="font-mono text-xl font-bold text-white">{value}</div>
        <StatusBadge tone={tone}>{tone}</StatusBadge>
      </div>
    </div>
  );
}

function groupLearningByAgent(entries: AgentLearningEntry[]) {
  const grouped = new Map<string, AgentLearningEntry[]>();
  entries.forEach((entry) => {
    grouped.set(entry.agentId, [...(grouped.get(entry.agentId) ?? []), entry]);
  });

  return [...grouped.entries()]
    .map(([agentId, agentEntries]) => {
      const sorted = agentEntries.toSorted((a, b) => b.timestamp - a.timestamp);
      return {
        agentId,
        entries: sorted,
        assets: uniqueValues(sorted.map((entry) => entry.asset)),
        criticalCount: sorted.filter((entry) => entry.tone === "danger").length,
        warningCount: sorted.filter((entry) => entry.tone === "warning").length,
        latestLabel: sorted[0] ? new Date(sorted[0].timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "-",
      };
    })
    .toSorted((a, b) => b.criticalCount - a.criticalCount || b.warningCount - a.warningCount || b.entries.length - a.entries.length);
}

function SelectedTradeSummary({
  selected,
  onExport,
  onReplay,
  onShowDossier,
}: {
  selected: Trade;
  onExport: () => void;
  onReplay: () => void;
  onShowDossier: () => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#16314a] bg-white/[0.025] px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-white">{selected.asset}</span>
          <StatusBadge tone={statusTone(selected.status)}>{selected.status}</StatusBadge>
          <StatusBadge tone="neutral">{selected.agentId}</StatusBadge>
          <span className={cn("font-mono text-sm font-bold", selected.pnl >= 0 ? "text-emerald-300" : "text-red-300")}>{signed(selected.pnl, " $")}</span>
        </div>
        <div className="mt-1 truncate text-xs text-slate-500">{selected.id}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onShowDossier} size="sm" variant="ghost"><Eye className="size-4" /> Dossier</Button>
        <Button onClick={onExport} size="sm" variant="ghost"><Download className="size-4" /> Exporter</Button>
        <Button onClick={onReplay} size="sm" variant="ai">Replay</Button>
      </div>
    </div>
  );
}

function LevelTile({ label, value, tone }: { label: string; value: number; tone: "success" | "danger" | "info" }) {
  return (
    <div className={cn(
      "rounded-2xl border bg-white/[0.03] p-3",
      tone === "success" && "border-emerald-400/25",
      tone === "danger" && "border-red-400/25",
      tone === "info" && "border-sky-400/25",
    )}>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn(
        "mt-1 font-mono text-lg font-bold",
        tone === "success" && "text-emerald-300",
        tone === "danger" && "text-red-300",
        tone === "info" && "text-sky-200",
      )}>{value}</div>
    </div>
  );
}

function TradeViewSelector({ counts, value, onChange }: { counts: Record<TradeView, number>; value: TradeView; onChange: (view: TradeView) => void }) {
  const options: Array<{ value: TradeView; label: string }> = [
    { value: "all", label: "Tous" },
    { value: "opened", label: "Ordres placés" },
    { value: "not-opened", label: "Non ouverts" },
  ];

  return (
    <div className="inline-flex rounded-xl border border-[#1b3a55] bg-slate-950/60 p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            aria-pressed={active}
            className={cn(
              "h-8 whitespace-nowrap rounded-lg px-3 text-xs font-semibold text-slate-400 transition",
              active && "bg-sky-500/20 text-sky-100 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.45)]",
            )}
            type="button"
            onClick={() => onChange(option.value)}
          >
            {option.label} · {counts[option.value]}
          </button>
        );
      })}
    </div>
  );
}

function findTradeEvents(trade: Trade | undefined, events: PaperTradingEvent[]) {
  if (!trade) return [];
  const byDecision = trade.decisionId ? events.filter((event) => event.decisionId === trade.decisionId || event.id === trade.decisionId) : [];
  const signalEvent = trade.decisionId ? events.find((event) => event.id === trade.decisionId) : undefined;
  if (signalEvent) {
    const signalCycleEvents = events.filter((event) => event.cycleId === signalEvent.cycleId && event.agentId === signalEvent.agentId && event.pair === signalEvent.pair);
    if (signalCycleEvents.length) return signalCycleEvents;
  }
  if (byDecision.length) return byDecision;
  return events.filter((event) => event.agentId === trade.agentId && event.pair === trade.asset).slice(-8);
}

function eventTone(event: PaperTradingEvent) {
  if (event.severity === "danger") return "danger" as const;
  if (event.severity === "warning") return "warning" as const;
  if (event.severity === "success") return "success" as const;
  if (event.severity === "ai") return "ai" as const;
  return "info" as const;
}

function eventTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function buildDecisionSteps(trade: Trade | undefined, replaySteps: ReplayStep[], exactEvents: PaperTradingEvent[]) {
  if (!trade) return [];
  if (exactEvents.length) {
    return exactEvents
      .toSorted((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((event) => ({
        time: eventTime(event.timestamp),
        title: `${event.type.replaceAll("_", " ")} · ${event.title}`,
        detail: `${event.detail}${event.payload ? ` · payload ${JSON.stringify(event.payload)}` : ""}`,
        tone: eventTone(event),
      }));
  }

  const blocked = trade.status === "refused";
  const closed = trade.status === "closed";

  return [
    { time: trade.time, title: "Signal", detail: trade.initialReason, tone: "info" as const },
    { time: replaySteps[1]?.time, title: "Analyse", detail: `Confiance ${trade.confidence}% · ${trade.side} ${trade.asset}`, tone: trade.confidence >= 70 ? "success" as const : "warning" as const },
    { time: replaySteps[2]?.time, title: "Risk check", detail: `Risque ${trade.riskPercent}% · stop ${trade.stopLoss} · TP ${trade.takeProfit}`, tone: trade.riskPercent <= 1 ? "success" as const : "danger" as const },
    { time: replaySteps[3]?.time, title: blocked ? "Bloqué" : "Ordre", detail: blocked ? trade.exitReason : `Entrée ${trade.entry}`, tone: blocked ? "danger" as const : "success" as const },
    { time: replaySteps[5]?.time, title: closed ? "Sortie" : "Suivi", detail: closed ? `${trade.exitReason} · sortie ${trade.exit ?? "-"}` : trade.lesson, tone: trade.pnl >= 0 ? "success" as const : "warning" as const },
  ];
}

function buildRiskChecklist(trade: Trade | undefined): Array<{ label: string; status: "ok" | "warning" | "danger" | "pending" }> {
  if (!trade) return [];
  return [
    { label: "Stop-loss", status: trade.stopLoss ? "ok" : "danger" },
    { label: "Risque < 1%", status: trade.riskPercent <= 1 ? "ok" : "danger" },
    { label: "Confiance", status: trade.confidence >= 70 ? "ok" : trade.confidence >= 60 ? "warning" : "danger" },
    { label: "Décision expliquée", status: trade.initialReason.length > 12 ? "ok" : "warning" },
  ];
}

function rewardRiskRatio(trade: Trade) {
  const risk = Math.abs(trade.entry - trade.stopLoss);
  const reward = Math.abs(trade.takeProfit - trade.entry);
  return risk ? reward / risk : 0;
}

function statusTone(status: Trade["status"]) {
  if (status === "closed") return "success";
  if (status === "open") return "info";
  if (status === "refused") return "danger";
  return "warning";
}

function PanelTitle({ icon, title, action }: { icon?: ReactNode; title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-base font-bold text-white">
        {icon ? <span className="text-sky-300">{icon}</span> : null}
        {title}
      </div>
      {action}
    </div>
  );
}

function FieldRows({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <div className="mt-4 divide-y divide-[#16314a] text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-4 py-2">
          <span className="text-slate-400">{label}</span>
          <span className="text-right font-medium text-slate-100">{value}</span>
        </div>
      ))}
    </div>
  );
}

function SliderRow({ label, value, tone = "info" }: { label: string; value: number; tone?: "success" | "danger" | "warning" | "info" | "ai" | "neutral" }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-slate-300">{label}</span>
        <span className="font-mono text-white">{Math.round(value)}%</span>
      </div>
      <ProgressBar value={value} tone={tone} />
    </div>
  );
}
