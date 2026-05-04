"use client";

import { create } from "zustand";
import { DYDX_TOP_CRYPTO_SYMBOLS } from "@/lib/trading-universe";

export type LiveMarketTick = {
  symbol: string;
  pair: string;
  price: number;
  openPrice: number;
  change24h: number;
  volume: number;
  eventTime: number;
  direction: "up" | "down" | "flat";
  points: Array<{ label: string; price: number; volume: number }>;
};

type LiveMarketState = {
  connected: boolean;
  connecting: boolean;
  transport: "websocket" | "polling" | "idle";
  lastUpdate: number | null;
  tickCount: number;
  error?: string;
  trackedSymbols: string[] | null;
  ticks: Record<string, LiveMarketTick>;
  connect: () => void;
  disconnect: () => void;
  setTrackedSymbols: (symbols: string[] | null) => void;
  applySnapshot: (assets: Array<{ symbol: string; price: number; change24h: number; volume24h?: string }>) => void;
};

const DEFAULT_SYMBOLS = (process.env.NEXT_PUBLIC_MARKET_SYMBOLS || DYDX_TOP_CRYPTO_SYMBOLS.join(","))
  .split(",")
  .map((symbol) => symbol.trim().toLowerCase().replace("/", ""))
  .filter(Boolean);
const MARKET_STREAM_URL = process.env.NEXT_PUBLIC_MARKET_STREAM_URL || "";
const MARKET_STREAM_KIND = process.env.NEXT_PUBLIC_MARKET_STREAM_KIND || (MARKET_STREAM_URL ? "binance-mini-ticker" : "dydx-markets");
const DYDX_MARKETS_WS_URL = process.env.NEXT_PUBLIC_DYDX_MARKETS_WS_URL || "wss://indexer.dydx.trade/v4/ws";
const MAX_POINTS = 64;
const MARKET_POLL_INTERVAL_MS = intervalFromEnv(process.env.NEXT_PUBLIC_MARKET_POLL_INTERVAL_MS, MARKET_STREAM_KIND === "dydx-markets" ? 1200 : 3500, 500);
const DYDX_BACKFILL_INTERVAL_MS = intervalFromEnv(process.env.NEXT_PUBLIC_DYDX_MARKET_BACKFILL_MS, 2500, 1000);
let socket: WebSocket | null = null;
let fallbackTimer: number | null = null;
let backfillTimer: number | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempts = 0;
let subscribedTradeSymbols = new Set<string>();

type DydxMarket = {
  ticker: string;
  oraclePrice?: string;
  priceChange24H?: string;
  volume24H?: string;
};

type DydxOraclePrice = {
  oraclePrice?: string;
  effectiveAt?: string;
};

type DydxTrade = {
  price?: string;
  size?: string;
  createdAt?: string;
  side?: "BUY" | "SELL";
};

type DydxWsMessage = {
  type?: string;
  channel?: string;
  id?: string;
  contents?: {
    markets?: Record<string, DydxMarket>;
    oraclePrices?: Record<string, DydxOraclePrice>;
    trades?: DydxTrade[];
  } | Array<{
    oraclePrices?: Record<string, DydxOraclePrice>;
    trades?: DydxTrade[];
  }>;
};

