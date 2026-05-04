"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent, type WheelEvent } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  Activity,
  BarChart3,
  Crosshair,
  Eye,
  Layers3,
  Lock,
  Magnet,
  Maximize2,
  Minimize2,
  Minus,
  MousePointer2,
  MoveHorizontal,
  Pencil,
  RefreshCcw,
  Ruler,
  Settings2,
  ShieldCheck,
  Square,
  Target,
  Trash2,
  TrendingUp,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { MarketCandle, Trade, TradeSide } from "@/types/trading";
import { liveCandleKey, useLiveCandleStore } from "@/lib/live-candle-store";
import { useLiveMarketStore, type LiveMarketTick } from "@/lib/live-market-store";
import { cn } from "@/lib/utils";
import { InfoHint, ProgressBar, StatusBadge } from "@/components/ui/dashboard";

const EMPTY_CANDLES: MarketCandle[] = [];
const WIDTH = 1500;
const TOOLBAR_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"];
const TOOL_ITEMS = [
  { id: "cursor", label: "Curseur", icon: MousePointer2 },
  { id: "crosshair", label: "Crosshair", icon: Crosshair },
  { id: "trend", label: "Trendline", icon: TrendingUp },
  { id: "draw", label: "Dessin libre", icon: Pencil },
  { id: "horizontal", label: "Ligne horizontale", icon: Minus },
  { id: "rectangle", label: "Zone", icon: Square },
  { id: "risk", label: "Long/Short", icon: Target },
  { id: "measure", label: "Mesure", icon: Ruler },
  { id: "magnet", label: "Aimant", icon: Magnet },
] as const;

type ToolId = (typeof TOOL_ITEMS)[number]["id"];
type DrawableToolId = Exclude<ToolId, "cursor" | "crosshair" | "magnet">;
type ChartMode = "agent" | "tradingview";
type ChartToolPoint = { index: number; price: number };
type DraftToolPoint = ChartToolPoint & { tool: DrawableToolId };
type ChartAnnotation =
  | { id: string; tool: "horizontal"; label: string; price: number; color: string }
  | { id: string; tool: "trend"; label: string; fromIndex: number; toIndex: number; fromPrice: number; toPrice: number; color: string }
  | { id: string; tool: "draw"; label: string; points: Array<{ index: number; price: number }>; color: string }
  | { id: string; tool: "rectangle"; label: string; fromIndex: number; toIndex: number; low: number; high: number; color: string }
  | { id: string; tool: "risk"; label: string; side: TradeSide; entry: number; stopLoss: number; takeProfit: number }
  | { id: string; tool: "measure"; label: string; fromIndex: number; toIndex: number; fromPrice: number; toPrice: number; deltaPercent: number };

function isDrawableTool(tool: ToolId): tool is DrawableToolId {
  return tool !== "cursor" && tool !== "crosshair" && tool !== "magnet";
}

type AgentLevel = {
  side: TradeSide;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  riskReward: number;
  riskPercent: number;
  invalidation: string;
  decision: "attente" | "proposition" | "bloque";
};

function normalizeSymbol(symbol: string) {
  return symbol.toUpperCase().replace(/[^A-Z0-9]/g, "") || "BTCUSD";
}

function pairLabel(symbol: string) {
  const raw = symbol.toUpperCase();
  if (raw.includes("/")) return raw;
  if (raw.includes("-")) return raw.replace("-", "/");
  const normalized = normalizeSymbol(symbol);
  if (normalized.endsWith("USDT")) return `${normalized.slice(0, -4)}/USDT`;
  if (normalized.endsWith("USDC")) return `${normalized.slice(0, -4)}/USDC`;
  if (normalized.endsWith("USD")) return `${normalized.slice(0, -3)}/USD`;
  if (normalized.endsWith("EUR")) return `${normalized.slice(0, -3)}/EUR`;
  return normalized.endsWith("USDT") ? `${normalized.slice(0, -4)}/USDT` : normalized;
}

function exchangeSymbolLabel(symbol: string) {
  return `${pairLabel(symbol)} · données marché`;
}

function formatPrice(value: number) {
  if (!Number.isFinite(value)) return "-";
  if (value >= 1000) return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
  if (value >= 1) return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(value);
  if (value > 0 && value < 0.000001) return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 10 }).format(value);
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 }).format(value);
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

function formatSignedPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)}%`;
}

function timeLabel(time: number, interval: string) {
  const options: Intl.DateTimeFormatOptions = interval.endsWith("d") ? { day: "2-digit", month: "short" } : { hour: "2-digit", minute: "2-digit" };
  return new Intl.DateTimeFormat("fr-FR", options).format(new Date(time));
}

function medianRange(candles: MarketCandle[]) {
  const sample = candles.slice(-20).map((candle) => Math.max(0, candle.high - candle.low)).sort((a, b) => a - b);
  if (!sample.length) return 0;
  return sample[Math.floor(sample.length / 2)] ?? 0;
}

function pricePrecision(price: number) {
  if (price >= 1000) return 2;
  if (price >= 1) return 4;
  return 6;
}

function minMoveFor(price: number) {
  if (price >= 1000) return 0.01;
  if (price >= 1) return 0.0001;
  return 0.000001;
}

function toUtcTimestamp(ms: number) {
  return Math.floor(ms / 1000) as UTCTimestamp;
}

function intervalToMs(interval: string) {
  const value = Number.parseInt(interval, 10) || 1;
  if (interval.endsWith("d")) return value * 24 * 60 * 60 * 1000;
  if (interval.endsWith("h")) return value * 60 * 60 * 1000;
  return value * 60 * 1000;
}

function candleFromTick(tick: LiveMarketTick, interval: string, previous?: MarketCandle): MarketCandle {
  const bucketMs = intervalToMs(interval);
  const time = Math.floor(tick.eventTime / bucketMs) * bucketMs;
  const open = previous?.close ?? tick.price;

  return {
    time,
    open,
    high: Math.max(open, tick.price),
    low: Math.min(open, tick.price),
    close: tick.price,
    volume: previous ? Math.max(previous.volume * 0.02, 1) : 1,
    closed: false,
  };
}

function mergeLiveTickIntoCandles(candles: MarketCandle[], tick: LiveMarketTick | undefined, interval: string) {
  if (!tick) return candles;

  const bucketMs = intervalToMs(interval);
  const tickTime = Math.floor(tick.eventTime / bucketMs) * bucketMs;
  const source = candles.slice(-220);
  const latest = source.at(-1);

  if (!latest) return [candleFromTick(tick, interval)];
  if (tickTime < latest.time) return source;

  if (tickTime === latest.time) {
    const updated: MarketCandle = {
      ...latest,
      high: Math.max(latest.high, tick.price),
      low: Math.min(latest.low, tick.price),
      close: tick.price,
      closed: false,
    };
    return [...source.slice(0, -1), updated];
  }

  return [...source, candleFromTick(tick, interval, latest)].slice(-220);
}

function buildAgentLevel(candles: MarketCandle[], riskPercent: number): AgentLevel | null {
  const last = candles.at(-1);
  const previous = candles.at(-18) ?? candles[0];
  if (!last || !previous) return null;

  const atr = Math.min(Math.max(medianRange(candles), last.close * 0.00035), last.close * 0.0013);
  const momentum = ((last.close - previous.close) / previous.close) * 100;
  const side: TradeSide = momentum >= 0 ? "LONG" : "SHORT";
  const entry = side === "LONG" ? last.close + atr * 0.18 : last.close - atr * 0.18;
  const stopLoss = side === "LONG" ? entry - atr * 1.55 : entry + atr * 1.55;
  const takeProfit = side === "LONG" ? entry + atr * 3.05 : entry - atr * 3.05;
  const riskReward = Math.abs(takeProfit - entry) / Math.max(Math.abs(entry - stopLoss), 0.0000001);
  const recentBodies = candles.slice(-10).filter((candle) => Math.abs(candle.close - candle.open) > (candle.high - candle.low) * 0.35).length;
  const confidence = Math.max(35, Math.min(88, Math.round(57 + Math.abs(momentum) * 6 + recentBodies * 2 - (atr / last.close) * 80)));
  const decision = confidence < 68 ? "attente" : riskPercent > 1 ? "bloque" : "proposition";

  return {
    side,
    entry,
    stopLoss,
    takeProfit,
    confidence,
    riskReward,
    riskPercent,
    invalidation: side === "LONG" ? "clôture sous stop ou volume absent" : "clôture au-dessus stop ou squeeze violent",
    decision,
  };
}

function priceToY(price: number, min: number, range: number, top: number, height: number) {
  return top + ((min + range - price) / range) * height;
}

function levelStyle(label: string) {
  if (label === "Stop") return { stroke: "#f23645", fill: "#ff6b79", bg: "rgba(242,54,69,.18)" };
  if (label === "TP") return { stroke: "#22ab94", fill: "#4ade80", bg: "rgba(34,171,148,.17)" };
  return { stroke: "#2962ff", fill: "#7aa2ff", bg: "rgba(41,98,255,.18)" };
}

function LevelLine({ label, value, min, range, top, height, right }: { label: string; value: number; min: number; range: number; top: number; height: number; right: number }) {
  const style = levelStyle(label);
  const y = priceToY(value, min, range, top, height);
  return (
    <g>
      <line x1={70} x2={right} y1={y} y2={y} stroke={style.stroke} strokeDasharray={label === "Entrée" ? "" : "8 8"} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
      <rect x={right + 8} y={y - 13} width="134" height="26" rx="7" fill={style.bg} stroke={style.stroke} strokeOpacity="0.72" />
      <text x={right + 18} y={y + 4} fill={style.fill} fontSize="11" fontWeight="800">{label} {formatPrice(value)}</text>
    </g>
  );
}

function ToolRail({ activeTool, onSelect, onClear, locked, onToggleLock }: { activeTool: ToolId; onSelect: (tool: ToolId) => void; onClear: () => void; locked: boolean; onToggleLock: () => void }) {
  return (
    <div className="absolute left-2 right-2 top-4 z-20 flex gap-1.5 overflow-x-auto rounded-2xl border border-white/12 bg-white/[0.92] p-1.5 text-slate-950 shadow-[0_20px_58px_rgba(0,0,0,.36)] backdrop-blur-xl lg:right-auto lg:flex-col lg:overflow-visible">
      {TOOL_ITEMS.map(({ id, label, icon: Icon }) => (
        <button key={id} title={label} onClick={() => onSelect(id)} className={cn("grid size-9 shrink-0 place-items-center rounded-xl border transition", activeTool === id ? "border-slate-300 bg-slate-200 text-black" : "border-transparent hover:bg-slate-200") }>
          <Icon className="size-5" />
        </button>
      ))}
      <div className="h-9 w-px shrink-0 bg-slate-300 lg:my-1 lg:h-px lg:w-auto" />
      <button title={locked ? "Déverrouiller pan/zoom" : "Verrouiller pan/zoom"} onClick={onToggleLock} className={cn("grid size-9 shrink-0 place-items-center rounded-xl transition hover:bg-slate-200", locked && "bg-slate-200 text-black")}>
        {locked ? <Lock className="size-5" /> : <MoveHorizontal className="size-5" />}
      </button>
      <button title="Effacer les outils" onClick={onClear} className="grid size-9 shrink-0 place-items-center rounded-xl transition hover:bg-slate-200"><Trash2 className="size-5" /></button>
    </div>
  );
}

function FloatingControls({ autoFollow, expanded, settingsOpen, onZoomIn, onZoomOut, onFit, onLive, onExpand, onSettings }: { autoFollow: boolean; expanded: boolean; settingsOpen: boolean; onZoomIn: () => void; onZoomOut: () => void; onFit: () => void; onLive: () => void; onExpand: () => void; onSettings: () => void }) {
  return (
    <div className="absolute right-5 top-5 z-20 flex flex-wrap items-center gap-1.5 rounded-2xl border border-white/80 bg-white px-3 py-2 text-slate-950 shadow-[0_20px_70px_rgba(0,0,0,.34)]">
      <button title="Zoom avant" onClick={onZoomIn} className="grid size-8 place-items-center rounded-lg hover:bg-slate-100"><ZoomIn className="size-5" /></button>
      <button title="Zoom arrière" onClick={onZoomOut} className="grid size-8 place-items-center rounded-lg hover:bg-slate-100"><ZoomOut className="size-5" /></button>
      <button title="Voir toute la fenêtre" onClick={onFit} className="grid size-8 place-items-center rounded-lg hover:bg-slate-100"><Activity className="size-5" /></button>
      <button title="Retour au live" onClick={onLive} className={cn("grid size-8 place-items-center rounded-lg hover:bg-slate-100", autoFollow && "bg-slate-100 text-[#2962ff]")}><RefreshCcw className="size-5" /></button>
      <div className="mx-1 h-6 w-px bg-slate-200" />
      <button title={expanded ? "Réduire" : "Agrandir"} onClick={onExpand} className="grid size-8 place-items-center rounded-lg hover:bg-slate-100">{expanded ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}</button>
      <button title="Paramètres visuels" onClick={onSettings} className={cn("grid size-8 place-items-center rounded-lg hover:bg-slate-100", settingsOpen && "bg-slate-100 text-[#2962ff]")}><Settings2 className="size-5" /></button>
    </div>
  );
}

function MetricTile({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "success" | "danger" | "info" | "ai" | "warning" | "neutral" }) {
  return (
    <div className="rounded-2xl border border-[#16314a] bg-[#071322] p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn("mt-1 font-mono text-xl font-bold", tone === "success" && "text-[#22ab94]", tone === "danger" && "text-[#f23645]", tone === "info" && "text-sky-200", tone === "ai" && "text-violet-300", tone === "warning" && "text-amber-300", tone === "neutral" && "text-white")}>{value}</div>
    </div>
  );
}

function QuoteBox({ label, value, tone }: { label: string; value: number; tone: "sell" | "buy" }) {
  return (
    <div className={cn("min-w-24 rounded-lg border px-3 py-2 font-mono shadow-[0_10px_28px_rgba(0,0,0,.22)]", tone === "sell" ? "border-[#f23645] bg-[#16060a] text-[#ff5b68]" : "border-[#2962ff] bg-[#061026] text-[#5c8dff]") }>
      <div className="text-[10px] uppercase tracking-wider">{label}</div>
      <div className="text-sm font-bold leading-none">{formatPrice(value)}</div>
    </div>
  );
}

function buildSeriesMarkers(candles: CandlestickData<Time>[], level: AgentLevel | null): SeriesMarker<Time>[] {
  if (!level || candles.length < 36) return [];
  const at = (offset: number) => candles[Math.max(0, candles.length - offset)]?.time ?? candles[0].time;
  const planColor = level.decision === "proposition" ? "#22ab94" : level.decision === "bloque" ? "#f23645" : "#f59e0b";

  return [
    { time: at(42), position: "belowBar", color: "#38bdf8", shape: "circle", text: "Signal", size: 1.1 },
    { time: at(31), position: "belowBar", color: "#a78bfa", shape: "square", text: "Analyse", size: 1.1 },
    { time: at(20), position: "aboveBar", color: "#fbbf24", shape: "circle", text: "Risque", size: 1.1 },
    { time: at(10), position: level.side === "LONG" ? "belowBar" : "aboveBar", color: planColor, shape: level.side === "LONG" ? "arrowUp" : "arrowDown", text: level.decision === "proposition" ? "Plan" : level.decision, size: 1.35 },
  ];
}

function TradingViewEngineChart({
  candles,
  agentLevel,
  compact,
  expanded,
  visibleCount,
  offsetFromRight,
  autoFollow,
  locked,
  viewportVersion,
  annotations,
  draftToolPoint,
  activeTool,
  onChartToolPoint,
  onDetachFromLive,
}: {
  candles: MarketCandle[];
  agentLevel: AgentLevel | null;
  compact: boolean;
  expanded: boolean;
  visibleCount: number;
  offsetFromRight: number;
  autoFollow: boolean;
  locked: boolean;
  viewportVersion: number;
  annotations: ChartAnnotation[];
  draftToolPoint: DraftToolPoint | null;
  activeTool: ToolId;
  onChartToolPoint: (point: ChartToolPoint) => void;
  onDetachFromLive?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick", Time> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram", Time> | null>(null);
  const markerApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const applyingRangeRef = useRef(false);
  const initializedRangeRef = useRef(false);
  const lastViewportVersionRef = useRef(-1);
  const manualViewportRef = useRef(false);
  const dataLengthRef = useRef(0);
  const detachFromLiveRef = useRef<(() => void) | undefined>(onDetachFromLive);

  useEffect(() => {
    detachFromLiveRef.current = onDetachFromLive;
  }, [onDetachFromLive]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#02040a" },
        textColor: "#6b7280",
        fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(31,41,55,.32)", style: LineStyle.Solid },
        horzLines: { color: "rgba(31,41,55,.36)", style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(226,232,240,.58)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#111827" },
        horzLine: { color: "rgba(226,232,240,.46)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#111827" },
      },
      rightPriceScale: {
        borderColor: "#0f172a",
        textColor: "#6b7280",
        scaleMargins: { top: 0.06, bottom: 0.24 },
      },
      timeScale: {
        borderColor: "#0f172a",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 16,
        barSpacing: compact ? 5.8 : 7.5,
        minBarSpacing: 2,
        shiftVisibleRangeOnNewBar: true,
        rightBarStaysOnScroll: true,
      },
      handleScroll: { mouseWheel: !locked, pressedMouseMove: !locked, horzTouchDrag: !locked, vertTouchDrag: !locked },
      handleScale: { axisPressedMouseMove: !locked, mouseWheel: !locked, pinch: !locked },
      localization: { priceFormatter: (price: number) => formatPrice(price) },
    });

    const lastPrice = 10000;
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22ab94",
      downColor: "#f23645",
      borderVisible: false,
      wickUpColor: "#22ab94",
      wickDownColor: "#f23645",
      priceLineVisible: true,
      priceLineColor: "#f23645",
      priceLineStyle: LineStyle.Dotted,
      lastValueVisible: true,
      priceFormat: { type: "price", precision: pricePrecision(lastPrice), minMove: minMoveFor(lastPrice) },
    });
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      lastValueVisible: false,
      priceLineVisible: false,
    });

    chart.priceScale("").applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    markerApiRef.current = createSeriesMarkers(candleSeries, []);
    const handleManualRangeChange = () => {
      if (applyingRangeRef.current || dataLengthRef.current === 0) return;
      manualViewportRef.current = true;
      detachFromLiveRef.current?.();
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleManualRangeChange);

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleManualRangeChange);
      priceLinesRef.current = [];
      markerApiRef.current?.detach();
      markerApiRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, [compact, locked]);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!chart || !candleSeries || !volumeSeries) return;

    const allCandles: CandlestickData<Time>[] = candles.slice(-220).map((candle) => ({
      time: toUtcTimestamp(candle.time),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));
    const allVolumes: HistogramData<Time>[] = candles.slice(-220).map((candle) => ({
      time: toUtcTimestamp(candle.time),
      value: candle.volume,
      color: candle.close >= candle.open ? "rgba(34,171,148,.42)" : "rgba(242,54,69,.38)",
    }));

    applyingRangeRef.current = true;
    dataLengthRef.current = allCandles.length;
    candleSeries.setData(allCandles);
    volumeSeries.setData(allVolumes);
    const lastPrice = candles.at(-1)?.close ?? 10000;
    candleSeries.applyOptions({ priceFormat: { type: "price", precision: pricePrecision(lastPrice), minMove: minMoveFor(lastPrice) } });

    priceLinesRef.current.forEach((line) => candleSeries.removePriceLine(line));
    priceLinesRef.current = [];
    if (agentLevel) {
      priceLinesRef.current = [
        candleSeries.createPriceLine({ price: agentLevel.entry, color: "#2962ff", lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `ENTREE ${formatPrice(agentLevel.entry)}` }),
        candleSeries.createPriceLine({ price: agentLevel.stopLoss, color: "#f23645", lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `STOP ${formatPrice(agentLevel.stopLoss)}` }),
        candleSeries.createPriceLine({ price: agentLevel.takeProfit, color: "#22ab94", lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `TP ${formatPrice(agentLevel.takeProfit)}` }),
      ];
    }

    markerApiRef.current?.setMarkers(buildSeriesMarkers(allCandles, agentLevel));
    const hasViewportCommand = viewportVersion !== lastViewportVersionRef.current;
    const shouldControlViewport = allCandles.length > 0 && (hasViewportCommand || !initializedRangeRef.current || (autoFollow && !manualViewportRef.current));

    if (shouldControlViewport) {
      manualViewportRef.current = false;
      const effectiveOffset = autoFollow ? 0 : offsetFromRight;
      const to = allCandles.length + 8 - effectiveOffset;
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, to - visibleCount), to });
      initializedRangeRef.current = true;
      lastViewportVersionRef.current = viewportVersion;
    }

    window.setTimeout(() => {
      applyingRangeRef.current = false;
    }, 0);
  }, [agentLevel, autoFollow, candles, offsetFromRight, viewportVersion, visibleCount]);

  useEffect(() => {
    chartRef.current?.applyOptions({
      handleScroll: { mouseWheel: !locked, pressedMouseMove: !locked, horzTouchDrag: !locked, vertTouchDrag: !locked },
      handleScale: { axisPressedMouseMove: !locked, mouseWheel: !locked, pinch: !locked },
    });
  }, [locked]);

  const engineHeight = expanded ? 900 : compact ? 540 : 760;
  const sourceCandles = candles.slice(-220);
  const engineMaxOffset = Math.max(0, sourceCandles.length - Math.min(visibleCount, sourceCandles.length || visibleCount));
  const engineOffset = autoFollow ? 0 : Math.min(offsetFromRight, engineMaxOffset);
  const engineEnd = Math.max(0, sourceCandles.length - engineOffset);
  const engineStart = Math.max(0, engineEnd - visibleCount);
  const engineVisible = sourceCandles.slice(engineStart, engineEnd);
  const engineLeft = 54;
  const engineRight = WIDTH - 88;
  const engineTop = 50;
  const engineBottom = compact ? 86 : 116;
  const engineChartHeight = Math.max(260, engineHeight - engineTop - engineBottom);
  const engineChartWidth = engineRight - engineLeft;
  const engineFutureBars = compact ? 12 : 22;
  const engineStep = engineChartWidth / Math.max(1, engineVisible.length + engineFutureBars);
  const annotationValues = annotations.flatMap((annotation) => {
    if (annotation.tool === "horizontal") return [annotation.price];
    if (annotation.tool === "trend" || annotation.tool === "measure") return [annotation.fromPrice, annotation.toPrice];
    if (annotation.tool === "draw") return annotation.points.map((point) => point.price);
    if (annotation.tool === "rectangle") return [annotation.low, annotation.high];
    return [annotation.entry, annotation.stopLoss, annotation.takeProfit];
  });
  const engineLevelValues = agentLevel ? [agentLevel.entry, agentLevel.stopLoss, agentLevel.takeProfit] : [];
  const engineLows = engineVisible.map((candle) => candle.low).concat(engineLevelValues, annotationValues, draftToolPoint ? [draftToolPoint.price] : []);
  const engineHighs = engineVisible.map((candle) => candle.high).concat(engineLevelValues, annotationValues, draftToolPoint ? [draftToolPoint.price] : []);
  const engineMinRaw = engineLows.length ? Math.min(...engineLows) : 0;
  const engineMaxRaw = engineHighs.length ? Math.max(...engineHighs) : 1;
  const enginePadding = Math.max((engineMaxRaw - engineMinRaw) * 0.12, (engineVisible.at(-1)?.close ?? 1) * 0.0008);
  const engineMin = engineMinRaw - enginePadding;
  const engineRange = engineMaxRaw - engineMinRaw + enginePadding * 2 || 1;
  const drawingActive = isDrawableTool(activeTool) && !locked;

  function engineAnnotationIndex(index: number) {
    return Math.max(0, Math.min(Math.max(engineVisible.length - 1, 0), index));
  }

  function engineX(index: number) {
    return engineLeft + engineAnnotationIndex(index) * engineStep + engineStep / 2;
  }

  function engineY(price: number) {
    return priceToY(price, engineMin, engineRange, engineTop, engineChartHeight);
  }

  function pointFromEngineEvent(event: MouseEvent<SVGSVGElement>): ChartToolPoint {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * WIDTH;
    const y = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * engineHeight;
    const index = Math.max(0, Math.min(Math.max(engineVisible.length - 1, 0), Math.round((x - engineLeft - engineStep / 2) / engineStep)));
    const normalizedY = Math.max(0, Math.min(1, (y - engineTop) / engineChartHeight));
    return { index, price: engineMin + engineRange - normalizedY * engineRange };
  }

  function renderEngineAnnotation(annotation: ChartAnnotation) {
    if (!engineVisible.length) return null;

    if (annotation.tool === "horizontal") {
      const y = engineY(annotation.price);
      return (
        <g key={annotation.id}>
          <line x1={engineLeft} x2={engineRight} y1={y} y2={y} stroke={annotation.color} strokeDasharray="9 7" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <rect x={engineRight - 164} y={y - 14} width="154" height="28" rx="8" fill="rgba(251,191,36,.14)" stroke={annotation.color} strokeOpacity="0.72" />
          <text x={engineRight - 152} y={y + 4} fill={annotation.color} fontSize="11" fontWeight="900">{annotation.label}</text>
        </g>
      );
    }

    if (annotation.tool === "trend") {
      const x1 = engineX(annotation.fromIndex);
      const x2 = engineX(annotation.toIndex);
      const y1 = engineY(annotation.fromPrice);
      const y2 = engineY(annotation.toPrice);
      return (
        <g key={annotation.id}>
          <line x1={x1} x2={x2} y1={y1} y2={y2} stroke={annotation.color} strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
          <circle cx={x1} cy={y1} r="5" fill="#050b14" stroke={annotation.color} strokeWidth="2" />
          <circle cx={x2} cy={y2} r="5" fill="#050b14" stroke={annotation.color} strokeWidth="2" />
        </g>
      );
    }

    if (annotation.tool === "draw") {
      const points = annotation.points.map((point) => `${engineX(point.index)},${engineY(point.price)}`).join(" ");
      return <polyline key={annotation.id} points={points} fill="none" stroke={annotation.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
    }

    if (annotation.tool === "rectangle") {
      const x1 = engineX(annotation.fromIndex);
      const x2 = engineX(annotation.toIndex);
      const y1 = engineY(annotation.high);
      const y2 = engineY(annotation.low);
      return (
        <g key={annotation.id}>
          <rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} rx="8" fill="rgba(245,158,11,.12)" stroke={annotation.color} strokeDasharray="8 6" strokeWidth="2" />
          <text x={Math.min(x1, x2) + 10} y={Math.min(y1, y2) + 20} fill={annotation.color} fontSize="11" fontWeight="900">{annotation.label}</text>
        </g>
      );
    }

    if (annotation.tool === "risk") {
      const x = engineLeft + engineChartWidth * 0.62;
      const width = engineChartWidth * 0.3;
      const entryY = engineY(annotation.entry);
      const stopY = engineY(annotation.stopLoss);
      const tpY = engineY(annotation.takeProfit);
      return (
        <g key={annotation.id}>
          <rect x={x} y={Math.min(entryY, tpY)} width={width} height={Math.abs(entryY - tpY)} fill="rgba(34,171,148,.14)" stroke="#22ab94" strokeWidth="1.6" />
          <rect x={x} y={Math.min(entryY, stopY)} width={width} height={Math.abs(entryY - stopY)} fill="rgba(242,54,69,.14)" stroke="#f23645" strokeWidth="1.6" />
          <text x={x + 10} y={entryY - 8} fill="#e2e8f0" fontSize="11" fontWeight="900">{annotation.label}</text>
        </g>
      );
    }

    const x1 = engineX(annotation.fromIndex);
    const x2 = engineX(annotation.toIndex);
    const y1 = engineY(annotation.fromPrice);
    const y2 = engineY(annotation.toPrice);
    const labelX = Math.min(Math.max((x1 + x2) / 2, engineLeft + 40), engineRight - 160);
    const labelY = Math.min(y1, y2) - 16;
    return (
      <g key={annotation.id}>
        <line x1={x1} x2={x2} y1={y1} y2={y2} stroke="#e2e8f0" strokeDasharray="5 5" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <rect x={labelX} y={labelY - 16} width="150" height="28" rx="8" fill="rgba(2,6,23,.9)" stroke="#64748b" />
        <text x={labelX + 10} y={labelY + 2} fill={annotation.deltaPercent >= 0 ? "#22ab94" : "#f23645"} fontSize="11" fontWeight="900">{formatSignedPercent(annotation.deltaPercent)} · Mesure</text>
      </g>
    );
  }

  function renderEngineDraft() {
    if (!draftToolPoint || !engineVisible.length) return null;
    const x = engineX(draftToolPoint.index);
    const y = engineY(draftToolPoint.price);
    return (
      <g>
        <circle cx={x} cy={y} r="7" fill="#02040a" stroke="#f8fafc" strokeWidth="2" />
        <rect x={Math.min(x + 10, engineRight - 120)} y={y - 18} width="112" height="28" rx="8" fill="rgba(2,6,23,.9)" stroke="#94a3b8" />
        <text x={Math.min(x + 22, engineRight - 108)} y={y} fill="#f8fafc" fontSize="11" fontWeight="900">point 1</text>
      </g>
    );
  }

  return (
    <div className="relative bg-[#02040a]">
      <div ref={containerRef} className="w-full" style={{ height: expanded ? "calc(100vh - 220px)" : compact ? 540 : 760 }} />
      <svg
        data-testid="tradingview-tool-overlay"
        viewBox={`0 0 ${WIDTH} ${engineHeight}`}
        className={cn("absolute inset-0 z-10 size-full", drawingActive ? "cursor-crosshair touch-none" : "pointer-events-none")}
        onMouseDown={(event) => {
          if (!drawingActive || !engineVisible.length || event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          onChartToolPoint(pointFromEngineEvent(event));
        }}
        aria-hidden="true"
      >
        {annotations.map(renderEngineAnnotation)}
        {renderEngineDraft()}
      </svg>
      <div className="pointer-events-none absolute left-20 top-5 rounded-xl border border-white/10 bg-[#02040a]/78 px-3 py-2 text-xs text-slate-300 backdrop-blur-md">
        TradingView engine · outils branchés · price scale native · mêmes niveaux Agent
      </div>
    </div>
  );
}

type TradingDeskChartProps = {
  symbol?: string;
  trades?: Trade[];
  riskPercent?: number;
  compact?: boolean;
  title?: string;
  agentName?: string;
  agentStrategy?: string;
  agentMode?: string;
};

export function TradingDeskChart({
  symbol = "BTCUSDT",
  trades = [],
  riskPercent = 0.5,
  compact = false,
  title = "Trading desk live",
  agentName = "Agent",
  agentStrategy,
  agentMode,
}: TradingDeskChartProps) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const [interval, setIntervalValue] = useState(compact ? "5m" : "1m");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [activeTool, setActiveTool] = useState<ToolId>("crosshair");
  const [chartMode, setChartMode] = useState<ChartMode>("agent");
  const [expanded, setExpanded] = useState(false);
  const [locked, setLocked] = useState(false);
  const [magnetEnabled, setMagnetEnabled] = useState(false);
  const [visualSettingsOpen, setVisualSettingsOpen] = useState(false);
  const [annotations, setAnnotations] = useState<ChartAnnotation[]>([]);
  const [draftToolPoint, setDraftToolPoint] = useState<DraftToolPoint | null>(null);
  const [autoFollow, setAutoFollow] = useState(true);
  const [visibleCount, setVisibleCount] = useState(compact ? 96 : 150);
  const [offsetFromRight, setOffsetFromRight] = useState(0);
  const [viewportVersion, setViewportVersion] = useState(0);
  const dragRef = useRef<{ x: number; offset: number } | null>(null);

  const key = useMemo(() => liveCandleKey(normalizedSymbol, interval), [interval, normalizedSymbol]);
  const rawCandles = useLiveCandleStore((state) => state.candlesByKey[key] ?? EMPTY_CANDLES);
  const connected = useLiveCandleStore((state) => state.connected);
  const connecting = useLiveCandleStore((state) => state.connecting);
  const transport = useLiveCandleStore((state) => state.transport);
  const lastUpdate = useLiveCandleStore((state) => state.lastUpdate);
  const marketTick = useLiveMarketStore((state) => state.ticks[normalizedSymbol] ?? state.ticks[normalizedSymbol.replace(/USDT$/, "USD")] ?? state.ticks[normalizedSymbol.replace(/USDC$/, "USD")] ?? state.ticks[normalizedSymbol.replace(/USD$/, "USDT")]);
  const marketTransport = useLiveMarketStore((state) => state.transport);
  const candles = useMemo(() => mergeLiveTickIntoCandles(rawCandles, marketTick, interval), [interval, marketTick, rawCandles]);

  useEffect(() => {
    useLiveCandleStore.getState().connect(normalizedSymbol, interval);
  }, [interval, normalizedSymbol]);

  const maxOffset = Math.max(0, candles.length - Math.min(visibleCount, candles.length || visibleCount));
  const effectiveOffsetFromRight = autoFollow ? 0 : offsetFromRight;
  const clampedOffset = Math.min(effectiveOffsetFromRight, maxOffset);
  const end = Math.max(0, candles.length - clampedOffset);
  const start = Math.max(0, end - visibleCount);
  const visible = candles.slice(start, end);
  const agentLevel = buildAgentLevel(candles, riskPercent);
  const height = expanded ? 900 : compact ? 560 : 760;
  const top = 92;
  const chartLeft = 70;
  const priceAxisLeft = WIDTH - 126;
  const chartRight = priceAxisLeft - 12;
  const volumeHeight = compact ? 86 : 118;
  const bottom = 42;
  const chartHeight = height - top - volumeHeight - bottom - 28;
  const chartWidth = chartRight - chartLeft;
  const futureBars = compact ? 12 : 22;
  const totalSlots = Math.max(1, visible.length + futureBars);
  const step = chartWidth / totalSlots;
  const candleWidth = Math.max(2.2, Math.min(compact ? 6.5 : 9, step * 0.66));
  const latest = visible.at(-1);
  const first = visible[0];
  const change = latest && first ? ((latest.close - first.open) / first.open) * 100 : 0;
  const levelValues = agentLevel ? [agentLevel.entry, agentLevel.stopLoss, agentLevel.takeProfit] : [];
  const lows = visible.map((candle) => candle.low).concat(levelValues);
  const highs = visible.map((candle) => candle.high).concat(levelValues);
  const minRaw = lows.length ? Math.min(...lows) : 0;
  const maxRaw = highs.length ? Math.max(...highs) : 1;
  const padding = Math.max((maxRaw - minRaw) * 0.14, (latest?.close ?? 1) * 0.0008);
  const min = minRaw - padding;
  const max = maxRaw + padding;
  const range = max - min || 1;
  const maxVolume = Math.max(1, ...visible.map((candle) => candle.volume));
  const volumeTop = top + chartHeight + 18;
  const currentY = latest ? priceToY(latest.close, min, range, top, chartHeight) : top;
  const hover = hoverIndex !== null ? visible[hoverIndex] : latest;
  const hoverX = hoverIndex !== null ? chartLeft + hoverIndex * step + step / 2 : null;
  const relatedTrades = trades.filter((trade) => normalizeSymbol(trade.asset) === normalizedSymbol || normalizeSymbol(trade.asset).includes(normalizedSymbol.slice(0, 3))).slice(0, 3);
  const bid = latest ? latest.close * 0.99998 : 0;
  const ask = latest ? latest.close * 1.00002 : 0;
  const chartFeedLive = Boolean(marketTick);
  const chartLastUpdate = marketTick?.eventTime ?? lastUpdate;
  const marketTickUpdates = marketTick?.points.length ?? 0;

  function clampOffset(value: number) {
    return Math.max(0, Math.min(maxOffset, value));
  }

  function queueViewportCommand() {
    setViewportVersion((value) => value + 1);
  }

  function zoomIn() {
    setAutoFollow(false);
    setVisibleCount((value) => Math.max(34, value - 24));
    queueViewportCommand();
  }

  function zoomOut() {
    setAutoFollow(false);
    setVisibleCount((value) => Math.min(220, value + 34));
    queueViewportCommand();
  }

  function fitWindow() {
    setAutoFollow(false);
    setOffsetFromRight(0);
    setVisibleCount(Math.min(220, Math.max(compact ? 120 : 180, candles.length || 180)));
    queueViewportCommand();
  }

  function goLive() {
    setAutoFollow(true);
    setOffsetFromRight(0);
    setVisibleCount(compact ? 96 : 150);
    queueViewportCommand();
  }

  function pan(delta: number) {
    setAutoFollow(false);
    setOffsetFromRight((value) => clampOffset(value + delta));
    queueViewportCommand();
  }

  function annotationId(tool: ToolId) {
    return `${tool}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function annotationIndex(index: number) {
    return Math.max(0, Math.min(Math.max(visible.length - 1, 0), index));
  }

  function snapPrice(price: number) {
    if (!magnetEnabled || !visible.length) return price;
    return visible.reduce((nearest, candle) => {
      const candidates = [candle.open, candle.high, candle.low, candle.close];
      return candidates.reduce((best, candidate) => (Math.abs(candidate - price) < Math.abs(best - price) ? candidate : best), nearest);
    }, visible.at(-1)?.close ?? price);
  }

  function normalizeAnnotationPoint(point: ChartToolPoint): ChartToolPoint {
    return { index: annotationIndex(point.index), price: snapPrice(point.price) };
  }

  function createAnnotation(tool: DrawableToolId, firstInput: ChartToolPoint, secondInput?: ChartToolPoint): ChartAnnotation {
    const firstPoint = normalizeAnnotationPoint(firstInput);
    const secondPoint = normalizeAnnotationPoint(secondInput ?? firstInput);
    const typicalRange = Math.max(medianRange(visible), firstPoint.price * 0.001);

    if (tool === "horizontal") {
      return { id: annotationId(tool), tool, label: "Support / résistance", price: firstPoint.price, color: "#fbbf24" };
    }

    if (tool === "trend") {
      return { id: annotationId(tool), tool, label: "Trendline", fromIndex: firstPoint.index, toIndex: secondPoint.index, fromPrice: firstPoint.price, toPrice: secondPoint.price, color: "#38bdf8" };
    }

    if (tool === "draw") {
      const midIndex = annotationIndex(Math.round((firstPoint.index + secondPoint.index) / 2));
      const midPrice = snapPrice((firstPoint.price + secondPoint.price) / 2);
      return {
        id: annotationId(tool),
        tool,
        label: "Dessin libre",
        color: "#a78bfa",
        points: [firstPoint, { index: midIndex, price: midPrice }, secondPoint],
      };
    }

    if (tool === "rectangle") {
      const samePrice = Math.abs(firstPoint.price - secondPoint.price) < typicalRange * 0.15;
      const low = samePrice ? firstPoint.price - typicalRange : Math.min(firstPoint.price, secondPoint.price);
      const high = samePrice ? firstPoint.price + typicalRange : Math.max(firstPoint.price, secondPoint.price);
      return { id: annotationId(tool), tool, label: "Zone de travail", fromIndex: firstPoint.index, toIndex: secondPoint.index, low: snapPrice(low), high: snapPrice(high), color: "#f59e0b" };
    }

    if (tool === "risk") {
      const side = agentLevel?.side ?? "LONG";
      const entry = firstPoint.price;
      const stopLoss = side === "LONG" ? entry - typicalRange * 1.55 : entry + typicalRange * 1.55;
      const takeProfit = side === "LONG" ? entry + typicalRange * 3.05 : entry - typicalRange * 3.05;
      return { id: annotationId(tool), tool, label: `${side} plan`, side, entry, stopLoss: snapPrice(stopLoss), takeProfit: snapPrice(takeProfit) };
    }

    const deltaPercent = ((secondPoint.price - firstPoint.price) / Math.max(firstPoint.price, 0.0000001)) * 100;
    return { id: annotationId("measure"), tool: "measure", label: "Mesure", fromIndex: firstPoint.index, toIndex: secondPoint.index, fromPrice: firstPoint.price, toPrice: secondPoint.price, deltaPercent };
  }

  function pushAnnotation(annotation: ChartAnnotation) {
    setAnnotations((current) => [...current.slice(-7), annotation]);
  }

  function addAnnotation(tool: DrawableToolId) {
    if (!visible.length) {
      setActiveTool(tool);
      return;
    }

    const latestCandle = latest ?? visible.at(-1);
    if (!latestCandle) return;

    const startIndex = annotationIndex(Math.floor(visible.length * 0.25));
    const midIndex = annotationIndex(Math.floor(visible.length * 0.55));
    const endIndex = annotationIndex(Math.max(0, visible.length - 5));
    const startCandle = visible[startIndex] ?? latestCandle;
    const midCandle = visible[midIndex] ?? latestCandle;
    const firstPoint = tool === "horizontal" || tool === "risk"
      ? { index: hoverIndex ?? midIndex, price: hover?.close ?? latestCandle.close }
      : { index: startIndex, price: startCandle.close };
    const secondPoint = tool === "rectangle"
      ? { index: endIndex, price: midCandle.close + Math.max(medianRange(visible), latestCandle.close * 0.001) }
      : { index: endIndex, price: latestCandle.close };

    pushAnnotation(createAnnotation(tool, firstPoint, secondPoint));
  }

  function handleChartToolPoint(point: ChartToolPoint) {
    if (locked || !visible.length || !isDrawableTool(activeTool)) return;

    const normalizedPoint = normalizeAnnotationPoint(point);
    if (activeTool === "horizontal" || activeTool === "risk") {
      pushAnnotation(createAnnotation(activeTool, normalizedPoint));
      setDraftToolPoint(null);
      return;
    }

    if (!draftToolPoint || draftToolPoint.tool !== activeTool) {
      setDraftToolPoint({ tool: activeTool, ...normalizedPoint });
      return;
    }

    pushAnnotation(createAnnotation(activeTool, draftToolPoint, normalizedPoint));
    setDraftToolPoint(null);
  }

  function handleToolSelect(tool: ToolId) {
    if (tool === "magnet") {
      setMagnetEnabled((value) => !value);
      return;
    }

    setActiveTool(tool);
    setDraftToolPoint(null);

    if (isDrawableTool(tool)) {
      addAnnotation(tool);
    }
  }

  function clearAnnotations() {
    setAnnotations([]);
    setDraftToolPoint(null);
    setActiveTool("cursor");
  }

  function onWheel(event: WheelEvent<SVGSVGElement>) {
    if (locked) return;
    event.preventDefault();
    if (event.deltaY < 0) zoomIn();
    if (event.deltaY > 0) zoomOut();
  }

  function pointFromSvgEvent(event: MouseEvent<SVGSVGElement>): ChartToolPoint {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * WIDTH;
    const y = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * height;
    const index = Math.max(0, Math.min(Math.max(visible.length - 1, 0), Math.round((x - chartLeft - step / 2) / step)));
    const normalizedY = Math.max(0, Math.min(1, (y - top) / chartHeight));
    return { index, price: min + range - normalizedY * range };
  }

  function onMouseDown(event: MouseEvent<SVGSVGElement>) {
    if (locked) return;
    if (isDrawableTool(activeTool)) {
      event.preventDefault();
      handleChartToolPoint(pointFromSvgEvent(event));
      return;
    }

    dragRef.current = { x: event.clientX, offset: offsetFromRight };
    setAutoFollow(false);
  }

  function onMouseMove(event: MouseEvent<SVGSVGElement>) {
    if (!visible.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const index = Math.max(0, Math.min(visible.length - 1, Math.round((x - chartLeft - step / 2) / step)));
    setHoverIndex(index);

    if (dragRef.current && !locked) {
      const dx = event.clientX - dragRef.current.x;
      const bars = Math.round(dx / Math.max(4, step * (rect.width / WIDTH)));
      setOffsetFromRight(clampOffset(dragRef.current.offset + bars));
    }
  }

  function onMouseUp() {
    dragRef.current = null;
  }

  function annotationX(index: number) {
    return chartLeft + annotationIndex(index) * step + step / 2;
  }

  function renderAnnotation(annotation: ChartAnnotation) {
    if (!visible.length) return null;

    if (annotation.tool === "horizontal") {
      const y = priceToY(annotation.price, min, range, top, chartHeight);
      return (
        <g key={annotation.id}>
          <line x1={chartLeft} x2={chartRight} y1={y} y2={y} stroke={annotation.color} strokeDasharray="9 7" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <rect x={chartRight - 168} y={y - 14} width="158" height="28" rx="8" fill="rgba(251,191,36,.14)" stroke={annotation.color} strokeOpacity="0.72" />
          <text x={chartRight - 156} y={y + 4} fill={annotation.color} fontSize="11" fontWeight="900">{annotation.label}</text>
        </g>
      );
    }

    if (annotation.tool === "trend") {
      const x1 = annotationX(annotation.fromIndex);
      const x2 = annotationX(annotation.toIndex);
      const y1 = priceToY(annotation.fromPrice, min, range, top, chartHeight);
      const y2 = priceToY(annotation.toPrice, min, range, top, chartHeight);
      return (
        <g key={annotation.id}>
          <line x1={x1} x2={x2} y1={y1} y2={y2} stroke={annotation.color} strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
          <circle cx={x1} cy={y1} r="5" fill="#050b14" stroke={annotation.color} strokeWidth="2" />
          <circle cx={x2} cy={y2} r="5" fill="#050b14" stroke={annotation.color} strokeWidth="2" />
        </g>
      );
    }

    if (annotation.tool === "draw") {
      const points = annotation.points.map((point) => `${annotationX(point.index)},${priceToY(point.price, min, range, top, chartHeight)}`).join(" ");
      return <polyline key={annotation.id} points={points} fill="none" stroke={annotation.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
    }

    if (annotation.tool === "rectangle") {
      const x1 = annotationX(annotation.fromIndex);
      const x2 = annotationX(annotation.toIndex);
      const y1 = priceToY(annotation.high, min, range, top, chartHeight);
      const y2 = priceToY(annotation.low, min, range, top, chartHeight);
      return (
        <g key={annotation.id}>
          <rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} rx="8" fill="rgba(245,158,11,.12)" stroke={annotation.color} strokeDasharray="8 6" strokeWidth="2" />
          <text x={Math.min(x1, x2) + 10} y={Math.min(y1, y2) + 20} fill={annotation.color} fontSize="11" fontWeight="900">{annotation.label}</text>
        </g>
      );
    }

    if (annotation.tool === "risk") {
      const x = chartLeft + chartWidth * 0.62;
      const width = chartWidth * 0.3;
      const entryY = priceToY(annotation.entry, min, range, top, chartHeight);
      const stopY = priceToY(annotation.stopLoss, min, range, top, chartHeight);
      const tpY = priceToY(annotation.takeProfit, min, range, top, chartHeight);
      return (
        <g key={annotation.id}>
          <rect x={x} y={Math.min(entryY, tpY)} width={width} height={Math.abs(entryY - tpY)} fill="rgba(34,171,148,.14)" stroke="#22ab94" strokeWidth="1.6" />
          <rect x={x} y={Math.min(entryY, stopY)} width={width} height={Math.abs(entryY - stopY)} fill="rgba(242,54,69,.14)" stroke="#f23645" strokeWidth="1.6" />
          <text x={x + 10} y={entryY - 8} fill="#e2e8f0" fontSize="11" fontWeight="900">{annotation.label}</text>
        </g>
      );
    }

    const x1 = annotationX(annotation.fromIndex);
    const x2 = annotationX(annotation.toIndex);
    const y1 = priceToY(annotation.fromPrice, min, range, top, chartHeight);
    const y2 = priceToY(annotation.toPrice, min, range, top, chartHeight);
    const labelX = Math.min(Math.max((x1 + x2) / 2, chartLeft + 40), chartRight - 160);
    const labelY = Math.min(y1, y2) - 16;
    return (
      <g key={annotation.id}>
        <line x1={x1} x2={x2} y1={y1} y2={y2} stroke="#e2e8f0" strokeDasharray="5 5" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <rect x={labelX} y={labelY - 16} width="150" height="28" rx="8" fill="rgba(2,6,23,.9)" stroke="#64748b" />
        <text x={labelX + 10} y={labelY + 2} fill={annotation.deltaPercent >= 0 ? "#22ab94" : "#f23645"} fontSize="11" fontWeight="900">{formatSignedPercent(annotation.deltaPercent)} · Mesure</text>
      </g>
    );
  }

  function renderDraftToolPoint() {
    if (!draftToolPoint || !visible.length) return null;
    const x = annotationX(draftToolPoint.index);
    const y = priceToY(draftToolPoint.price, min, range, top, chartHeight);
    return (
      <g>
        <circle cx={x} cy={y} r="7" fill="#02040a" stroke="#f8fafc" strokeWidth="2" />
        <rect x={Math.min(x + 10, chartRight - 120)} y={y - 18} width="112" height="28" rx="8" fill="rgba(2,6,23,.9)" stroke="#94a3b8" />
        <text x={Math.min(x + 22, chartRight - 108)} y={y} fill="#f8fafc" fontSize="11" fontWeight="900">point 1</text>
      </g>
    );
  }

  return (
    <section data-testid="trading-desk-chart" className={cn("overflow-hidden border border-[#16314a] bg-[#050b14] shadow-[0_0_0_1px_rgba(14,165,233,.08),0_24px_80px_rgba(0,0,0,.38)]", expanded ? "fixed inset-4 z-50 rounded-3xl" : "rounded-2xl")}>
      <div className="flex flex-wrap items-center gap-3 border-b border-[#102942] bg-[#07111f] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl border border-orange-400/30 bg-orange-500/10 text-orange-300"><BarChart3 className="size-5" /></div>
          <div>
            <div className="flex flex-wrap items-center gap-2 font-mono text-lg font-bold text-white"><span>{exchangeSymbolLabel(normalizedSymbol)}</span><span className="text-slate-600">·</span><span>{interval}</span><span className={change >= 0 ? "text-[#22ab94]" : "text-[#f23645]"}>{formatSignedPercent(change)}</span></div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <StatusBadge tone={chartFeedLive || connected ? "success" : connecting ? "warning" : "neutral"}>{chartFeedLive ? `Prix live ${marketTransport}` : connected ? `WebSocket ${transport}` : connecting ? "Connexion OHLC" : `Fallback ${transport}`}</StatusBadge>
              <span>{title}</span>
              <span>{agentName}{agentStrategy ? ` · ${agentStrategy}` : ""}{agentMode ? ` · ${agentMode}` : ""}</span>
              <span>OHLC + prix live · {candles.length} bougies · {marketTickUpdates} ticks prix</span>
              {chartLastUpdate ? <span>tick {new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(chartLastUpdate))}</span> : null}
            </div>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {latest ? <QuoteBox label="SELL" value={bid} tone="sell" /> : null}
          {latest ? <QuoteBox label="BUY" value={ask} tone="buy" /> : null}
          <div className="flex rounded-xl border border-[#16314a] bg-slate-950/50 p-1">
            <button onClick={() => setChartMode("agent")} className={cn("rounded-lg px-3 py-1.5 text-xs font-bold transition", chartMode === "agent" ? "bg-sky-500/20 text-sky-100" : "text-slate-400 hover:text-sky-200")}>Agent cockpit</button>
            <button onClick={() => setChartMode("tradingview")} className={cn("rounded-lg px-3 py-1.5 text-xs font-bold transition", chartMode === "tradingview" ? "bg-white text-slate-950" : "text-slate-400 hover:text-sky-200")}>TradingView engine</button>
          </div>
          {TOOLBAR_INTERVALS.map((item) => (
            <button key={item} onClick={() => { setIntervalValue(item); setAutoFollow(true); setOffsetFromRight(0); setVisibleCount(item === "1d" ? 170 : compact ? 96 : 150); queueViewportCommand(); }} className={cn("rounded-lg border px-3 py-1.5 text-xs font-semibold transition", item === interval ? "border-[#2962ff] bg-[#10224d] text-sky-100 shadow-[0_0_18px_rgba(41,98,255,.25)]" : "border-[#16314a] bg-white/[0.03] text-slate-400 hover:border-[#2962ff]/50 hover:text-sky-200")}>{item}</button>
          ))}
        </div>
      </div>

      <div className="relative">
        <ToolRail activeTool={activeTool} onSelect={handleToolSelect} onClear={clearAnnotations} locked={locked} onToggleLock={() => setLocked((value) => !value)} />
        <FloatingControls autoFollow={autoFollow} expanded={expanded} settingsOpen={visualSettingsOpen} onZoomIn={zoomIn} onZoomOut={zoomOut} onFit={fitWindow} onLive={goLive} onExpand={() => setExpanded((value) => !value)} onSettings={() => setVisualSettingsOpen((value) => !value)} />

        {visualSettingsOpen ? (
          <div className="absolute right-5 top-20 z-30 w-80 rounded-2xl border border-white/15 bg-[#020817]/95 p-4 text-sm text-slate-200 shadow-[0_24px_70px_rgba(0,0,0,.42)] backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="font-bold text-white">Paramètres visuels</div>
              <StatusBadge tone={annotations.length ? "info" : "neutral"}>{annotations.length} outil(s)</StatusBadge>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setChartMode("agent")} className={cn("rounded-xl border px-3 py-2 text-left text-xs font-semibold", chartMode === "agent" ? "border-sky-400/60 bg-sky-500/15 text-sky-100" : "border-[#16314a] bg-white/[0.03] text-slate-400")}>Agent cockpit</button>
              <button onClick={() => setChartMode("tradingview")} className={cn("rounded-xl border px-3 py-2 text-left text-xs font-semibold", chartMode === "tradingview" ? "border-sky-400/60 bg-sky-500/15 text-sky-100" : "border-[#16314a] bg-white/[0.03] text-slate-400")}>TradingView</button>
              <button onClick={() => setMagnetEnabled((value) => !value)} className={cn("rounded-xl border px-3 py-2 text-left text-xs font-semibold", magnetEnabled ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100" : "border-[#16314a] bg-white/[0.03] text-slate-400")}>Aimant {magnetEnabled ? "ON" : "OFF"}</button>
              <button onClick={clearAnnotations} className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-left text-xs font-semibold text-red-100">Effacer outils</button>
            </div>
            <div className="mt-3 rounded-xl border border-[#16314a] bg-white/[0.03] px-3 py-2 text-xs text-slate-400">
              Outil actif : {TOOL_ITEMS.find((item) => item.id === activeTool)?.label}. Les annotations sont locales au chart courant.
            </div>
          </div>
        ) : null}

        {chartMode === "agent" ? (
        <svg viewBox={`0 0 ${WIDTH} ${height}`} className={cn("block w-full cursor-crosshair select-none bg-[#050b14]", locked && "cursor-not-allowed")} style={{ minHeight: expanded ? "calc(100vh - 220px)" : compact ? 500 : 680 }} onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={() => { setHoverIndex(null); onMouseUp(); }} role="img" aria-label="Graphique chandeliers live avec instruments de trading">
          <defs>
            <linearGradient id="agent-chart-bg" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#08182a" stopOpacity="0.94" /><stop offset="100%" stopColor="#030711" stopOpacity="1" /></linearGradient>
            <linearGradient id="profit-zone-agent" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stopColor="#22ab94" stopOpacity="0.12" /><stop offset="100%" stopColor="#22ab94" stopOpacity="0.02" /></linearGradient>
            <linearGradient id="risk-zone-agent" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stopColor="#f23645" stopOpacity="0.12" /><stop offset="100%" stopColor="#f23645" stopOpacity="0.02" /></linearGradient>
            <filter id="label-glow"><feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#38bdf8" floodOpacity="0.35" /></filter>
          </defs>
          <rect x="0" y="0" width={WIDTH} height={height} fill="url(#agent-chart-bg)" />
          <rect x={chartLeft} y={top} width={chartWidth} height={chartHeight} rx="5" fill="#050a11" stroke="#102942" />
          <rect x={chartLeft} y={volumeTop} width={chartWidth} height={volumeHeight} rx="5" fill="#050a11" stroke="#102942" />
          <rect x={priceAxisLeft} y="0" width={WIDTH - priceAxisLeft} height={height} fill="#050811" opacity="0.92" />

          {hover ? (
            <g>
              <text x={chartLeft + 14} y="36" fill="#f8fafc" fontSize="16" fontWeight="900">{pairLabel(normalizedSymbol)}</text>
              <text x={chartLeft + 134} y="36" fill="#94a3b8" fontSize="12">O {formatPrice(hover.open)}</text>
              <text x={chartLeft + 242} y="36" fill="#94a3b8" fontSize="12">H {formatPrice(hover.high)}</text>
              <text x={chartLeft + 350} y="36" fill="#94a3b8" fontSize="12">L {formatPrice(hover.low)}</text>
              <text x={chartLeft + 458} y="36" fill={hover.close >= hover.open ? "#22ab94" : "#f23645"} fontSize="12" fontWeight="800">C {formatPrice(hover.close)}</text>
              <text x={chartLeft + 580} y="36" fill="#64748b" fontSize="12">Vol {formatCompact(hover.volume)}</text>
              <text x={chartLeft + 694} y="36" fill="#64748b" fontSize="12">{timeLabel(hover.time, interval)}</text>
            </g>
          ) : null}

          {[0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map((ratio) => {
            const y = top + ratio * chartHeight;
            const price = max - ratio * range;
            return <g key={ratio}><line x1={chartLeft} x2={chartRight} y1={y} y2={y} stroke={ratio === 0.5 ? "#1b4262" : "#102942"} strokeWidth="1" vectorEffect="non-scaling-stroke" /><text x={priceAxisLeft + 14} y={y + 4} fill="#7b8799" fontSize="11">{formatPrice(price)}</text></g>;
          })}
          {Array.from({ length: 14 }).map((_, index) => {
            const x = chartLeft + (chartWidth / 14) * index;
            return <line key={index} x1={x} x2={x} y1={top} y2={volumeTop + volumeHeight} stroke="#0e253a" strokeWidth="1" vectorEffect="non-scaling-stroke" />;
          })}

          {agentLevel ? (() => {
            const entryY = priceToY(agentLevel.entry, min, range, top, chartHeight);
            const stopY = priceToY(agentLevel.stopLoss, min, range, top, chartHeight);
            const tpY = priceToY(agentLevel.takeProfit, min, range, top, chartHeight);
            return <g><rect x={chartLeft} y={Math.min(entryY, tpY)} width={chartWidth} height={Math.abs(entryY - tpY)} fill="url(#profit-zone-agent)" /><rect x={chartLeft} y={Math.min(entryY, stopY)} width={chartWidth} height={Math.abs(entryY - stopY)} fill="url(#risk-zone-agent)" /></g>;
          })() : null}

          {visible.map((candle, index) => {
            const x = chartLeft + index * step + step / 2;
            const openY = priceToY(candle.open, min, range, top, chartHeight);
            const closeY = priceToY(candle.close, min, range, top, chartHeight);
            const highY = priceToY(candle.high, min, range, top, chartHeight);
            const lowY = priceToY(candle.low, min, range, top, chartHeight);
            const up = candle.close >= candle.open;
            const color = up ? "#22ab94" : "#f23645";
            const volumeH = (candle.volume / maxVolume) * (volumeHeight - 10);
            const volumeY = volumeTop + volumeHeight - volumeH;
            return (
              <g key={candle.time} opacity={index > visible.length - 2 && !candle.closed ? 0.78 : 1}>
                <line x1={x} x2={x} y1={highY} y2={lowY} stroke={color} strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
                <rect x={x - candleWidth / 2} y={Math.min(openY, closeY)} width={candleWidth} height={Math.max(2, Math.abs(closeY - openY))} rx="1" fill={up ? "#0f3f35" : "#4a1320"} stroke={color} strokeWidth="1.1" vectorEffect="non-scaling-stroke" />
                <rect x={x - candleWidth / 2} y={volumeY} width={candleWidth} height={volumeH} rx="1" fill={up ? "rgba(34,171,148,.46)" : "rgba(242,54,69,.42)"} />
                {index % Math.max(12, Math.round(visible.length / 8)) === 0 ? <text x={x} y={height - 16} fill="#64748b" fontSize="10" textAnchor="middle">{timeLabel(candle.time, interval)}</text> : null}
              </g>
            );
          })}

          {agentLevel ? <><LevelLine label="Entrée" value={agentLevel.entry} min={min} range={range} top={top} height={chartHeight} right={chartRight} /><LevelLine label="Stop" value={agentLevel.stopLoss} min={min} range={range} top={top} height={chartHeight} right={chartRight} /><LevelLine label="TP" value={agentLevel.takeProfit} min={min} range={range} top={top} height={chartHeight} right={chartRight} /></> : null}
          {annotations.map(renderAnnotation)}
          {renderDraftToolPoint()}

          {latest ? <g><line x1={chartLeft} x2={chartRight} y1={currentY} y2={currentY} stroke="#d1d5db" strokeDasharray="3 6" strokeOpacity="0.52" vectorEffect="non-scaling-stroke" /><rect x={priceAxisLeft + 10} y={currentY - 14} width="92" height="28" rx="7" fill={latest.close >= latest.open ? "#12372f" : "#3a1420"} stroke={latest.close >= latest.open ? "#22ab94" : "#f23645"} /><text x={priceAxisLeft + 20} y={currentY + 4} fill="#f8fafc" fontSize="11" fontWeight="900">{formatPrice(latest.close)}</text></g> : null}

          {agentLevel && visible.length > 40 ? [
            { i: Math.max(4, visible.length - 46), label: "Signal", color: "#38bdf8" },
            { i: Math.max(6, visible.length - 32), label: "Analyse", color: "#a78bfa" },
            { i: Math.max(8, visible.length - 20), label: "Risque", color: "#fbbf24" },
            { i: Math.max(10, visible.length - 9), label: agentLevel.decision === "proposition" ? "Plan" : agentLevel.decision, color: agentLevel.decision === "proposition" ? "#22ab94" : "#f23645" },
          ].map((marker) => {
            const candle = visible[marker.i];
            if (!candle) return null;
            const x = chartLeft + marker.i * step + step / 2;
            const y = priceToY(candle.close, min, range, top, chartHeight);
            return <g key={marker.label} filter="url(#label-glow)"><circle cx={x} cy={y} r="8" fill="#06111f" stroke={marker.color} strokeWidth="2" /><text x={x} y={y + 4} fill={marker.color} fontSize="8" textAnchor="middle" fontWeight="900">{marker.label.charAt(0)}</text><text x={x + 10} y={y - 10} fill={marker.color} fontSize="9" fontWeight="800">{marker.label}</text></g>;
          }) : null}

          {hover && hoverX !== null ? <g><line x1={hoverX} x2={hoverX} y1={top} y2={volumeTop + volumeHeight} stroke="#e2e8f0" strokeOpacity="0.32" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" /><line x1={chartLeft} x2={chartRight} y1={priceToY(hover.close, min, range, top, chartHeight)} y2={priceToY(hover.close, min, range, top, chartHeight)} stroke="#e2e8f0" strokeOpacity="0.24" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" /><rect x={Math.min(hoverX + 16, WIDTH - 326)} y={top + 14} width="270" height="116" rx="12" fill="rgba(3,7,18,.94)" stroke="#1e3a56" /><text x={Math.min(hoverX + 32, WIDTH - 310)} y={top + 40} fill="#e2e8f0" fontSize="12" fontWeight="900">{timeLabel(hover.time, interval)} · {pairLabel(normalizedSymbol)}</text><text x={Math.min(hoverX + 32, WIDTH - 310)} y={top + 66} fill="#94a3b8" fontSize="11">O {formatPrice(hover.open)}  H {formatPrice(hover.high)}</text><text x={Math.min(hoverX + 32, WIDTH - 310)} y={top + 88} fill="#94a3b8" fontSize="11">L {formatPrice(hover.low)}  C {formatPrice(hover.close)}</text><text x={Math.min(hoverX + 32, WIDTH - 310)} y={top + 108} fill="#38bdf8" fontSize="11">Volume {formatCompact(hover.volume)}</text></g> : null}
        </svg>
        ) : (
          <TradingViewEngineChart
            candles={candles}
            agentLevel={agentLevel}
            compact={compact}
            expanded={expanded}
            visibleCount={visibleCount}
            offsetFromRight={clampedOffset}
            autoFollow={autoFollow}
            locked={locked}
            viewportVersion={viewportVersion}
            annotations={annotations}
            draftToolPoint={draftToolPoint}
            activeTool={activeTool}
            onChartToolPoint={handleChartToolPoint}
            onDetachFromLive={() => setAutoFollow(false)}
          />
        )}

        <div className="pointer-events-none absolute bottom-5 left-20 z-20 flex max-w-[calc(100%-160px)] flex-wrap gap-2">
          <span className="rounded-lg border border-white/10 bg-[#02040a]/78 px-3 py-1.5 text-xs text-slate-300 backdrop-blur-md"><Layers3 className="mr-1 inline size-3" /> {chartMode === "agent" ? "Agent cockpit" : "TradingView engine"} · {TOOL_ITEMS.find((item) => item.id === activeTool)?.label}</span>
          <span className={cn("rounded-lg border px-3 py-1.5 text-xs backdrop-blur-md", autoFollow ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200" : "border-amber-400/30 bg-amber-500/10 text-amber-200")}>{autoFollow ? "Auto live" : "Vue libre"}</span>
          <span className={cn("rounded-lg border px-3 py-1.5 text-xs backdrop-blur-md", magnetEnabled ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-[#02040a]/78 text-slate-300")}>Aimant {magnetEnabled ? "ON" : "OFF"}</span>
          <span className="rounded-lg border border-white/10 bg-[#02040a]/78 px-3 py-1.5 text-xs text-slate-300 backdrop-blur-md">{annotations.length} annotation(s)</span>
          {isDrawableTool(activeTool) ? <span className="rounded-lg border border-sky-400/25 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-100 backdrop-blur-md">{draftToolPoint ? "2e point attendu" : "clic chart = poser l'outil"}</span> : null}
          <span className="rounded-lg border border-white/10 bg-[#02040a]/78 px-3 py-1.5 text-xs text-slate-300 backdrop-blur-md"><Activity className="mr-1 inline size-3" /> molette = zoom, drag = déplacement</span>
          <span className="rounded-lg border border-white/10 bg-[#02040a]/78 px-3 py-1.5 text-xs text-slate-300 backdrop-blur-md"><Eye className="mr-1 inline size-3" /> Agent overlay : entrée / stop / take profit</span>
          <span className="rounded-lg border border-white/10 bg-[#02040a]/78 px-3 py-1.5 text-xs text-slate-300 backdrop-blur-md">Fenêtre {visible.length}/{candles.length} bougies</span>
          <button onClick={() => pan(18)} className="pointer-events-auto rounded-lg border border-white/10 bg-[#02040a]/78 px-3 py-1.5 text-xs text-slate-300 backdrop-blur-md hover:text-white">◀ historique</button>
          <button onClick={() => pan(-18)} className="pointer-events-auto rounded-lg border border-white/10 bg-[#02040a]/78 px-3 py-1.5 text-xs text-slate-300 backdrop-blur-md hover:text-white">live ▶</button>
        </div>

        {!visible.length ? (
          <div className="absolute inset-0 z-30 grid place-items-center bg-[#02040a]/80 text-center backdrop-blur-sm">
            <div className="rounded-2xl border border-[#182235] bg-[#080d16] p-6">
              <div className="flex items-center justify-center gap-2 font-bold text-white">Flux OHLC en attente<InfoHint content="Le chart se remplit via /api/markets/candles, puis WebSocket configuré ou polling." /></div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 border-t border-[#102942] bg-[#06111f] p-3 xl:grid-cols-[0.8fr_1.2fr_1fr_1fr]">
        <MetricTile label="Prix live" value={formatPrice(latest?.close ?? 0)} tone={change >= 0 ? "success" : "danger"} />
        <div className="rounded-2xl border border-[#16314a] bg-[#071322] p-3">
          <div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2 font-bold text-white"><Zap className="size-4 text-violet-300" /> Proposition {agentName}</div><StatusBadge tone={agentLevel?.decision === "proposition" ? "success" : agentLevel?.decision === "bloque" ? "danger" : "warning"}>{agentLevel?.decision ?? "attente"}</StatusBadge></div>
          {agentLevel ? <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-sm"><span className="text-slate-400">Side</span><span className={agentLevel.side === "LONG" ? "font-mono text-[#22ab94]" : "font-mono text-[#f23645]"}>{agentLevel.side} · {agentLevel.confidence}%</span><span className="text-slate-400">Entrée</span><span className="font-mono text-[#7aa2ff]">{formatPrice(agentLevel.entry)}</span><span className="text-slate-400">SL / TP</span><span className="font-mono"><span className="text-[#f23645]">{formatPrice(agentLevel.stopLoss)}</span> <span className="text-slate-500">/</span> <span className="text-[#22ab94]">{formatPrice(agentLevel.takeProfit)}</span></span><span className="text-slate-400">R:R</span><span className="font-mono text-violet-300">{agentLevel.riskReward.toFixed(2)}</span></div> : <div className="text-sm text-slate-500">En attente de chandeliers live.</div>}
        </div>
        <div className="rounded-2xl border border-[#16314a] bg-[#071322] p-3">
          <div className="mb-2 flex items-center gap-2 font-bold text-white"><ShieldCheck className="size-4 text-[#22ab94]" /> Risque mesuré</div>
          {agentLevel ? <div className="space-y-2 text-sm"><div className="flex justify-between"><span className="text-slate-400">Distance stop</span><span className="font-mono text-[#f23645]">{((Math.abs(agentLevel.entry - agentLevel.stopLoss) / agentLevel.entry) * 100).toFixed(2)}%</span></div><div className="flex justify-between"><span className="text-slate-400">Distance TP</span><span className="font-mono text-[#22ab94]">{((Math.abs(agentLevel.takeProfit - agentLevel.entry) / agentLevel.entry) * 100).toFixed(2)}%</span></div><ProgressBar value={agentLevel.confidence} tone={agentLevel.confidence >= 70 ? "success" : "warning"} /></div> : null}
        </div>
        <div className="rounded-2xl border border-[#16314a] bg-[#071322] p-3">
          <div className="mb-2 flex items-center gap-2 font-bold text-white"><Eye className="size-4 text-sky-300" /> Décisions</div>
          <div className="space-y-1.5 text-xs text-slate-300">{relatedTrades.length ? relatedTrades.map((trade) => <div key={trade.id} className="flex items-center justify-between rounded-lg bg-white/[0.035] px-2 py-1.5"><span>{trade.tag}</span><span className={trade.status === "refused" ? "text-[#f23645]" : trade.pnl >= 0 ? "text-[#22ab94]" : "text-amber-300"}>{trade.status}</span></div>) : <span className="text-slate-500">Aucun trade journalisé.</span>}</div>
        </div>
      </div>
    </section>
  );
}
