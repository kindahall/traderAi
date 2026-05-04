"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { DollarSign, Gauge, Save, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard, StatusBadge, TogglePill } from "@/components/ui/dashboard";
import { cn } from "@/lib/utils";

type TradingSizingMode = "equity_percent" | "fixed_usd";

type PaperAllocation = {
  enabled: boolean;
  capitalUsd: number;
  sizingMode: TradingSizingMode;
  tradeAmountPercent: number;
  tradeAmountUsd: number;
  riskPerTradePercent: number;
  leverage: number;
  maxOpenPositions: number;
  maxPortfolioExposurePercent: number;
  dailyLossLimitPercent: number;
  weeklyLossLimitPercent: number;
};

type LiveAllocation = {
  enabled: boolean;
  sizingMode: TradingSizingMode;
  tradeAmountPercent: number;
  tradeAmountUsd: number;
  riskPerTradePercent: number;
  leverage: number;
  maxPortfolioExposurePercent: number;
  maxDailyLossPercent: number;
  requireHumanValidation: boolean;
};

type TradingAllocationConfig = {
  version: 1;
  updatedAt: string;
  paper: PaperAllocation;
  live: LiveAllocation;
  source: "file" | "env" | "defaults";
};

type PaperStateSummary = {
  capitalUsd: number;
  equityUsd: number;
  openPositions: number;
  closedPositions: number;
};

type AllocationPayload = {
  ok: boolean;
  config?: TradingAllocationConfig;
  paperState?: PaperStateSummary;
  error?: string;
};

const moneyFormatter = new Intl.NumberFormat("fr-FR", {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency",
});

function formatUsd(value: number) {
  return moneyFormatter.format(value);
}

function paperNotionalPreview(allocation: PaperAllocation, paperState: PaperStateSummary | null) {
  const equityUsd = Math.max(1, paperState?.equityUsd ?? allocation.capitalUsd);
  const base = allocation.sizingMode === "fixed_usd" ? allocation.tradeAmountUsd : equityUsd * allocation.tradeAmountPercent / 100;
  return base * allocation.leverage;
}

function liveNotionalPreview(allocation: LiveAllocation) {
  const base = allocation.sizingMode === "fixed_usd" ? allocation.tradeAmountUsd : allocation.tradeAmountPercent;
  return allocation.sizingMode === "fixed_usd" ? base * allocation.leverage : base * allocation.leverage;
}

