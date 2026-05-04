"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Radio, Zap } from "lucide-react";
import { Sparkline } from "@/components/charts/charts";
import { GlassCard, ProgressBar, StatusBadge } from "@/components/ui/dashboard";
import { useLiveMarketStore, type LiveMarketTick } from "@/lib/live-market-store";
import { cn } from "@/lib/utils";

function formatPrice(value: number) {
  if (value >= 1000) return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
  if (value >= 1) return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(value);
  if (value > 0 && value < 0.000001) return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 10 }).format(value);
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 }).format(value);
}

function formatSigned(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)}%`;
}

function compactSymbol(symbol: string) {
  return symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function canonicalSymbol(symbol: string) {
  return compactSymbol(symbol).replace(/USDT$/, "USD").replace(/USDC$/, "USD");
}

function useRelativeTime(timestamp: number | null) {
  const [now, setNow] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!timestamp) return "en attente";
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  return seconds <= 1 ? "maintenant" : `il y a ${seconds}s`;
}

function useAgeMs(timestamp: number | null) {
  const [now, setNow] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!timestamp) return Number.POSITIVE_INFINITY;
  return now ? Math.max(0, now - timestamp) : 0;
}

export function LiveMarketConnector() {
  useEffect(() => {
    useLiveMarketStore.getState().connect();
    return () => {
      useLiveMarketStore.getState().disconnect();
    };
  }, []);

  return null;
}

export function LiveConnectionBadge({ compact = false }: { compact?: boolean }) {
  const connected = useLiveMarketStore((state) => state.connected);
  const connecting = useLiveMarketStore((state) => state.connecting);
  const transport = useLiveMarketStore((state) => state.transport);
  const tickCount = useLiveMarketStore((state) => state.tickCount);
  const lastUpdate = useLiveMarketStore((state) => state.lastUpdate);
  const relative = useRelativeTime(lastUpdate);
  const active = connected || (transport === "polling" && Boolean(lastUpdate));
  const compactLabel = connecting && !active ? "connexion" : active ? transport : transport === "idle" ? "connexion" : transport;
  const fullLabel = active
      ? `Live ${transport}`
      : connecting
        ? "Connexion au flux..."
      : transport === "idle"
        ? "Connexion au flux..."
        : `Fallback ${transport}`;

  return (
    <div data-testid={compact ? "live-connection-compact" : "live-connection"} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-xs", active ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200")}>
      <span className={cn("relative flex size-2.5", active && "animate-pulse")}>
        <span className={cn("absolute inline-flex size-full rounded-full opacity-70", active ? "bg-emerald-400" : "bg-amber-400")} />
        <span className={cn("relative inline-flex size-2.5 rounded-full", active ? "bg-emerald-300" : "bg-amber-300")} />
      </span>
      {compact ? <span>{compactLabel}</span> : <span>{fullLabel} · {tickCount} ticks · {relative}</span>}
    </div>
  );
}

export function LiveTickerTape() {
  const ticksRecord = useLiveMarketStore((state) => state.ticks);
  const transport = useLiveMarketStore((state) => state.transport);
  const lastUpdate = useLiveMarketStore((state) => state.lastUpdate);
  const relative = useRelativeTime(lastUpdate);
  const ticks = useMemo(() => Object.values(ticksRecord).sort((a, b) => (b.eventTime - a.eventTime) || b.volume - a.volume), [ticksRecord]);

  if (!ticks.length) {
    return (
      <div data-testid="live-ticker-tape" className="mt-2 flex items-center gap-2 overflow-hidden rounded-2xl border border-[#16314a] bg-slate-950/40 px-3 py-2 text-xs text-slate-500">
        <Radio className="size-3.5 text-amber-300" />
        Connexion au flux marché public...
      </div>
    );
  }

  const repeated = [...ticks, ...ticks];

  return (
    <div data-testid="live-ticker-tape" className="mt-2 grid grid-cols-[170px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-[#16314a] bg-slate-950/45 text-xs">
      <div className="z-10 flex items-center gap-2 border-r border-[#16314a] bg-slate-950/90 px-3 py-2 text-slate-300">
        <Radio className="size-3.5 animate-pulse text-emerald-300" />
        <span className="font-mono">{transport}</span>
        <span className="text-slate-500">{relative}</span>
      </div>
      <div className="min-w-0 overflow-hidden py-2">
        <div className="flex w-max animate-[ticker_480s_linear_infinite] items-center gap-3 px-3 hover:[animation-play-state:paused]">
          {repeated.map((tick, index) => (
            <div key={`${tick.symbol}-${index}`} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-1.5 font-mono">
              <span className="text-slate-300">{tick.pair}</span>
              <span className={tick.direction === "down" ? "text-red-300" : tick.direction === "up" ? "text-emerald-300" : "text-sky-200"}>{formatPrice(tick.price)}</span>
              <span className={tick.change24h >= 0 ? "text-emerald-300" : "text-red-300"}>{formatSigned(tick.change24h)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LiveTickRow({ tick }: { tick: LiveMarketTick }) {
  const relative = useRelativeTime(tick.eventTime);
  const fresh = useAgeMs(tick.eventTime) < 4_000;

  return (
    <div className={cn(
      "grid grid-cols-[96px_1fr_92px] items-center gap-3 rounded-xl border px-3 py-2 transition-all duration-300",
      tick.direction === "up" ? "border-emerald-500/20 bg-emerald-500/8" : tick.direction === "down" ? "border-red-500/20 bg-red-500/8" : "border-[#16314a] bg-white/[0.03]",
      fresh && "border-sky-300/60 shadow-[0_0_22px_rgba(56,189,248,0.14)]",
    )}>
      <div>
        <div className="font-bold text-white">{tick.pair}</div>
        <div className="text-[10px] uppercase tracking-wide text-slate-500">{relative}</div>
      </div>
      <div>
        <div className={cn("font-mono text-lg font-bold", tick.direction === "down" ? "text-red-300" : "text-emerald-300")}>{formatPrice(tick.price)}</div>
        <Sparkline data={tick.points} color={tick.change24h >= 0 ? "#22c55e" : "#ef4444"} />
      </div>
      <div className="text-right">
        <div className={cn("font-mono text-sm font-bold", tick.change24h >= 0 ? "text-emerald-300" : "text-red-300")}>{formatSigned(tick.change24h)}</div>
        <div className={cn("mt-1 text-[10px] uppercase tracking-wide", fresh ? "text-sky-200" : "text-slate-600")}>tick</div>
      </div>
    </div>
  );
}

export function LiveMarketBoard({ limit = 6, symbols }: { limit?: number; symbols?: string[] }) {
  const ticksRecord = useLiveMarketStore((state) => state.ticks);
  const tickCount = useLiveMarketStore((state) => state.tickCount);
  const tracked = useMemo(() => new Set((symbols ?? []).map(canonicalSymbol)), [symbols]);
  const ticks = useMemo(() => Object.values(ticksRecord)
    .filter((tick) => !tracked.size || tracked.has(canonicalSymbol(tick.symbol)))
    .sort((a, b) => (b.eventTime - a.eventTime) || b.volume - a.volume)
    .slice(0, limit), [limit, ticksRecord, tracked]);
  const transport = useLiveMarketStore((state) => state.transport);
  const lastUpdate = useLiveMarketStore((state) => state.lastUpdate);
  const relative = useRelativeTime(lastUpdate);

  return (
    <div data-testid="live-market-board">
      <GlassCard glow>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-bold text-white"><Activity className="size-5 text-sky-300" /> Derniers ticks live</div>
        <StatusBadge tone={transport === "polling" ? "warning" : "success"}>{transport} · {tickCount} · {relative}</StatusBadge>
      </div>
      <div className="space-y-2">
        {ticks.length ? ticks.map((tick) => <LiveTickRow key={tick.symbol} tick={tick} />) : <div className="rounded-xl border border-[#16314a] bg-white/[0.03] p-4 text-sm text-slate-500">Connexion au flux public...</div>}
      </div>
      </GlassCard>
    </div>
  );
}

export function LiveMiniChart({ symbol = "BTCUSDT" }: { symbol?: string }) {
  const tick = useLiveMarketStore((state) => {
    const compact = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return state.ticks[compact] ?? state.ticks[compact.replace(/USDT$/, "USD")] ?? state.ticks[compact.replace(/USD$/, "USDT")];
  });

  return (
    <div data-testid={`live-mini-chart-${symbol.toUpperCase()}`} className="rounded-2xl border border-[#16314a] bg-slate-950/35 p-3">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-bold text-white">{tick?.pair ?? symbol}</span>
        <span className={tick && tick.change24h >= 0 ? "font-mono text-emerald-300" : "font-mono text-red-300"}>{tick ? formatSigned(tick.change24h) : "..."}</span>
      </div>
      <div data-testid={`live-mini-price-${symbol.toUpperCase()}`} className="font-mono text-2xl font-bold text-sky-100">{tick ? formatPrice(tick.price) : "Connexion..."}</div>
      <Sparkline data={tick?.points ?? []} color={tick && tick.change24h < 0 ? "#ef4444" : "#22c55e"} />
    </div>
  );
}

export function LivePagePulse() {
  const ticksRecord = useLiveMarketStore((state) => state.ticks);
  const ticks = useMemo(() => Object.values(ticksRecord).sort((a, b) => (b.eventTime - a.eventTime) || b.volume - a.volume), [ticksRecord]);
  const connected = useLiveMarketStore((state) => state.connected);
  const transport = useLiveMarketStore((state) => state.transport);
  const lastUpdate = useLiveMarketStore((state) => state.lastUpdate);
  const relative = useRelativeTime(lastUpdate);
  const active = connected || (transport === "polling" && Boolean(lastUpdate));
  const featured = useMemo(() => ticks.slice(0, 3), [ticks]);

  return (
    <div data-testid="live-page-pulse" className="mt-3 grid grid-cols-[240px_1fr] gap-3">
      <div className="flex items-center gap-2 rounded-2xl border border-[#16314a] bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
        <Radio className={cn("size-4", active ? "animate-pulse text-emerald-300" : "text-amber-300")} />
        <span>{active ? "Flux live" : lastUpdate ? "Snapshot live" : "Connexion flux"}</span>
        <span className="font-mono text-slate-500">{transport} · {relative}</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, index) => {
          const tick = featured[index];
          return (
          <div key={tick?.symbol ?? index} className="rounded-2xl border border-[#16314a] bg-slate-950/40 px-3 py-2">
            <div className="flex items-center justify-between text-xs text-slate-500"><span>{tick?.pair ?? ["BTC/USD", "ETH/USD", "SOL/USD"][index]}</span><Zap className="size-3 text-sky-300" /></div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="font-mono text-lg font-bold text-white">{tick ? formatPrice(tick.price) : "..."}</span>
              <span className={tick && tick.change24h >= 0 ? "font-mono text-xs text-emerald-300" : "font-mono text-xs text-red-300"}>{tick ? formatSigned(tick.change24h) : "..."}</span>
            </div>
            <ProgressBar value={Math.min(100, Math.abs(tick?.change24h ?? 0) * 12 + 18)} tone={tick && tick.change24h < 0 ? "danger" : "success"} />
          </div>
          );
        })}
      </div>
    </div>
  );
}