function compactSymbol(symbol: string) {
  return symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function canonicalSymbol(symbol: string) {
  return compactSymbol(symbol).replace(/USDT$/, "USD").replace(/USDC$/, "USD");
}

function intervalFromEnv(value: string | undefined, fallback: number, min: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(min, Math.round(parsed));
}

function getTrackedSymbolSet() {
  const tracked = useLiveMarketStore.getState().trackedSymbols;
  const source = tracked?.length ? tracked : DEFAULT_SYMBOLS;
  const normalized = source.map(canonicalSymbol).filter(Boolean);
  return new Set(normalized);
}

function shouldTrackSymbol(symbol: string) {
  const tracked = getTrackedSymbolSet();
  return tracked.size === 0 || tracked.has("ALL") || tracked.has(canonicalSymbol(symbol));
}

function toPair(symbol: string) {
  const upper = compactSymbol(symbol);
  if (upper.endsWith("USDC")) return `${upper.slice(0, -4)}/USDC`;
  if (upper.endsWith("USDT")) return `${upper.slice(0, -4)}/USDT`;
  return upper.endsWith("USD") ? `${upper.slice(0, -3)}/USD` : upper;
}

function toDydxTicker(symbol: string) {
  const compact = canonicalSymbol(symbol);
  return compact.endsWith("USD") ? `${compact.slice(0, -3)}-USD` : "";
}

function trackedDydxTickers() {
  const tracked = useLiveMarketStore.getState().trackedSymbols;
  const source = tracked?.length && !tracked.includes("ALL") ? tracked : DEFAULT_SYMBOLS;
  return [...new Set(source.map(toDydxTicker).filter(Boolean))].slice(0, 20);
}

function syncDydxTradeSubscriptions() {
  if (MARKET_STREAM_KIND !== "dydx-markets") return;
  if (!socket || socket.readyState !== WebSocket.OPEN) return;

  trackedDydxTickers().forEach((ticker, index) => {
    if (subscribedTradeSymbols.has(ticker)) return;
    subscribedTradeSymbols.add(ticker);
    window.setTimeout(() => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "subscribe", channel: "v4_trades", id: ticker, batched: true }));
    }, index * 120);
  });
}

function getStreamUrl() {
  if (!MARKET_STREAM_URL) return "";
  const streams = DEFAULT_SYMBOLS.map((symbol) => `${symbol}@miniTicker`).join("/");
  return MARKET_STREAM_URL.includes("{streams}") ? MARKET_STREAM_URL.replace("{streams}", streams) : `${MARKET_STREAM_URL}?streams=${streams}`;
}

function parseVolume(value?: string) {
  if (!value) return 0;
  const normalized = value.replace("$", "").replace(",", ".").trim();
  const multiplier = normalized.includes("B") ? 1_000_000_000 : normalized.includes("M") ? 1_000_000 : normalized.includes("K") ? 1_000 : 1;
  return Number.parseFloat(normalized) * multiplier || 0;
}

function upsertTick(current: Record<string, LiveMarketTick>, next: Omit<LiveMarketTick, "direction" | "points">) {
  const symbol = compactSymbol(next.symbol);
  const previous = current[symbol];
  const direction: LiveMarketTick["direction"] = previous ? next.price > previous.price ? "up" : next.price < previous.price ? "down" : "flat" : "flat";
  const points = [...(previous?.points ?? []), { label: new Date(next.eventTime).toLocaleTimeString("fr-FR", { minute: "2-digit", second: "2-digit" }), price: next.price, volume: next.volume }].slice(-MAX_POINTS);

  return {
    ...current,
    [symbol]: {
      ...next,
      symbol,
      direction,
      points,
    },
  };
}

function priceChangeToPercent(price: number, absoluteChange: number) {
  const openPrice = price - absoluteChange;
  return openPrice ? (absoluteChange / openPrice) * 100 : 0;
}

function upsertDydxMarket(current: Record<string, LiveMarketTick>, market: DydxMarket, now = Date.now()) {
  const price = Number(market.oraclePrice);
  if (!market.ticker || !Number.isFinite(price) || price <= 0) return current;
  const absoluteChange = Number(market.priceChange24H || 0);
  const change24h = priceChangeToPercent(price, absoluteChange);
  const openPrice = change24h ? price / (1 + change24h / 100) : price;

  return upsertTick(current, {
    symbol: market.ticker,
    pair: toPair(market.ticker),
    price,
    openPrice,
    change24h,
    volume: Number(market.volume24H || 0),
    eventTime: now,
  });
}

