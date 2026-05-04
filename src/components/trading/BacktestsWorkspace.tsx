"use client";

import { useMemo, useState } from "react";
import { Activity, BrainCircuit, CalendarDays, Gauge, LineChart, Play, Target } from "lucide-react";
import type { StrategyDefinition } from "@/data/runtime/strategies";
import type { AppDataSnapshot } from "@/server/app-data";
import type { PaperTradingAllocationSettings } from "@/server/trading/allocation-store";
import type { MarketAsset, Trade } from "@/types/trading";
import { DISCLAIMERS } from "@/lib/constants";
import { formatPercent, signed } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { LocalAnalysisButton } from "@/components/analysis/LocalAnalysisButton";
import { Donut, EquityCurve, HeatmapGrid, ResultDistribution } from "@/components/charts/charts";
import { DataTable, DisclaimerBar, GlassCard, InfoHint, KpiCard, StatusBadge, Timeline } from "@/components/ui/dashboard";
import { TabbedContent, TabbedPanel } from "@/components/ui/tabbed-content";
import { LocalActionButton } from "@/components/system/LocalActionButton";
import { TradingDeskChart } from "@/components/trading/TradingDeskChart";

type BacktestsWorkspaceProps = {
  marketAssets: MarketAsset[];
  priceSeries: AppDataSnapshot["priceSeries"];
  monthlyHeatmap: AppDataSnapshot["monthlyHeatmap"];
  resultDistribution: AppDataSnapshot["resultDistribution"];
  strategies: StrategyDefinition[];
  trades: Trade[];
  metrics: AppDataSnapshot["metrics"];
  sourceStatus: AppDataSnapshot["sourceStatus"];
  paperAllocation: PaperTradingAllocationSettings;
};

type CandidateAsset = {
  asset: MarketAsset;
  strategy: StrategyDefinition;
  compatible: boolean;
  unitCount: number;
  notionalUsd: number;
  score: number;
};

type Tone = "success" | "danger" | "warning" | "info" | "ai" | "neutral";

function normalizePair(pair: string) {
  const compact = pair.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.endsWith("USDT")) return `${compact.slice(0, -4)}/USD`;
  if (compact.endsWith("USDC")) return `${compact.slice(0, -4)}/USD`;
  if (compact.endsWith("USD")) return `${compact.slice(0, -3)}/USD`;
  return compact;
}

function samePair(left: string, right: string) {
  return normalizePair(left) === normalizePair(right);
}

