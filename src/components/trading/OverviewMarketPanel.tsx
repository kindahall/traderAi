"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Activity, ChevronDown, LineChart } from "lucide-react";
import type { MarketAsset, Trade } from "@/types/trading";
import { formatPercent } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DataTable, GlassCard, InfoHint, ProgressBar, StatusBadge } from "@/components/ui/dashboard";
import { LiveMiniChart } from "@/components/live/LiveMarket";
import { TradingDeskChart } from "@/components/trading/TradingDeskChart";

function compactSymbol(symbol: string) {
  return symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function canonicalSymbol(symbol: string) {
  return compactSymbol(symbol).replace(/USDT$/, "USD").replace(/USDC$/, "USD");
}

function sameMarketPair(left: string, right: string) {
  return canonicalSymbol(left) === canonicalSymbol(right);
}

function formatPrice(value: number | undefined) {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: Number(value) >= 1000 ? 2 : 6 }).format(Number(value));
}

function CardHeader({ title, icon, action, hint }: { title: string; icon?: ReactNode; action?: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2 text-base font-bold text-white">
        {icon ? <span className="text-sky-300">{icon}</span> : null}
        <span className="truncate">{title}</span>
        {hint ? <InfoHint content={hint} /> : null}
      </div>
      {action}
    </div>
  );
}