function upsertDydxOraclePrice(current: Record<string, LiveMarketTick>, ticker: string, oraclePrice: DydxOraclePrice) {
  const price = Number(oraclePrice.oraclePrice);
  if (!Number.isFinite(price) || price <= 0) return current;

  const key = compactSymbol(ticker);
  const previous = current[key];
  const eventTime = oraclePrice.effectiveAt ? Date.parse(oraclePrice.effectiveAt) || Date.now() : Date.now();

  return upsertTick(current, {
    symbol: ticker,
    pair: previous?.pair ?? toPair(ticker),
    price,
    openPrice: previous?.openPrice ?? price,
    change24h: previous?.change24h ?? 0,
    volume: previous?.volume ?? 0,
    eventTime,
  });
}

function upsertDydxTrade(current: Record<string, LiveMarketTick>, ticker: string, trade: DydxTrade) {
  const price = Number(trade.price);
  if (!Number.isFinite(price) || price <= 0) return current;

  const key = compactSymbol(ticker);
  const previous = current[key];
  const eventTime = trade.createdAt ? Date.parse(trade.createdAt) || Date.now() : Date.now();

  return upsertTick(current, {
    symbol: ticker,
    pair: previous?.pair ?? toPair(ticker),
    price,
    openPrice: previous?.openPrice ?? price,
    change24h: previous?.change24h ?? 0,
    volume: previous?.volume ?? Number(trade.size || 0) * price,
    eventTime,
  });
}

function applyDydxMarkets(markets: Record<string, DydxMarket>) {
  const now = Date.now();
  const filtered = Object.values(markets).filter((market) => shouldTrackSymbol(market.ticker));
  if (!filtered.length) return;
  useLiveMarketStore.setState((state) => ({
    connected: true,
    connecting: false,
    transport: "websocket",
    lastUpdate: now,
    tickCount: state.tickCount + filtered.length,
    error: undefined,
    ticks: filtered.reduce((current, market) => upsertDydxMarket(current, market, now), state.ticks),
  }));
}

function applyDydxTrades(ticker: string | undefined, trades: DydxTrade[] | undefined, initialSnapshot = false) {
  if (!ticker || !trades?.length || !shouldTrackSymbol(ticker)) return;
  const sortedTrades = trades
    .filter((trade) => Number.isFinite(Number(trade.price)) && Number(trade.price) > 0)
    .toSorted((a, b) => (Date.parse(a.createdAt || "") || 0) - (Date.parse(b.createdAt || "") || 0));
  const updates = initialSnapshot ? sortedTrades.slice(-1) : sortedTrades;
  if (!updates.length) return;
  const latestEventTime = updates.reduce((latest, trade) => Math.max(latest, Date.parse(trade.createdAt || "") || 0), Date.now());

  useLiveMarketStore.setState((state) => ({
    connected: true,
    connecting: false,
    transport: "websocket",
    lastUpdate: latestEventTime || Date.now(),
    tickCount: state.tickCount + updates.length,
    error: undefined,
    ticks: updates.reduce((current, trade) => upsertDydxTrade(current, ticker, trade), state.ticks),
  }));
}

function applyDydxOraclePrices(oraclePrices: Record<string, DydxOraclePrice>) {
  const entries = Object.entries(oraclePrices).filter(([ticker]) => shouldTrackSymbol(ticker));
  if (!entries.length) return;
  const latestEventTime = entries.reduce((latest, [, price]) => {
    const time = price.effectiveAt ? Date.parse(price.effectiveAt) || 0 : 0;
    return Math.max(latest, time);
  }, Date.now());

  useLiveMarketStore.setState((state) => ({
    connected: true,
    connecting: false,
    transport: "websocket",
    lastUpdate: latestEventTime || Date.now(),
    tickCount: state.tickCount + entries.length,
    error: undefined,
    ticks: entries.reduce((current, [ticker, oraclePrice]) => upsertDydxOraclePrice(current, ticker, oraclePrice), state.ticks),
  }));
}