function formatUsd(value: number) {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: value < 1 ? 6 : 2 }).format(value)} $`;
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: value < 0.01 ? 8 : value < 1 ? 5 : 2 }).format(value);
}

function formatUnits(value: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: value >= 1000 ? 0 : value >= 10 ? 2 : 6 }).format(value);
}

function strategyScore(strategy: StrategyDefinition) {
  const statusBoost = strategy.status === "active" ? 20 : strategy.status === "draft" ? 6 : -18;
  return statusBoost + strategy.winRate * 0.35 + strategy.validationRate * 0.3 + strategy.performance * 0.25 - Math.abs(strategy.drawdown) * 0.35;
}

function compatibleStrategies(strategies: StrategyDefinition[], symbol: string) {
  return strategies
    .filter((strategy) => strategy.assets.some((asset) => samePair(asset, symbol)))
    .toSorted((a, b) => strategyScore(b) - strategyScore(a));
}

function fallbackStrategy(strategies: StrategyDefinition[]) {
  return [...strategies].toSorted((a, b) => strategyScore(b) - strategyScore(a))[0];
}

function bestStrategyForAsset(strategies: StrategyDefinition[], symbol: string) {
  return compatibleStrategies(strategies, symbol)[0] ?? fallbackStrategy(strategies);
}

function tradeBudgetUsd(allocation: PaperTradingAllocationSettings) {
  const base = allocation.sizingMode === "fixed_usd"
    ? allocation.tradeAmountUsd
    : allocation.capitalUsd * allocation.tradeAmountPercent / 100;
  return Math.max(0, base * allocation.leverage);
}

function assetScore(asset: MarketAsset, strategy: StrategyDefinition, unitCount: number, compatible: boolean) {
  const subDollarBoost = asset.price > 0 && asset.price < 1 ? 42 : asset.price < 10 ? 12 : -28;
  const unitBoost = Math.min(28, Math.log10(Math.max(unitCount, 1)) * 8);
  const liquidityPenalty = asset.authorized ? 0 : -30;
  const compatibilityBoost = compatible ? 24 : -36;
  return subDollarBoost + unitBoost + asset.confidence * 0.18 + asset.volatility * 1.8 + strategyScore(strategy) * 0.35 + liquidityPenalty + compatibilityBoost;
}

function rankCandidates(marketAssets: MarketAsset[], strategies: StrategyDefinition[], allocation: PaperTradingAllocationSettings): CandidateAsset[] {
  const notionalUsd = tradeBudgetUsd(allocation);
  return marketAssets
    .filter((asset) => asset.price > 0)
    .map((asset) => {
      const compatibleStrategy = compatibleStrategies(strategies, asset.symbol)[0];
      const strategy = compatibleStrategy ?? fallbackStrategy(strategies);
      const unitCount = notionalUsd / asset.price;
      return {
        asset,
        strategy,
        compatible: Boolean(compatibleStrategy),
        unitCount,
        notionalUsd,
        score: assetScore(asset, strategy, unitCount, Boolean(compatibleStrategy)),
      };
    })
    .toSorted((a, b) => b.score - a.score);
}

function compatibilityTone(strategy: StrategyDefinition, symbol: string): Tone {
  if (strategy.assets.some((asset) => samePair(asset, symbol))) return strategy.status === "active" ? "success" : "warning";
  return "danger";
}

function pairTrades(trades: Trade[], symbol: string) {
  return trades.filter((trade) => samePair(trade.asset, symbol));
}

function averageTradePnl(trades: Trade[]) {
  if (!trades.length) return 0;
  return trades.reduce((total, trade) => total + trade.pnl, 0) / trades.length;
}

function FieldRows({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <div className="divide-y divide-[#16314a] text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-4 py-2">
          <span className="text-slate-400">{label}</span>
          <span className="text-right font-medium text-slate-100">{value}</span>
        </div>
      ))}
    </div>
  );
}

function CardTitle({ title, action, hint }: { title: string; action?: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-base font-bold text-white">{title}{hint ? <InfoHint content={hint} /> : null}</div>
      {action}
    </div>
  );
}

function SelectorCard({
  candidate,
  active,
  onClick,
}: {
  candidate: CandidateAsset;
  active: boolean;
  onClick: () => void;
}) {
  const subDollar = candidate.asset.price < 1;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border p-3 text-left transition hover:border-sky-400/70 hover:bg-sky-500/10",
        active ? "border-sky-400/70 bg-sky-500/12" : "border-[#16314a] bg-white/[0.025]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-bold text-white">{candidate.asset.symbol}</div>
          <div className="mt-1 font-mono text-sm text-sky-200">{formatPrice(candidate.asset.price)} $</div>
        </div>
        <StatusBadge tone={subDollar ? "success" : "warning"}>{subDollar ? "< 1 $" : "cher"}</StatusBadge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <span className="rounded-lg bg-slate-950/45 px-2 py-1 text-slate-300">Unités {formatUnits(candidate.unitCount)}</span>
        <span className="rounded-lg bg-slate-950/45 px-2 py-1 text-slate-300">Vol {formatPercent(candidate.asset.volatility, 2)}</span>
      </div>
      <div className={cn("mt-2 truncate text-xs", candidate.compatible ? "text-violet-200" : "text-red-200")}>{candidate.compatible ? candidate.strategy.name : "Stratégie à créer"}</div>
    </button>
  );
}

export function BacktestsWorkspace({
  marketAssets,
  priceSeries,
  monthlyHeatmap,
  resultDistribution,
  strategies,
  trades,
  metrics,
  sourceStatus,
  paperAllocation,
}: BacktestsWorkspaceProps) {
  const candidates = useMemo(() => rankCandidates(marketAssets, strategies, paperAllocation), [marketAssets, paperAllocation, strategies]);
  const recommended = candidates.find((candidate) => candidate.asset.price < 1 && candidate.compatible && candidate.strategy.status === "active")
    ?? candidates.find((candidate) => candidate.asset.price < 1 && candidate.compatible)
    ?? candidates.find((candidate) => candidate.asset.price < 1)
    ?? candidates[0];

  const [selectedSymbol, setSelectedSymbol] = useState(recommended?.asset.symbol ?? marketAssets[0]?.symbol ?? "BTC/USD");
  const selectedCandidate = candidates.find((candidate) => samePair(candidate.asset.symbol, selectedSymbol)) ?? recommended ?? candidates[0];
  const defaultStrategy = selectedCandidate ? bestStrategyForAsset(strategies, selectedCandidate.asset.symbol) : fallbackStrategy(strategies);
  const [selectedStrategyId, setSelectedStrategyId] = useState(defaultStrategy?.id ?? strategies[0]?.id ?? "");
  const requestedStrategy = strategies.find((strategy) => strategy.id === selectedStrategyId);
  const requestedStrategyCompatible = requestedStrategy?.assets.some((asset) => samePair(asset, selectedSymbol)) ?? false;
  const selectedStrategy = selectedCandidate?.compatible && defaultStrategy && requestedStrategy && !requestedStrategyCompatible
    ? defaultStrategy
    : requestedStrategy ?? defaultStrategy ?? strategies[0];
  const compatible = selectedStrategy ? selectedStrategy.assets.some((asset) => samePair(asset, selectedSymbol)) : false;
  const selectedAsset = selectedCandidate?.asset ?? marketAssets.find((asset) => samePair(asset.symbol, selectedSymbol)) ?? marketAssets[0];
  const selectedTrades = pairTrades(trades, selectedSymbol);
  const budgetUsd = tradeBudgetUsd(paperAllocation);
  const unitCount = selectedAsset?.price ? budgetUsd / selectedAsset.price : 0;
  const activeStrategyOptions = strategies.filter((strategy) => strategy.status === "active");
  const subDollarCandidates = candidates.filter((candidate) => candidate.asset.price < 1);
  const kpiTrades = selectedTrades.length ? selectedTrades : trades;

  function selectCandidate(candidate: CandidateAsset) {
    setSelectedSymbol(candidate.asset.symbol);
    setSelectedStrategyId(candidate.strategy.id);
  }

  if (!selectedAsset || !selectedStrategy) {
    return (
      <GlassCard>
        <div className="text-sm text-slate-400">Aucun marché ou stratégie disponible pour préparer un backtest.</div>
      </GlassCard>
    );
  }

  return (
    <>
      <div className="grid grid-cols-6 gap-4 max-2xl:grid-cols-3 max-lg:grid-cols-2 max-md:grid-cols-1">
        <KpiCard label="Actif backtesté" value={selectedAsset.symbol} delta={`${formatPrice(selectedAsset.price)} $ · ${selectedAsset.price < 1 ? "sous 1 $" : "hors cible"}`} tone={selectedAsset.price < 1 ? "success" : "warning"} />
        <KpiCard label="Stratégie testée" value={selectedStrategy.name} delta={`${selectedStrategy.timeframe} · ${selectedStrategy.status}`} tone={compatibilityTone(selectedStrategy, selectedAsset.symbol)} />
        <KpiCard label="Unités simulables" value={formatUnits(unitCount)} delta={`${formatUsd(budgetUsd)} notionnel/trade`} tone={unitCount >= 10 ? "success" : "warning"} />
        <KpiCard label="Rendement stratégie" value={signed(selectedStrategy.performance, "%")} delta={`${formatPercent(selectedStrategy.winRate, 1)} win rate`} tone={selectedStrategy.performance >= 0 ? "success" : "danger"} />
        <KpiCard label="Drawdown max" value={signed(selectedStrategy.drawdown, "%")} delta={`risque ${selectedStrategy.risk}`} tone={Math.abs(selectedStrategy.drawdown) > 10 ? "danger" : "warning"} />
        <KpiCard label="Robustesse" value={`${metrics.crisis.averageRobustness}/100`} delta={`${metrics.crisis.robustScenarios}/${metrics.crisis.scenarioCount} scénarios`} tone="ai"><Donut value={metrics.crisis.averageRobustness} colors={["#8b5cf6"]} /></KpiCard>
      </div>

      <TabbedContent
        className="mt-4"
        tabs={[
          { id: "config", label: "Configuration", badge: selectedStrategy.timeframe, tone: "info", icon: <CalendarDays className="size-4" /> },
          { id: "charts", label: "Graphiques", badge: selectedAsset.symbol, tone: selectedAsset.price < 1 ? "success" : "warning", icon: <LineChart className="size-4" /> },
          { id: "trades", label: "Trades", badge: `${selectedTrades.length || metrics.trade.total}`, tone: "info", icon: <Target className="size-4" /> },
          { id: "analysis", label: "Analyse", badge: `${metrics.crisis.averageRobustness}/100`, tone: "ai", icon: <BrainCircuit className="size-4" /> },
        ]}
      >
        <TabbedPanel id="config">
          <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-4 max-xl:grid-cols-1">
            <GlassCard>
              <CardTitle
                title="Sélection backtest"
                action={<StatusBadge tone={subDollarCandidates.length ? "success" : "warning"}>{subDollarCandidates.length} actif(s) sous 1 $</StatusBadge>}
                hint="Le score privilégie les actifs autorisés, sous 1 dollar, avec assez d'unités simulables et une stratégie compatible."
              />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {candidates.slice(0, 6).map((candidate) => (
                  <SelectorCard
                    key={candidate.asset.symbol}
                    candidate={candidate}
                    active={samePair(candidate.asset.symbol, selectedAsset.symbol)}
                    onClick={() => selectCandidate(candidate)}
                  />
                ))}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="text-xs text-slate-400">
                  Actif
                  <select
                    className="mt-1 h-11 w-full rounded-xl border border-[#1b3a55] bg-slate-950/60 px-3 text-sm text-slate-100 outline-none"
                    value={selectedAsset.symbol}
                    onChange={(event) => {
                      const candidate = candidates.find((item) => item.asset.symbol === event.target.value);
                      if (candidate) selectCandidate(candidate);
                    }}
                  >
                    {candidates.map((candidate) => (
                      <option key={candidate.asset.symbol} value={candidate.asset.symbol}>
                        {candidate.asset.symbol} · {formatPrice(candidate.asset.price)} $
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-400">
                  Stratégie
                  <select
                    className="mt-1 h-11 w-full rounded-xl border border-[#1b3a55] bg-slate-950/60 px-3 text-sm text-slate-100 outline-none"
                    value={selectedStrategy.id}
                    onChange={(event) => setSelectedStrategyId(event.target.value)}
                  >
                    {strategies.map((strategy) => (
                      <option key={strategy.id} value={strategy.id}>
                        {strategy.name} · {strategy.timeframe} · {strategy.status}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </GlassCard>

            <GlassCard>
              <CardTitle title="Configuration exécutée" action={<StatusBadge tone={compatible ? "success" : "danger"}>{compatible ? "compatible" : "hors univers"}</StatusBadge>} />
              <FieldRows rows={[
                ["Stratégie", selectedStrategy.name],
                ["Paire", selectedAsset.symbol],
                ["Prix", `${formatPrice(selectedAsset.price)} $`],
                ["Capital paper", formatUsd(paperAllocation.capitalUsd)],
                ["Notionnel/trade", formatUsd(budgetUsd)],
                ["Unités simulées", formatUnits(unitCount)],
                ["Timeframe", selectedStrategy.timeframe],
                ["Frais", "adapter exchange"],
                ["Slippage", "adapter exchange"],
                ["Risque/trade", `${paperAllocation.riskPerTradePercent}%`],
              ]} />
              <div className="mt-4">
                <LocalActionButton actionLabel={`Backtest ${selectedStrategy.name} sur ${selectedAsset.symbol}`} className="w-full" variant="ai">
                  Recalculer localement <Play className="size-4" />
                </LocalActionButton>
              </div>
            </GlassCard>
          </div>

          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_360px] gap-4 max-xl:grid-cols-1">
            <GlassCard>
              <CardTitle title="Stratégie visible" action={<StatusBadge tone={selectedStrategy.status === "active" ? "success" : "warning"}>{selectedStrategy.status}</StatusBadge>} />
              <div className="grid gap-4 lg:grid-cols-3">
                <div>
                  <div className="mb-2 text-sm font-bold text-sky-200">Entrées</div>
                  <div className="space-y-2">{selectedStrategy.entryRules.map((rule) => <div key={rule} className="rounded-xl border border-[#16314a] bg-white/[0.025] px-3 py-2 text-sm text-slate-300">{rule}</div>)}</div>
                </div>
                <div>
                  <div className="mb-2 text-sm font-bold text-emerald-200">Sorties</div>
                  <div className="space-y-2">{selectedStrategy.exitRules.map((rule) => <div key={rule} className="rounded-xl border border-[#16314a] bg-white/[0.025] px-3 py-2 text-sm text-slate-300">{rule}</div>)}</div>
                </div>
                <div>
                  <div className="mb-2 text-sm font-bold text-violet-200">Filtres</div>
                  <div className="space-y-2">{selectedStrategy.filters.map((filter) => <div key={filter} className="rounded-xl border border-[#16314a] bg-white/[0.025] px-3 py-2 text-sm text-slate-300">{filter}</div>)}</div>
                </div>
              </div>
            </GlassCard>
            <GlassCard>
              <CardTitle title="Univers stratégie" />
              <div className="flex flex-wrap gap-2">
                {selectedStrategy.assets.map((asset) => (
                  <StatusBadge key={asset} tone={samePair(asset, selectedAsset.symbol) ? "success" : "neutral"}>{asset}</StatusBadge>
                ))}
              </div>
              <div className="mt-4">
                <FieldRows rows={[
                  ["Win Rate", formatPercent(selectedStrategy.winRate, 1)],
                  ["Validation", formatPercent(selectedStrategy.validationRate, 1)],
                  ["Performance", signed(selectedStrategy.performance, "%")],
                  ["Drawdown", <span key="drawdown" className="text-red-300">{signed(selectedStrategy.drawdown, "%")}</span>],
                  ["Actives disponibles", `${activeStrategyOptions.length}`],
                ]} />
              </div>
            </GlassCard>
          </div>
        </TabbedPanel>

        <TabbedPanel id="charts">
          <TabbedContent
            defaultTab="price"
            tabs={[
              { id: "price", label: "Prix & niveaux", badge: selectedAsset.symbol, tone: "success", icon: <LineChart className="size-4" /> },
              { id: "equity", label: "Courbe d'équité", badge: "séparée", tone: "info", icon: <Activity className="size-4" /> },
              { id: "compare", label: "Comparaison", badge: selectedStrategy.name, tone: "ai", icon: <Gauge className="size-4" /> },
            ]}
          >
            <TabbedPanel id="price">
              <div className="space-y-3">
                <CardTitle title="Graphique des prix avec trades et niveaux" action={<StatusBadge tone="success">{selectedAsset.symbol}</StatusBadge>} />
                <TradingDeskChart key={`${selectedAsset.symbol}-${selectedStrategy.id}`} symbol={selectedAsset.symbol} trades={selectedTrades.length ? selectedTrades : trades} riskPercent={paperAllocation.riskPerTradePercent} title={`${selectedAsset.symbol} · ${selectedStrategy.name}`} />
              </div>
            </TabbedPanel>
            <TabbedPanel id="equity">
              <GlassCard>
                <CardTitle title="Courbe d'équité" action={<StatusBadge tone="info">Vue séparée</StatusBadge>} />
                <EquityCurve data={priceSeries} />
              </GlassCard>
            </TabbedPanel>
            <TabbedPanel id="compare">
              <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-4 max-xl:grid-cols-1">
                <GlassCard>
                  <CardTitle title="Lecture comparative" />
                  <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-1">
                    <KpiCard label="Performance stratégie" value={signed(selectedStrategy.performance, "%")} delta="résultat déclaré" tone={selectedStrategy.performance >= 0 ? "success" : "danger"} />
                    <KpiCard label="P&L paire" value={signed(selectedTrades.reduce((total, trade) => total + trade.pnl, 0), " $")} delta={`${selectedTrades.length} décision(s) sur paire`} tone={averageTradePnl(selectedTrades) >= 0 ? "success" : "danger"} />
                    <KpiCard label="Unités/trade" value={formatUnits(unitCount)} delta={formatUsd(budgetUsd)} tone={unitCount >= 10 ? "success" : "warning"} />
                  </div>
                  <div className="mt-4">
                    <EquityCurve data={priceSeries} />
                  </div>
                </GlassCard>
                <GlassCard>
                  <CardTitle title="Décision visuelle" />
                  <FieldRows rows={[
                    ["Actif chart", selectedAsset.symbol],
                    ["Stratégie", selectedStrategy.name],
                    ["Compatibilité", <StatusBadge key="compatibility" tone={compatible ? "success" : "danger"}>{compatible ? "OK" : "à corriger"}</StatusBadge>],
                    ["Drawdown max", <span key="dd" className="text-red-300">{signed(selectedStrategy.drawdown, "%")}</span>],
                    ["Trades refusés", `${metrics.trade.refused}`],
                  ]} />
                </GlassCard>
              </div>
            </TabbedPanel>
          </TabbedContent>
        </TabbedPanel>

        <TabbedPanel id="trades">
          <GlassCard>
            <CardTitle title="Trades audités sur la paire" action={<StatusBadge tone={selectedTrades.length ? "info" : "warning"}>{selectedTrades.length}</StatusBadge>} />
            <DataTable
              headers={["Date", "Paire", "Côté", "Entrée", "Sortie", "Résultat", "Risque"]}
              rows={(selectedTrades.length ? selectedTrades : kpiTrades.slice(0, 5)).slice(0, 8).map((trade) => [
                trade.date,
                trade.asset,
                <StatusBadge key={`${trade.id}-side`} tone={trade.side === "LONG" ? "success" : "danger"}>{trade.side}</StatusBadge>,
                trade.entry,
                trade.exit ?? "-",
                <span key={`${trade.id}-pnl`} className={trade.pnl >= 0 ? "text-emerald-300" : "text-red-300"}>{signed(trade.pnl, " $")}</span>,
                `${trade.riskPercent}%`,
              ])}
            />
          </GlassCard>
        </TabbedPanel>

        <TabbedPanel id="analysis">
          <div className="grid grid-cols-3 gap-4 max-xl:grid-cols-1">
            <GlassCard><CardTitle title="Distribution des résultats" /><ResultDistribution data={resultDistribution} /></GlassCard>
            <GlassCard><CardTitle title="Heatmap des mois" /><HeatmapGrid values={monthlyHeatmap} /></GlassCard>
            <GlassCard>
              <CardTitle title="Observations IA" />
              <Timeline items={[
                { title: selectedStrategy.recommendation, tone: "warning" },
                { title: `${selectedAsset.symbol} · ${formatUnits(unitCount)} unités simulables`, tone: selectedAsset.price < 1 ? "success" : "warning" },
                { title: `${metrics.risk.activeAlerts} alertes risque à intégrer`, tone: metrics.risk.activeAlerts ? "warning" : "success" },
                { title: `Source marché ${sourceStatus.market}`, tone: sourceStatus.market === "connected" ? "success" : "danger" },
              ]} />
              <div className="mt-4">
                <LocalAnalysisButton
                  surface="backtest"
                  task="Auditer cette simulation de backtest, vérifier le choix actif sous 1 dollar, la stratégie testée, les frais, le slippage et les limites de capital avant paper trading."
                  context={{ strategy: selectedStrategy, selectedAsset, tradeBudgetUsd: budgetUsd, unitCount, tradeMetrics: metrics.trade, riskMetrics: metrics.risk, crisisMetrics: metrics.crisis }}
                />
              </div>
            </GlassCard>
          </div>
        </TabbedPanel>
      </TabbedContent>
      <DisclaimerBar items={DISCLAIMERS} />
    </>
  );
}