function MarketSelector({
  assets,
  selectedSymbol,
  onSelect,
}: {
  assets: MarketAsset[];
  selectedSymbol: string;
  onSelect: (symbol: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative">
        <select
          aria-label="Sélectionner une crypto"
          className="h-9 min-w-44 appearance-none rounded-xl border border-sky-400/35 bg-slate-950/70 py-1.5 pl-3 pr-9 text-sm font-semibold text-sky-100 outline-none transition hover:border-sky-300 focus:border-sky-200"
          value={selectedSymbol}
          onChange={(event) => onSelect(event.target.value)}
        >
          {assets.map((asset) => (
            <option key={asset.symbol} value={asset.symbol}>{asset.symbol}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-sky-200" />
      </label>
      <Link href="/markets"><Button size="sm" variant="ghost">Gérer</Button></Link>
    </div>
  );
}

export function OverviewMarketPanel({
  marketAssets,
  trades,
  initialSymbol,
  riskPercent,
  latestTrade,
}: {
  marketAssets: MarketAsset[];
  trades: Trade[];
  initialSymbol: string;
  riskPercent: number;
  latestTrade?: Trade;
}) {
  const selectableAssets = useMemo(() => {
    const authorized = marketAssets.filter((asset) => asset.authorized);
    return authorized.length ? authorized : marketAssets;
  }, [marketAssets]);
  const fallbackSymbol = selectableAssets[0]?.symbol ?? initialSymbol;
  const [selectedSymbol, setSelectedSymbol] = useState(() => selectableAssets.find((asset) => sameMarketPair(asset.symbol, initialSymbol))?.symbol ?? fallbackSymbol);
  const selectedAsset = selectableAssets.find((asset) => sameMarketPair(asset.symbol, selectedSymbol)) ?? selectableAssets[0];
  const selectedTrade = trades.find((trade) => sameMarketPair(trade.asset, selectedSymbol));
  const replayTrade = selectedTrade ?? latestTrade;
  const miniSymbols = useMemo(() => {
    const selected = selectedAsset?.symbol ?? selectedSymbol;
    return [
      selected,
      ...selectableAssets
        .filter((asset) => !sameMarketPair(asset.symbol, selected))
        .sort((a, b) => Number(b.authorized) - Number(a.authorized) || b.confidence - a.confidence)
        .map((asset) => asset.symbol),
    ].slice(0, 3);
  }, [selectableAssets, selectedAsset?.symbol, selectedSymbol]);

  if (!selectableAssets.length) {
    return (
      <div className="grid gap-4 xl:grid-cols-[1.55fr_0.85fr]">
        <GlassCard>
          <CardHeader icon={<LineChart />} title="Marché" />
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/8 p-4 text-sm text-amber-100">Aucun marché disponible dans le runtime.</div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.55fr_0.85fr]">
      <GlassCard>
        <CardHeader
          icon={<LineChart />}
          title={`Marché live · ${selectedSymbol}`}
          action={<MarketSelector assets={selectableAssets} selectedSymbol={selectedSymbol} onSelect={setSelectedSymbol} />}
        />
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <StatusBadge tone={(selectedAsset?.change24h ?? 0) >= 0 ? "success" : "danger"}>{selectedAsset?.signal ?? "Flux marché"}</StatusBadge>
          <StatusBadge tone="info">Prix {formatPrice(selectedAsset?.price)}</StatusBadge>
          <StatusBadge tone="warning">Volatilité {formatPercent(selectedAsset?.volatility ?? 0)}</StatusBadge>
          {selectedTrade ? (
            <>
              <StatusBadge tone="danger">Stop-loss {formatPrice(selectedTrade.stopLoss)}</StatusBadge>
              <StatusBadge tone="success">TP {formatPrice(selectedTrade.takeProfit)}</StatusBadge>
            </>
          ) : (
            <StatusBadge tone="neutral">Aucun plan journalisé</StatusBadge>
          )}
          <Link className="ml-auto" href={replayTrade ? `/decision-replay?trade=${encodeURIComponent(replayTrade.id)}` : `/decision-replay?market=${encodeURIComponent(selectedSymbol)}`}>
            <Button size="sm" variant="ghost">Replay</Button>
          </Link>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {selectableAssets.slice(0, 10).map((asset) => (
            <button
              key={asset.symbol}
              type="button"
              onClick={() => setSelectedSymbol(asset.symbol)}
              className={cn(
                "rounded-xl border px-3 py-2 text-left text-xs font-semibold transition",
                sameMarketPair(asset.symbol, selectedSymbol)
                  ? "border-sky-300/70 bg-sky-500/20 text-sky-100"
                  : "border-[#16314a] bg-white/[0.03] text-slate-300 hover:border-sky-400/45 hover:text-sky-100",
              )}
            >
              <span className="block">{asset.symbol}</span>
              <span className={asset.change24h >= 0 ? "font-mono text-emerald-300" : "font-mono text-red-300"}>{formatPercent(asset.change24h)}</span>
            </button>
          ))}
        </div>
        <div className="mb-3 grid gap-3 md:grid-cols-3">{miniSymbols.map((symbol) => <LiveMiniChart key={symbol} symbol={symbol} />)}</div>
        <TradingDeskChart key={selectedSymbol} symbol={selectedSymbol} trades={trades} riskPercent={riskPercent} title={`${selectedSymbol} · chandeliers live & décisions agent`} />
      </GlassCard>
      <GlassCard>
        <CardHeader icon={<Activity />} title="Actifs autorisés" action={<Link href="/markets"><Button size="sm" variant="ghost">Gérer</Button></Link>} />
        <DataTable
          headers={["Actif", "Volatilité", "Confiance", "Statut"]}
          rows={selectableAssets.slice(0, 8).map((asset) => [
            <button key={`${asset.symbol}-select`} type="button" onClick={() => setSelectedSymbol(asset.symbol)} className={cn("font-semibold transition hover:text-sky-200", sameMarketPair(asset.symbol, selectedSymbol) ? "text-sky-200" : "text-white")}>{asset.symbol}</button>,
            formatPercent(asset.volatility),
            <ProgressBar key={asset.symbol} value={asset.confidence} tone="success" />,
            <StatusBadge key={`${asset.symbol}-status`} tone={asset.authorized ? "success" : "neutral"}>{sameMarketPair(asset.symbol, selectedSymbol) ? "Sélectionné" : asset.authorized ? "Autorisé" : "Bloqué"}</StatusBadge>,
          ])}
        />
      </GlassCard>
    </div>
  );
}