function handleDydxMessage(message: DydxWsMessage) {
  if (message.type === "connected") {
    socket?.send(JSON.stringify({ type: "subscribe", channel: "v4_markets", batched: true }));
    subscribedTradeSymbols = new Set<string>();
    syncDydxTradeSubscriptions();
    return;
  }

  if (message.channel === "v4_trades") {
    const contents = message.contents;
    if (Array.isArray(contents)) {
      contents.forEach((item) => applyDydxTrades(message.id, item.trades, false));
      return;
    }
    applyDydxTrades(message.id, contents?.trades, message.type === "subscribed");
    return;
  }

  if (message.channel !== "v4_markets") return;

  const contents = message.contents;
  if (Array.isArray(contents)) {
    contents.forEach((item) => {
      if (item.oraclePrices) applyDydxOraclePrices(item.oraclePrices);
    });
    return;
  }

  if (contents?.markets) applyDydxMarkets(contents.markets);
  if (contents?.oraclePrices) applyDydxOraclePrices(contents.oraclePrices);
}

function connectDydxMarketsSocket() {
  socket = new WebSocket(DYDX_MARKETS_WS_URL);
  socket.onopen = () => {
    reconnectAttempts = 0;
    stopFallbackPolling();
    startDydxBackfillPolling();
    useLiveMarketStore.setState({ connected: true, connecting: true, transport: "websocket", error: undefined });
  };
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data) as DydxWsMessage;
    handleDydxMessage(message);
  };
  socket.onerror = () => {
    stopDydxBackfillPolling();
    useLiveMarketStore.setState({ connected: false, connecting: false, error: "Erreur WebSocket dYdX" });
    startFallbackPolling();
  };
  socket.onclose = () => {
    stopDydxBackfillPolling();
    useLiveMarketStore.setState({ connected: false, connecting: false });
    subscribedTradeSymbols = new Set<string>();
    startFallbackPolling();
    scheduleReconnect();
  };
}

function connectMiniTickerSocket(streamUrl: string) {
  socket = new WebSocket(streamUrl);
  socket.onopen = () => {
    reconnectAttempts = 0;
    stopFallbackPolling();
    useLiveMarketStore.setState({ connected: true, connecting: false, transport: "websocket", error: undefined });
  };
  socket.onmessage = (event) => {
    const payload = JSON.parse(event.data) as { data?: { s: string; c: string; o: string; v: string; E: number } };
    const data = payload.data;
    if (!data?.s || !data?.c) return;

    const price = Number(data.c);
    const openPrice = Number(data.o) || price;
    const volume = Number(data.v) || 0;
    const eventTime = data.E || Date.now();
    const change24h = openPrice ? ((price - openPrice) / openPrice) * 100 : 0;

    useLiveMarketStore.setState((state) => ({
      connected: true,
      connecting: false,
      transport: "websocket",
      lastUpdate: eventTime,
      tickCount: state.tickCount + 1,
      ticks: upsertTick(state.ticks, {
        symbol: data.s,
        pair: toPair(data.s),
        price,
        openPrice,
        change24h,
        volume,
        eventTime,
      }),
    }));
  };
  socket.onerror = () => {
    useLiveMarketStore.setState({ connected: false, connecting: false, error: "Erreur WebSocket marché" });
    startFallbackPolling();
  };
  socket.onclose = () => {
    useLiveMarketStore.setState({ connected: false, connecting: false });
    startFallbackPolling();
    scheduleReconnect();
  };
}

async function pollMarkets() {
  try {
    await hydrateMarketSnapshot();
    useLiveMarketStore.setState({ connected: false, connecting: false, transport: "polling", error: "WebSocket indisponible, polling actif" });
  } catch (error) {
    useLiveMarketStore.setState({ connected: false, connecting: false, transport: "idle", error: error instanceof Error ? error.message : "Flux marché indisponible" });
  }
}

async function hydrateMarketSnapshot() {
  const response = await fetch("/api/markets", { cache: "no-store" });
  if (!response.ok) throw new Error(`Market snapshot ${response.status}`);
  const payload = await response.json() as { assets?: Array<{ symbol: string; price: number; change24h: number; volume24h?: string }> };
  useLiveMarketStore.getState().applySnapshot(payload.assets ?? []);
}

