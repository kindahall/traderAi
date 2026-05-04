"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Bot,
  BrainCircuit,
  Lock,
  MousePointer2,
  Radio,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Zap,
} from "lucide-react";
import type { Agent } from "@/types/agent";
import type { MarketAsset, Trade } from "@/types/trading";
import { formatPercent, signed } from "@/lib/formatters";
import { useLiveMarketStore, type LiveMarketTick } from "@/lib/live-market-store";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/charts/charts";
import { LiveMarketBoard, LiveMiniChart } from "@/components/live/LiveMarket";
import { Button } from "@/components/ui/button";
import { GlassCard, InfoHint, KpiCard, MetricGauge, ProgressBar, StatusBadge, Timeline, TogglePill } from "@/components/ui/dashboard";
import { PaperTradingRuntimePanel } from "@/components/trading/PaperTradingRuntimePanel";
import { TradingDeskChart } from "@/components/trading/TradingDeskChart";

type PricePoint = {
  label?: string;
  price: number;
  equity?: number;
  benchmark?: number;
  volume?: number;
  pnl?: number;
};

type MarketsWorkspaceProps = {
  agents: Agent[];
  marketAssets: MarketAsset[];
  priceSeries: PricePoint[];
  trades: Trade[];
  riskPercent: number;
  sourceStatus: string;
  metrics: {
    trendLabel: string;
    primaryChange: number;
    avgVolatility: number;
    avgConfidence: number;
    watchedPairs: number;
    authorizedPairs: number;
    opportunities: number;
    positiveRatio: number;
    sentiment: string;
    regime: string;
    primarySymbol: string;
    sourceLabel?: string;
    marketType?: "spot" | "perp";
  };
};

type LiveMarketAsset = MarketAsset & {
  lastTickAt?: number;
  lastTickLabel?: string;
  liveDirection?: LiveMarketTick["direction"];
  livePoints?: LiveMarketTick["points"];
};

type MarketScope = "all" | "agents" | "authorized" | "opportunities" | "paper";

const MARKET_SCOPE_OPTIONS: Array<{ id: MarketScope; label: string; hint: string }> = [
  { id: "all", label: "Tous marchés", hint: "Top univers + paire active." },
  { id: "agents", label: "Paires agents", hint: "Focus et permissions des agents actifs." },
  { id: "authorized", label: "Autorisés", hint: "Paires autorisées pour cette session." },
  { id: "opportunities", label: "Opportunités", hint: "Scores forts ou signaux de marché élevés." },
  { id: "paper", label: "Paper sécurisé", hint: "Autorisées avec confiance suffisante." },
];

function normalizeSymbol(symbol: string) {
  return symbol.toUpperCase().replace(/[^A-Z0-9]/g, "") || "BTCUSD";
}

function sameMarketPair(left: string, right: string) {
  const l = normalizeSymbol(left).replace(/USDT$/, "USD").replace(/USDC$/, "USD");
  const r = normalizeSymbol(right).replace(/USDT$/, "USD").replace(/USDC$/, "USD");
  return l === r;
}

function formatPrice(value: number) {
  if (!Number.isFinite(value)) return "-";
  if (value >= 1000) return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
  if (value >= 1) return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(value);
  if (value > 0 && value < 0.000001) return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 10 }).format(value);
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 }).format(value);
}

function formatAge(timestamp: number | null | undefined, now: number) {
  if (!timestamp || !now) return "en attente";
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  return seconds <= 1 ? "maintenant" : `il y a ${seconds}s`;
}

function pointVolatility(points: LiveMarketTick["points"] | undefined, fallback: number) {
  const prices = (points ?? []).map((point) => point.price).filter(Number.isFinite);
  if (prices.length < 2) return fallback;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const last = prices.at(-1) || 1;
  return Number((((max - min) / Math.max(last, 1)) * 100).toFixed(2));
}