export function TradingAllocationPanel() {
  const router = useRouter();
  const [config, setConfig] = useState<TradingAllocationConfig | null>(null);
  const [paperState, setPaperState] = useState<PaperStateSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Chargement allocation...");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/trading/allocation", { cache: "no-store" });
      const payload = await response.json() as AllocationPayload;
      if (!payload.ok || !payload.config) throw new Error(payload.error || `HTTP ${response.status}`);
      setConfig(payload.config);
      setPaperState(payload.paperState ?? null);
      setMessage("Allocation chargée");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Allocation indisponible");
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    window.queueMicrotask(() => {
      if (mounted) void load();
    });
    return () => {
      mounted = false;
    };
  }, [load]);

  const paperNotional = useMemo(() => config ? paperNotionalPreview(config.paper, paperState) : 0, [config, paperState]);
  const livePreview = useMemo(() => config ? liveNotionalPreview(config.live) : 0, [config]);

  function updatePaper<K extends keyof PaperAllocation>(key: K, value: PaperAllocation[K]) {
    setConfig((current) => current ? { ...current, paper: { ...current.paper, [key]: value } } : current);
  }

  function updateLive<K extends keyof LiveAllocation>(key: K, value: LiveAllocation[K]) {
    setConfig((current) => current ? { ...current, live: { ...current.live, [key]: value } } : current);
  }

  async function save() {
    if (!config) return;
    setBusy(true);
    setMessage("Enregistrement...");

    try {
      const response = await fetch("/api/trading/allocation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paper: config.paper, live: config.live }),
      });
      const payload = await response.json() as AllocationPayload;
      if (!payload.ok || !payload.config) throw new Error(payload.error || `HTTP ${response.status}`);
      setConfig(payload.config);
      setPaperState(payload.paperState ?? null);
      setMessage("Allocation appliquée au runtime paper");
      window.dispatchEvent(new Event("system-integrity-refresh"));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  }

  if (!config) {
    return (
      <GlassCard glow>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-bold text-white">
            <DollarSign className="size-5 text-emerald-300" />
            Capital & allocation
          </div>
          <StatusBadge tone="warning">{message}</StatusBadge>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard glow>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-bold text-white">
          <DollarSign className="size-5 text-emerald-300" />
          Capital & allocation
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={config.paper.enabled ? "success" : "warning"}>{config.paper.enabled ? "paper actif" : "paper coupé"}</StatusBadge>
          <StatusBadge tone={config.source === "file" ? "success" : "neutral"}>{config.source}</StatusBadge>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 lg:divide-x lg:divide-[#16314a]">
        <section className="space-y-4">
          <AllocationHeader
            active={config.paper.enabled}
            icon={<ShieldAlert className="size-4" />}
            onToggle={() => updatePaper("enabled", !config.paper.enabled)}
            title="Paper trading"
          />
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <NumberField label="Capital paper" min={100} onChange={(value) => updatePaper("capitalUsd", value)} prefix="$" step={100} value={config.paper.capitalUsd} />
            <NumberField label="Levier" min={1} onChange={(value) => updatePaper("leverage", value)} step={0.5} suffix="x" value={config.paper.leverage} />
          </div>
          <SizingModeControl mode={config.paper.sizingMode} onChange={(mode) => updatePaper("sizingMode", mode)} />
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            {config.paper.sizingMode === "fixed_usd" ? (
              <NumberField label="Montant max/trade" min={1} onChange={(value) => updatePaper("tradeAmountUsd", value)} prefix="$" step={10} value={config.paper.tradeAmountUsd} />
            ) : (
              <NumberField label="Capital max/trade" min={0.01} onChange={(value) => updatePaper("tradeAmountPercent", value)} step={0.1} suffix="%" value={config.paper.tradeAmountPercent} />
            )}
            <NumberField label="Risque max/trade" min={0.01} onChange={(value) => updatePaper("riskPerTradePercent", value)} step={0.05} suffix="%" value={config.paper.riskPerTradePercent} />
          </div>
          <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
            <NumberField label="Positions max" min={1} onChange={(value) => updatePaper("maxOpenPositions", Math.round(value))} step={1} value={config.paper.maxOpenPositions} />
            <NumberField label="Exposition max" min={1} onChange={(value) => updatePaper("maxPortfolioExposurePercent", value)} step={1} suffix="%" value={config.paper.maxPortfolioExposurePercent} />
            <NumberField label="Perte jour max" min={0.01} onChange={(value) => updatePaper("dailyLossLimitPercent", value)} step={0.1} suffix="%" value={config.paper.dailyLossLimitPercent} />
          </div>
          <PreviewRows rows={[
            ["Notionnel max/trade", formatUsd(paperNotional)],
            ["Capital runtime", formatUsd(paperState?.capitalUsd ?? config.paper.capitalUsd)],
            ["Equity paper", formatUsd(paperState?.equityUsd ?? config.paper.capitalUsd)],
          ]} />
        </section>

        <section className="space-y-4 lg:pl-5">
          <AllocationHeader
            active={config.live.enabled}
            icon={<Gauge className="size-4" />}
            onToggle={() => updateLive("enabled", !config.live.enabled)}
            title="Profil live"
          />
          <SizingModeControl mode={config.live.sizingMode} onChange={(mode) => updateLive("sizingMode", mode)} />
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            {config.live.sizingMode === "fixed_usd" ? (
              <NumberField label="Montant max/trade" min={1} onChange={(value) => updateLive("tradeAmountUsd", value)} prefix="$" step={10} value={config.live.tradeAmountUsd} />
            ) : (
              <NumberField label="Capital max/trade" min={0.01} onChange={(value) => updateLive("tradeAmountPercent", value)} step={0.1} suffix="%" value={config.live.tradeAmountPercent} />
            )}
            <NumberField label="Levier" min={1} onChange={(value) => updateLive("leverage", value)} step={0.5} suffix="x" value={config.live.leverage} />
          </div>
          <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
            <NumberField label="Risque max/trade" min={0.01} onChange={(value) => updateLive("riskPerTradePercent", value)} step={0.05} suffix="%" value={config.live.riskPerTradePercent} />
            <NumberField label="Exposition max" min={0.01} onChange={(value) => updateLive("maxPortfolioExposurePercent", value)} step={1} suffix="%" value={config.live.maxPortfolioExposurePercent} />
            <NumberField label="Perte jour max" min={0.01} onChange={(value) => updateLive("maxDailyLossPercent", value)} step={0.1} suffix="%" value={config.live.maxDailyLossPercent} />
          </div>
          <ToggleRow active={config.live.requireHumanValidation} label="Validation humaine live" onToggle={() => updateLive("requireHumanValidation", !config.live.requireHumanValidation)} />
          <PreviewRows rows={[
            [config.live.sizingMode === "fixed_usd" ? "Notionnel max/trade" : "Notionnel max/trade", config.live.sizingMode === "fixed_usd" ? formatUsd(livePreview) : `${livePreview.toFixed(2)}% du capital live`],
            ["Live réel", "bloqué par gate + adaptateur"],
            ["Application", config.live.enabled ? "profil prêt" : "profil en pause"],
          ]} />
        </section>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#16314a] pt-4">
        <div className="flex min-w-0 items-center gap-2 text-sm text-slate-400">
          <SlidersHorizontal className="size-4 shrink-0 text-sky-300" />
          <span className="truncate">{message}</span>
        </div>
        <Button disabled={busy} onClick={() => void save()} variant="success">
          <Save className="size-4" />
          Appliquer
        </Button>
      </div>
    </GlassCard>
  );
}

function AllocationHeader({ active, icon, onToggle, title }: { active: boolean; icon: ReactNode; onToggle: () => void; title: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm font-bold text-white">
        <span className="text-sky-300">{icon}</span>
        {title}
      </div>
      <TogglePill active={active} onClick={onToggle} />
    </div>
  );
}

function SizingModeControl({ mode, onChange }: { mode: TradingSizingMode; onChange: (mode: TradingSizingMode) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-xl border border-[#16314a] bg-white/[0.025] p-1">
      {[
        ["equity_percent", "% capital"],
        ["fixed_usd", "$ fixe"],
      ].map(([id, label]) => (
        <button
          className={cn(
            "h-9 rounded-lg text-sm font-semibold transition",
            mode === id ? "bg-sky-500/20 text-sky-100" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100",
          )}
          key={id}
          onClick={() => onChange(id as TradingSizingMode)}
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function NumberField({ label, min, onChange, prefix, step, suffix, value }: { label: string; min: number; onChange: (value: number) => void; prefix?: string; step: number; suffix?: string; value: number }) {
  return (
    <label className="block min-w-0 text-xs text-slate-400">
      {label}
      <div className="mt-1 flex h-10 items-center gap-2 rounded-xl border border-[#1b3a55] bg-slate-950/50 px-3 text-sm text-slate-100 focus-within:border-sky-400/60">
        {prefix ? <span className="shrink-0 text-slate-500">{prefix}</span> : null}
        <input
          className="min-w-0 flex-1 bg-transparent font-mono text-slate-100 outline-none"
          min={min}
          onChange={(event) => onChange(Number(event.target.value))}
          step={step}
          type="number"
          value={Number.isFinite(value) ? value : 0}
        />
        {suffix ? <span className="shrink-0 text-slate-500">{suffix}</span> : null}
      </div>
    </label>
  );
}

function ToggleRow({ active, label, onToggle }: { active: boolean; label: string; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#16314a] bg-white/[0.025] px-3 py-2 text-sm">
      <span className="min-w-0 truncate text-slate-200">{label}</span>
      <TogglePill active={active} onClick={onToggle} />
    </div>
  );
}

function PreviewRows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="divide-y divide-[#16314a] text-sm">
      {rows.map(([label, value]) => (
        <div className="flex items-center justify-between gap-4 py-2" key={label}>
          <span className="shrink-0 text-slate-400">{label}</span>
          <span className="min-w-0 text-right font-medium text-slate-100">{value}</span>
        </div>
      ))}
    </div>
  );
}