async function backfillMarkets() {
  try {
    await hydrateMarketSnapshot();
  } catch {
    // Le WebSocket reste la source principale; le backfill ne doit pas couper le flux live.
  }
}

function startDydxBackfillPolling() {
  if (MARKET_STREAM_KIND !== "dydx-markets" || backfillTimer) return;
  void backfillMarkets();
  backfillTimer = window.setInterval(() => void backfillMarkets(), DYDX_BACKFILL_INTERVAL_MS);
}

function stopDydxBackfillPolling() {
  if (backfillTimer) window.clearInterval(backfillTimer);
  backfillTimer = null;
}

function startFallbackPolling() {
  if (fallbackTimer) return;
  void pollMarkets();
  fallbackTimer = window.setInterval(() => void pollMarkets(), MARKET_POLL_INTERVAL_MS);
}

function stopFallbackPolling() {
  if (fallbackTimer) window.clearInterval(fallbackTimer);
  fallbackTimer = null;
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = Math.min(10_000, 1000 + reconnectAttempts * 1500);
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    reconnectAttempts += 1;
    useLiveMarketStore.getState().connect();
  }, delay);
}

export const useLiveMarketStore = create<LiveMarketState>((set) => ({
  connected: false,
  connecting: true,
  transport: "websocket",
  lastUpdate: null,
  tickCount: 0,
  trackedSymbols: null,
  ticks: {},
  connect: () => {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
    if (typeof window === "undefined") return;

    set({ connecting: true, transport: "websocket", error: undefined });
    void hydrateMarketSnapshot();

    if (MARKET_STREAM_KIND === "polling") {
      startFallbackPolling();
      return;
    }

    if (MARKET_STREAM_KIND === "dydx-markets") {
      try {
        connectDydxMarketsSocket();
      } catch (error) {
        set({ connected: false, connecting: false, error: error instanceof Error ? error.message : "WebSocket dYdX impossible" });
        startFallbackPolling();
      }
      return;
    }

    const streamUrl = getStreamUrl();
    if (!streamUrl) {
      startFallbackPolling();
      return;
    }

    try {
      connectMiniTickerSocket(streamUrl);
    } catch (error) {
      set({ connected: false, connecting: false, error: error instanceof Error ? error.message : "WebSocket impossible" });
      startFallbackPolling();
    }
  },
  disconnect: () => {
    socket?.close();
    socket = null;
    stopFallbackPolling();
    stopDydxBackfillPolling();
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
    set({ connected: false, connecting: false, transport: "idle" });
  },
  setTrackedSymbols: (symbols) => {
    const trackedSymbols = symbols?.map(canonicalSymbol).filter(Boolean) ?? null;
    const tracked = new Set(trackedSymbols ?? DEFAULT_SYMBOLS.map(canonicalSymbol));
    set((state) => ({
      trackedSymbols,
      ticks: Object.fromEntries(Object.entries(state.ticks).filter(([symbol]) => tracked.size === 0 || tracked.has("ALL") || tracked.has(canonicalSymbol(symbol)))),
    }));
    syncDydxTradeSubscriptions();
  },
  applySnapshot: (assets) => {
    const now = Date.now();
    const filteredAssets = assets.filter((asset) => shouldTrackSymbol(asset.symbol));
    set((state) => ({
      lastUpdate: now,
      tickCount: state.tickCount + filteredAssets.length,
      ticks: filteredAssets.reduce((current, asset) => {
        const symbol = compactSymbol(asset.symbol);
        const price = Number(asset.price);
        const change24h = Number(asset.change24h) || 0;
        const openPrice = change24h ? price / (1 + change24h / 100) : price;
        return upsertTick(current, {
          symbol,
          pair: asset.symbol,
          price,
          openPrice,
          change24h,
          volume: parseVolume(asset.volume24h),
          eventTime: now,
        });
      }, state.ticks),
    }));
  },
}));