function uniqueBySymbol<T extends { symbol: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeSymbol(item.symbol);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isOpportunity(asset: MarketAsset) {
  return asset.confidence >= 65 || asset.strength === "Fort" || asset.strength === "Très fort";
}

function FieldRows({ rows }: { rows: Array<[string, ReactNode]> }) {
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

function ChartAssetButton({ asset, active, onClick }: { asset: LiveMarketAsset; active: boolean; onClick: () => void }) {
  const liveTone = asset.liveDirection === "up" ? "success" : asset.liveDirection === "down" ? "danger" : "info";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:border-sky-400/70 hover:bg-sky-500/10",
        active ? "border-sky-400/80 bg-sky-500/16 shadow-[0_0_28px_rgba(14,165,233,.16)]" : asset.change24h >= 0 ? "border-emerald-500/20 bg-emerald-500/8" : "border-red-500/20 bg-red-500/8",
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate font-bold text-white" title={asset.symbol}>{asset.symbol}</span>
        {active ? <StatusBadge tone="info">chart actif</StatusBadge> : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <StatusBadge tone={asset.marketType === "perp" ? "ai" : "neutral"}>{asset.marketType ?? "spot"}</StatusBadge>
        <StatusBadge tone="neutral">{asset.exchangeName ?? "marché"}</StatusBadge>
        {asset.lastTickLabel ? <StatusBadge tone={liveTone}>{asset.lastTickLabel}</StatusBadge> : null}
      </div>
      <div className={cn("mt-2 font-mono text-2xl font-bold", asset.change24h >= 0 ? "text-emerald-300" : "text-red-300")}>{signed(asset.change24h, "%")}</div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-400">
        <span>{formatPrice(asset.price)}</span>
        <span>score {asset.confidence}</span>
      </div>
    </button>
  );
}

function AgentButton({ agent, pair, active, onClick }: { agent: Agent; pair: string; active: boolean; onClick: () => void }) {
  const allowed = agent.allowedPairs.some((allowedPair) => sameMarketPair(allowedPair, pair));
  const focused = sameMarketPair(agent.focus, pair);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border p-3 text-left transition hover:border-violet-400/60 hover:bg-violet-500/10",
        active ? "border-violet-400/80 bg-violet-500/16 shadow-[0_0_28px_rgba(139,92,246,.16)]" : "border-[#16314a] bg-white/[0.025]",
      )}
    >
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl border border-sky-400/30 bg-sky-500/10 text-2xl">{agent.avatar}</span>
        <span className="min-w-0">
          <span className="block truncate font-bold text-white">{agent.name}</span>
          <span className="block truncate text-xs text-slate-500">{agent.strategy}</span>
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <StatusBadge tone={agent.status === "active" ? "success" : agent.status === "paused" ? "warning" : "neutral"}>{agent.status}</StatusBadge>
        <StatusBadge tone={allowed ? "success" : "neutral"}>{allowed ? "paire autorisée" : "observation"}</StatusBadge>
        {focused ? <StatusBadge tone="ai">focus</StatusBadge> : null}
      </div>
    </button>
  );
}

function agentRiskPercent(agent: Agent, baseRisk: number) {
  const behaviorTilt = agent.behavior.aggressiveness / 280 - agent.behavior.prudence / 360;
  return Math.max(0.1, Math.min(1.25, Number((baseRisk * (1 + behaviorTilt)).toFixed(2))));
}

function buildIntent(agent: Agent, asset: MarketAsset | undefined, pair: string) {
  const allowed = agent.allowedPairs.some((allowedPair) => sameMarketPair(allowedPair, pair));
  const canExecute = agent.roles.includes("Exécuteur");

  if (agent.status !== "active") {
    return {
      tone: "warning" as const,
      label: "Agent en pause",
      detail: "Le chart reste consultable, mais aucun plan ne doit être proposé tant que l'agent est en pause.",
    };
  }

  if (!allowed) {
    return {
      tone: "neutral" as const,
      label: "Observation seule",
      detail: `${agent.name} peut analyser ${pair}, mais cette paire n'est pas dans ses permissions de trading.`,
    };
  }

  if (!canExecute) {
    return {
      tone: "info" as const,
      label: "Analyse sans exécution",
      detail: `${agent.name} peut scanner et analyser, puis transmettre le plan à un auditeur ou à la validation humaine.`,
    };
  }

  if ((asset?.confidence ?? 0) < 60) {
    return {
      tone: "warning" as const,
      label: "Attente",
      detail: "Le signal marché est trop faible pour proposer une entrée propre. Le moteur risque doit rester prioritaire.",
    };
  }

  return {
    tone: "success" as const,
    label: "Plan paper proposé",
    detail: `${agent.name} peut proposer entrée, stop-loss et take-profit en paper trading, puis attendre validation risque.`,
  };
}

export function MarketsWorkspace({ agents, marketAssets, priceSeries, trades, riskPercent, sourceStatus, metrics }: MarketsWorkspaceProps) {
  const liveTicks = useLiveMarketStore((state) => state.ticks);
  const liveTickCount = useLiveMarketStore((state) => state.tickCount);
  const liveTransport = useLiveMarketStore((state) => state.transport);
  const liveLastUpdate = useLiveMarketStore((state) => state.lastUpdate);
  const [nowMs, setNowMs] = useState(0);
  const initialPair = marketAssets.find((asset) => sameMarketPair(asset.symbol, agents[0]?.focus ?? ""))?.symbol ?? marketAssets[0]?.symbol ?? "BTC/USD";
  const [selectedPair, setSelectedPair] = useState(initialPair);
  const [selectedAgentId, setSelectedAgentId] = useState(agents.find((agent) => sameMarketPair(agent.focus, initialPair))?.id ?? agents[0]?.id ?? "");
  const [assetQuery, setAssetQuery] = useState("");
  const [marketScope, setMarketScope] = useState<MarketScope>("all");
  const [watchlistManageOpen, setWatchlistManageOpen] = useState(false);
  const [authorizationOverrides, setAuthorizationOverrides] = useState<Record<string, boolean>>({});
  const topUniversePairs = useMemo(() => marketAssets.slice(0, 10).map((asset) => asset.symbol), [marketAssets]);
  const botPairs = useMemo(() => uniqueBySymbol(
    agents
      .filter((agent) => agent.status === "active")
      .flatMap((agent) => [agent.focus, ...agent.allowedPairs].map((pair) => ({ symbol: pair }))),
  ).map((item) => item.symbol), [agents]);
  const trackedSymbols = useMemo(() => uniqueBySymbol([...topUniversePairs, ...botPairs, selectedPair].map((symbol) => ({ symbol }))).map((item) => item.symbol), [botPairs, selectedPair, topUniversePairs]);

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    useLiveMarketStore.getState().setTrackedSymbols(trackedSymbols);
    return () => useLiveMarketStore.getState().setTrackedSymbols(null);
  }, [trackedSymbols]);

  const liveMarketAssets = useMemo<LiveMarketAsset[]>(() => marketAssets.map((asset) => {
    const tick = liveTicks[normalizeSymbol(asset.symbol)];
    const authorized = authorizationOverrides[asset.symbol] ?? asset.authorized;
    if (!tick) return { ...asset, authorized };
    return {
      ...asset,
      authorized,
      price: tick.price,
      change24h: Number(tick.change24h.toFixed(2)),
      volatility: pointVolatility(tick.points, asset.volatility),
      signal: tick.direction === "up" ? "Achat surveillé" : tick.direction === "down" ? "Pression vendeuse" : asset.signal,
      lastTickAt: tick.eventTime,
      lastTickLabel: formatAge(tick.eventTime, nowMs),
      liveDirection: tick.direction,
      livePoints: tick.points,
    };
  }), [authorizationOverrides, liveTicks, marketAssets, nowMs]);
  const liveSortedAssets = useMemo(() => [...liveMarketAssets].sort((a, b) => (b.lastTickAt ?? 0) - (a.lastTickAt ?? 0) || Math.abs(b.change24h) - Math.abs(a.change24h)), [liveMarketAssets]);
  const selectedAssetCandidate = useMemo(() => liveMarketAssets.find((asset) => sameMarketPair(asset.symbol, selectedPair)), [liveMarketAssets, selectedPair]);
  const topUniverseAssets = useMemo(() => liveMarketAssets.filter((asset) => topUniversePairs.some((pair) => sameMarketPair(pair, asset.symbol))).slice(0, 10), [liveMarketAssets, topUniversePairs]);
  const botAssets = useMemo(() => liveMarketAssets.filter((asset) => botPairs.some((pair) => sameMarketPair(pair, asset.symbol))), [botPairs, liveMarketAssets]);
  const scopedBaseAssets = useMemo(() => {
    const scoped = marketScope === "agents"
      ? botAssets
      : marketScope === "authorized"
        ? liveMarketAssets.filter((asset) => asset.authorized)
        : marketScope === "opportunities"
          ? liveMarketAssets.filter(isOpportunity)
          : marketScope === "paper"
            ? liveMarketAssets.filter((asset) => asset.authorized && asset.confidence >= 55)
            : topUniverseAssets;

    return scoped.length ? scoped : topUniverseAssets;
  }, [botAssets, liveMarketAssets, marketScope, topUniverseAssets]);
  const cockpitAssets = useMemo(() => {
    const useful = selectedAssetCandidate ? [...scopedBaseAssets, selectedAssetCandidate] : scopedBaseAssets;
    return uniqueBySymbol(useful).slice(0, 10);
  }, [scopedBaseAssets, selectedAssetCandidate]);
  const recentLiveAssets = useMemo(() => cockpitAssets.filter((asset) => asset.lastTickAt && nowMs - asset.lastTickAt <= 15_000), [cockpitAssets, nowMs]);
  const positiveLiveAssets = useMemo(() => liveMarketAssets.filter((asset) => asset.change24h >= 0), [liveMarketAssets]);
  const topMover = useMemo(() => [...cockpitAssets].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))[0], [cockpitAssets]);
  const latestLiveAsset = recentLiveAssets[0] ?? liveSortedAssets[0];
  const livePositiveRatio = liveMarketAssets.length ? Math.round((positiveLiveAssets.length / liveMarketAssets.length) * 100) : 0;
  const avgLiveVolatility = liveMarketAssets.length ? liveMarketAssets.reduce((total, asset) => total + asset.volatility, 0) / liveMarketAssets.length : metrics.avgVolatility;
  const liveUpdateLabel = formatAge(liveLastUpdate, nowMs);
  const liveMetrics = useMemo(() => {
    const positiveAssets = liveMarketAssets.filter((asset) => asset.change24h >= 0);
    const opportunities = liveMarketAssets.filter((asset) => asset.confidence >= 65 || asset.strength === "Fort" || asset.strength === "Très fort");
    const primary = liveMarketAssets.find((asset) => asset.symbol === selectedPair) ?? liveMarketAssets[0];
    return {
      ...metrics,
      avgConfidence: liveMarketAssets.length ? Math.round(liveMarketAssets.reduce((total, asset) => total + asset.confidence, 0) / liveMarketAssets.length) : metrics.avgConfidence,
      avgVolatility: Number(avgLiveVolatility.toFixed(2)),
      authorizedPairs: liveMarketAssets.filter((asset) => asset.authorized).length,
      opportunities: opportunities.length,
      positiveRatio: liveMarketAssets.length ? Math.round((positiveAssets.length / liveMarketAssets.length) * 100) : metrics.positiveRatio,
      primaryChange: primary?.change24h ?? metrics.primaryChange,
      sentiment: (primary?.confidence ?? metrics.avgConfidence) >= 60 ? "POSITIF" : "PRUDENT",
      trendLabel: (primary?.change24h ?? metrics.primaryChange) >= 0 ? "HAUSSIER" : "BAISSIER",
    };
  }, [avgLiveVolatility, liveMarketAssets, metrics, selectedPair]);

  const selectedAsset = useMemo(() => liveMarketAssets.find((asset) => asset.symbol === selectedPair) ?? liveMarketAssets[0], [liveMarketAssets, selectedPair]);
  const selectedAgent = useMemo(() => agents.find((agent) => agent.id === selectedAgentId) ?? agents[0], [agents, selectedAgentId]);
  const selectedSymbol = normalizeSymbol(selectedPair);
  const compatibleAgents = useMemo(() => agents.filter((agent) => agent.allowedPairs.some((pair) => sameMarketPair(pair, selectedPair)) || sameMarketPair(agent.focus, selectedPair)), [agents, selectedPair]);
  const visibleAssets = useMemo(() => {
    const query = assetQuery.trim().toUpperCase();
    if (!query) return cockpitAssets;
    return liveMarketAssets.filter((asset) => [asset.symbol, asset.name, asset.exchangeSymbol, asset.baseAsset, asset.quoteAsset].some((value) => value?.toUpperCase().includes(query)));
  }, [assetQuery, cockpitAssets, liveMarketAssets]);
  const authorizationOverrideCount = Object.keys(authorizationOverrides).length;
  const scopedTrades = useMemo(
    () => trades.filter((trade) => trade.agentId === selectedAgent?.id && sameMarketPair(trade.asset, selectedPair)),
    [selectedAgent?.id, selectedPair, trades],
  );
  const currentRiskPercent = selectedAgent ? agentRiskPercent(selectedAgent, riskPercent) : riskPercent;
  const intent = selectedAgent ? buildIntent(selectedAgent, selectedAsset, selectedPair) : null;
  const allowedForAgent = Boolean(selectedAgent?.allowedPairs.some((pair) => sameMarketPair(pair, selectedPair)));
  const canExecute = Boolean(selectedAgent?.roles.includes("Exécuteur"));

  function selectPair(pair: string) {
    setSelectedPair(pair);
    const focusedAgent = agents.find((agent) => sameMarketPair(agent.focus, pair));
    if (focusedAgent) setSelectedAgentId(focusedAgent.id);
  }

  function toggleAuthorized(symbol: string) {
    setAuthorizationOverrides((current) => ({
      ...current,
      [symbol]: !(liveMarketAssets.find((asset) => asset.symbol === symbol)?.authorized ?? false),
    }));
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 rounded-2xl border border-[#16314a] bg-white/[0.03] p-3">
        {MARKET_SCOPE_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setMarketScope(option.id)}
            className={cn(
              "rounded-xl border px-3 py-2 text-left text-xs transition hover:border-sky-400/60 hover:text-sky-200",
              marketScope === option.id ? "border-sky-400/60 bg-sky-500/15 text-sky-100" : "border-slate-700 bg-slate-900/70 text-slate-300",
            )}
            title={option.hint}
          >
            <span className="block font-semibold">{option.label}</span>
            <span className="block text-[11px] text-slate-500">{option.hint}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-6 gap-4">
        <KpiCard label="Ticks reçus" value={`${liveTickCount}`} delta={`${liveTransport} · ${liveUpdateLabel}`} tone={liveTransport === "websocket" ? "success" : "warning"}><Sparkline data={latestLiveAsset?.livePoints ?? priceSeries.slice(-18)} color="#22c55e" /></KpiCard>
        <KpiCard label={`${liveMetrics.sourceLabel ?? "Marché"} live`} value={`${recentLiveAssets.length}`} delta={`${cockpitAssets.length} paires suivies`} tone={recentLiveAssets.length ? "info" : "warning"} />
        <KpiCard label="Dernier tick" value={latestLiveAsset?.symbol ?? "-"} delta={latestLiveAsset ? `${formatPrice(latestLiveAsset.price)} · ${latestLiveAsset.lastTickLabel ?? liveUpdateLabel}` : "en attente"} tone={latestLiveAsset?.change24h && latestLiveAsset.change24h >= 0 ? "success" : "danger"}><Sparkline data={latestLiveAsset?.livePoints ?? []} color={(latestLiveAsset?.change24h ?? 0) >= 0 ? "#22c55e" : "#ef4444"} /></KpiCard>
        <KpiCard label="Biais live" value={`${livePositiveRatio}%`} delta={`${positiveLiveAssets.length} verts / ${liveMarketAssets.length - positiveLiveAssets.length} rouges`} tone={livePositiveRatio >= 50 ? "success" : "danger"} />
        <KpiCard label="Volatilité live" value={formatPercent(liveMetrics.avgVolatility)} delta={topMover ? `${topMover.symbol} ${signed(topMover.change24h, "%")}` : "en attente"} tone="ai"><Sparkline data={topMover?.livePoints ?? priceSeries.slice(-18)} color="#d946ef" /></KpiCard>
        <KpiCard label="Marchés disponibles" value={`${liveMarketAssets.length}`} delta={`${trackedSymbols.length} branchés live`} tone="neutral" />
      </div>

      <div className="mt-4"><LiveMarketBoard limit={10} symbols={trackedSymbols} /></div>

      <GlassCard className="mt-4" glow>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-lg font-bold text-white"><MousePointer2 className="size-5 text-sky-300" /> Sélection du marché et de l'agent<InfoHint content="Choisis d'abord le chart à afficher, puis l'agent dont tu veux voir le positionnement, les permissions et le plan." /></div>
          </div>
          <StatusBadge tone={sourceStatus === "connected" ? "success" : "warning"}><Radio className="size-3" /> Source marché {sourceStatus}</StatusBadge>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-bold text-white"><BarChart3 className="size-4 text-sky-300" /> 1. Chart à afficher</div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-xl border border-[#16314a] bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
                  <Search className="size-3.5 text-sky-300" />
                  <input
                    value={assetQuery}
                    onChange={(event) => setAssetQuery(event.target.value)}
                    placeholder="Token"
                    className="w-28 bg-transparent font-mono text-slate-100 outline-none placeholder:text-slate-600"
                  />
                </div>
              <StatusBadge tone="info">{visibleAssets.length}/{assetQuery.trim() ? liveMarketAssets.length : cockpitAssets.length}</StatusBadge>
              </div>
            </div>
            <div className="grid max-h-[360px] grid-cols-2 gap-2 overflow-y-auto pr-1 md:grid-cols-4 xl:grid-cols-5">
              {visibleAssets.length ? visibleAssets.map((asset) => (
                <ChartAssetButton key={asset.symbol} asset={asset} active={asset.symbol === selectedPair} onClick={() => selectPair(asset.symbol)} />
              )) : (
                <div className="col-span-full rounded-2xl border border-[#16314a] bg-slate-950/40 p-4 text-sm text-slate-400">Aucune paire ne correspond à ce filtre.</div>
              )}
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-bold text-white"><Bot className="size-4 text-violet-300" /> 2. Agent à superposer</div>
              <StatusBadge tone={compatibleAgents.length ? "success" : "neutral"}>{compatibleAgents.length} compatibles</StatusBadge>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {agents.map((agent) => (
                <AgentButton key={agent.id} agent={agent} pair={selectedPair} active={agent.id === selectedAgent?.id} onClick={() => setSelectedAgentId(agent.id)} />
              ))}
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="mt-4 grid grid-cols-[1fr_1fr_0.75fr] gap-4">
        <GlassCard>
            <div className="mb-4 flex items-center justify-between">
            <div className="font-bold text-white">Top 10 tradé par les agents</div>
            <StatusBadge tone="info">tri live</StatusBadge>
            </div>
          <div className="grid grid-cols-4 gap-2">
            {cockpitAssets.slice(0, 10).map((asset) => (
              <ChartAssetButton key={asset.symbol} asset={asset} active={asset.symbol === selectedPair} onClick={() => selectPair(asset.symbol)} />
            ))}
          </div>
        </GlassCard>

        <GlassCard>
          <div className="mb-4 flex items-center justify-between">
            <div className="font-bold text-white">Watchlist Top 10</div>
            <Button onClick={() => setWatchlistManageOpen((open) => !open)} variant={watchlistManageOpen ? "ai" : "ghost"} size="sm">Gérer</Button>
          </div>
          {watchlistManageOpen ? (
            <div className="mb-3 rounded-2xl border border-sky-400/20 bg-sky-500/8 p-3 text-sm text-slate-300">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone="info">autorisation locale</StatusBadge>
                  <span>{authorizationOverrideCount} modification(s) de session</span>
                </div>
                <Button disabled={!authorizationOverrideCount} onClick={() => setAuthorizationOverrides({})} size="sm" variant="ghost">Réinitialiser</Button>
              </div>
            </div>
          ) : null}
          <div className="overflow-hidden rounded-2xl border border-[#16314a]">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-slate-400">
                <tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Paire</th><th className="px-4 py-3">Prix</th><th className="px-4 py-3">Var.</th><th className="px-4 py-3">Session</th></tr>
              </thead>
              <tbody className="divide-y divide-[#16314a] text-slate-300">
                {cockpitAssets.slice(0, 10).map((asset, index) => (
                  <tr key={asset.symbol} className={cn("transition hover:bg-sky-500/[0.04]", asset.symbol === selectedPair && "bg-sky-500/10")}>
                    <td className="px-4 py-3 font-mono text-slate-500">{index + 1}</td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => selectPair(asset.symbol)} className="font-bold text-white hover:text-sky-200">{asset.symbol}</button>
                    </td>
                    <td className="px-4 py-3 font-mono">{formatPrice(asset.price)}</td>
                    <td className={cn("px-4 py-3 font-mono", asset.change24h >= 0 ? "text-emerald-300" : "text-red-300")}>{signed(asset.change24h, "%")}</td>
                    <td className="px-4 py-3"><TogglePill active={asset.authorized} onClick={() => toggleAuthorized(asset.symbol)} title="Autorisation locale pour la session" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="mb-4 flex items-center gap-2 font-bold text-white"><Activity className="size-5 text-sky-300" /> Contrôle flux live</div>
          <FieldRows rows={[
            ["Transport", <StatusBadge key="transport" tone={liveTransport === "websocket" ? "success" : "warning"}>{liveTransport}</StatusBadge>],
            ["Dernière maj", liveUpdateLabel],
            ["Ticks reçus", liveTickCount],
            ["Actifs frais", `${recentLiveAssets.length}/${cockpitAssets.length}`],
            ["Dernier actif", latestLiveAsset?.symbol ?? "-"],
            ["Paires bots", `${botAssets.length}`],
            ["Source", `${liveMetrics.sourceLabel ?? "dYdX"} · ${liveMetrics.marketType ?? "perp"}`],
          ]} />
        </GlassCard>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_380px] gap-4">
        <TradingDeskChart
          symbol={selectedSymbol}
          trades={scopedTrades}
          riskPercent={currentRiskPercent}
          title={`${selectedPair} · overlay ${selectedAgent?.name ?? "agent"} · niveaux entrée / stop / TP`}
          agentName={selectedAgent?.name}
          agentStrategy={selectedAgent?.strategy}
          agentMode={selectedAgent?.mode}
        />

        <div className="space-y-4">
          <PaperTradingRuntimePanel selectedAgentId={selectedAgent?.id} selectedAgentName={selectedAgent?.name} selectedPair={selectedPair} />

          <GlassCard glow>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-bold text-white"><Target className="size-5 text-violet-300" /> Positionnement agent</div>
              {intent ? <StatusBadge tone={intent.tone}>{intent.label}</StatusBadge> : null}
              {intent?.detail ? <InfoHint content={intent.detail} /> : null}
            </div>
            <div className="flex items-start gap-3">
              <div className="grid size-16 place-items-center rounded-2xl border border-sky-400/30 bg-sky-500/10 text-4xl">{selectedAgent?.avatar}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xl font-bold text-white">{selectedAgent?.name}</div>
                <div className="text-sm text-slate-400">{selectedAgent?.strategy} · focus {selectedAgent?.focus}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">{selectedAgent?.roles.map((role) => <StatusBadge key={role} tone={role === "Exécuteur" ? "success" : "ai"}>{role}</StatusBadge>)}</div>
              </div>
            </div>
            <FieldRows rows={[
              ["Paire du chart", <span key="pair" className="font-mono text-sky-200">{selectedPair}</span>],
              ["Permission agent", allowedForAgent ? <StatusBadge key="ok" tone="success">autorisée</StatusBadge> : <StatusBadge key="no" tone="neutral"><Lock className="size-3" /> non autorisée</StatusBadge>],
              ["Exécution", canExecute ? <StatusBadge key="exec" tone="success">paper possible</StatusBadge> : <StatusBadge key="audit" tone="info">audit / analyse</StatusBadge>],
              ["Risque agent", <span key="risk" className="font-mono text-amber-200">{currentRiskPercent}% / trade</span>],
              ["Confiance marché", <span key="confidence" className="font-mono text-white">{selectedAsset?.confidence ?? 0}/100</span>],
            ]} />
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm text-slate-300"><span>Prudence</span><span className="font-mono text-white">{selectedAgent?.behavior.prudence}%</span></div>
              <ProgressBar value={selectedAgent?.behavior.prudence ?? 0} tone="success" />
              <div className="flex justify-between text-sm text-slate-300"><span>Fréquence</span><span className="font-mono text-white">{selectedAgent?.behavior.frequency}%</span></div>
              <ProgressBar value={selectedAgent?.behavior.frequency ?? 0} tone="ai" />
            </div>
          </GlassCard>

          <GlassCard>
            <div className="mb-4 flex items-center gap-2 font-bold text-white"><BrainCircuit className="size-5 text-violet-300" /> Ce que l'agent regarde</div>
            <Timeline items={[
              { title: `${selectedPair} · ${selectedAsset?.signal ?? "Signal en attente"}`, detail: `Score marché ${selectedAsset?.confidence ?? 0}/100 · volatilité ${formatPercent(selectedAsset?.volatility ?? 0)}`, tone: (selectedAsset?.confidence ?? 0) >= 65 ? "success" : "warning" },
              { title: `Rôle actif : ${canExecute ? "analyse + exécution paper" : "analyse / audit"}`, detail: selectedAgent?.roles.join(" → "), tone: canExecute ? "success" : "info" },
              { title: "Moteur de risque déterministe", detail: "Aucun ordre réel. Stop-loss obligatoire, levier bloqué, validation risque avant toute proposition.", tone: "warning" },
              { title: `${scopedTrades.length} décision(s) journalisée(s) sur ce couple agent/paire`, detail: scopedTrades[0]?.initialReason ?? "Aucune décision réelle journalisée pour cette combinaison.", tone: scopedTrades.length ? "success" : "neutral" },
            ]} />
          </GlassCard>

          <GlassCard>
            <div className="mb-4 flex items-center gap-2 font-bold text-white"><ShieldCheck className="size-5 text-emerald-300" /> Régime de marché sélectionné</div>
            <div className="grid grid-cols-[110px_1fr] gap-4">
              <MetricGauge value={selectedAsset?.confidence ?? metrics.avgConfidence} label="Score" tone={(selectedAsset?.change24h ?? 0) >= 0 ? "success" : "warning"} />
              <div>
                <LiveMiniChart symbol={selectedSymbol} />
              </div>
            </div>
            <FieldRows rows={[
              ["Tendance", selectedAsset?.change24h && selectedAsset.change24h >= 0 ? "HAUSSIER" : "BAISSIER"],
              ["Volatilité", (selectedAsset?.volatility ?? 0) > 5 ? "Élevée" : "Neutre"],
              ["Volume 24h", selectedAsset?.volume24h ?? "-"],
              ["Source", sourceStatus],
            ]} />
          </GlassCard>

          <GlassCard>
            <div className="mb-4 flex items-center gap-2 font-bold text-white"><SlidersHorizontal className="size-5 text-sky-300" /> Top opportunités liées</div>
            <Timeline items={cockpitAssets.slice(0, 5).map((asset) => ({ title: `${asset.symbol} · ${asset.signal}`, detail: `Score ${asset.confidence} · ${asset.strength}`, tone: asset.strength === "Très fort" || asset.strength === "Fort" ? "success" : "warning" }))} />
          </GlassCard>

          <GlassCard className="border-amber-500/25 bg-amber-500/[0.04]">
            <div className="flex items-center gap-3 text-sm leading-relaxed text-amber-100/85">
              <Zap className="mt-0.5 size-5 shrink-0 text-amber-300" />
              <span className="font-semibold">Flux public supervisé</span>
              <InfoHint content="Les prix/chandeliers viennent du flux marché public. Le positionnement agent affiche une proposition supervisée et remplaçable par un moteur de stratégie réel, mais n'exécute aucun ordre live." />
            </div>
          </GlassCard>
        </div>
      </div>
    </>
  );
}
