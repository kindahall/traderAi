"use client";

import { create } from "zustand";
import type { MarketCandle } from "@/types/trading";

type CandleKey = string;

type LiveCandleState = {
  activeKey: CandleKey;
  connected: boolean;
  connecting: boolean;
  transport: "websocket" | "polling" | "idle";
  lastUpdate: number | null;
  tickCount: number;
  error?: string;
  candlesByKey: Record<CandleKey, MarketCandle[]>;
  connect: (symbol: string, interval: string) => void;
  disconnect: () => void;
  applySnapshot: (symbol: string, interval: string, candles: MarketCandle[]) => void;
  applyCandle: (symbol: string, interval: string, candle: MarketCandle) => void;
};

const MAX_CANDLES = 220;
const CANDLE_STREAM_URL = process.env.NEXT_PUBLIC_CANDLE_STREAM_URL || "";
const CANDLE_POLL_INTERVAL_MS = intervalFromEnv(process.env.NEXT_PUBLIC_CANDLE_POLL_INTERVAL_MS, CANDLE_STREAM_URL ? 5000 : 2000, 1000);
let socket: WebSocket | null = null;
let pollingTimer: number | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempts = 0;
let currentSymbol = "BTCUSD";
let currentInterval = "1m";

function normalizeSymbol(symbol: string) {
  return symbol.toUpperCase().replace(/[^A-Z0-9]/g, "") || "BTCUSD";
}

function normalizeInterval(interval: string) {
  return interval.replace(/[^0-9a-zA-Z]/g, "") || "1m";
}

function intervalFromEnv(value: string | undefined, fallback: number, min: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(min, Math.round(parsed));
}

function keyFor(symbol: string, interval: string) {
  return `${normalizeSymbol(symbol)}:${normalizeInterval(interval)}`;
}

function streamUrl(symbol: string, interval: string) {
  if (!CANDLE_STREAM_URL) return "";
  const stream = `${normalizeSymbol(symbol).toLowerCase()}@kline_${normalizeInterval(interval)}`;
  if (CANDLE_STREAM_URL.includes("{stream}")) return CANDLE_STREAM_URL.replace("{stream}", stream);
  return `${CANDLE_STREAM_URL.replace(/\/$/, "")}/${stream}`;
}

function upsertCandle(existing: MarketCandle[], next: MarketCandle) {
  const withoutCurrent = existing.filter((candle) => candle.time !== next.time);
  return [...withoutCurrent, next].sort((a, b) => a.time - b.time).slice(-MAX_CANDLES);
}

async function fetchSnapshot(symbol: string, interval: string) {
  const response = await fetch(`/api/markets/candles?symbol=${encodeURIComponent(normalizeSymbol(symbol))}&interval=${encodeURIComponent(normalizeInterval(interval))}&limit=180`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Candles snapshot ${response.status}`);
  const payload = await response.json() as { candles?: MarketCandle[] };
  useLiveCandleStore.getState().applySnapshot(symbol, interval, payload.candles ?? []);
}

async function pollCandles() {
  try {
    await fetchSnapshot(currentSymbol, currentInterval);
    useLiveCandleStore.setState({ connected: false, connecting: false, transport: "polling", error: "WebSocket kline indisponible, polling actif" });
  } catch (error) {
    useLiveCandleStore.setState({ connected: false, connecting: false, transport: "idle", error: error instanceof Error ? error.message : "Candles unavailable" });
  }
}

function startPolling() {
  if (pollingTimer) return;
  void pollCandles();
  pollingTimer = window.setInterval(() => void pollCandles(), CANDLE_POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollingTimer) window.clearInterval(pollingTimer);
  pollingTimer = null;
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = Math.min(10_000, 1000 + reconnectAttempts * 1500);
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    reconnectAttempts += 1;
    useLiveCandleStore.getState().connect(currentSymbol, currentInterval);
  }, delay);
}

export const useLiveCandleStore = create<LiveCandleState>((set) => ({
  activeKey: keyFor(currentSymbol, currentInterval),
  connected: false,
  connecting: true,
  transport: "websocket",
  lastUpdate: null,
  tickCount: 0,
  candlesByKey: {},
  connect: (symbol, interval) => {
    if (typeof window === "undefined") return;

    const normalizedSymbol = normalizeSymbol(symbol);
    const normalizedInterval = normalizeInterval(interval);
    const nextKey = keyFor(normalizedSymbol, normalizedInterval);
    const socketAlreadyMatches = socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) && currentSymbol === normalizedSymbol && currentInterval === normalizedInterval;

    currentSymbol = normalizedSymbol;
    currentInterval = normalizedInterval;
    set({ activeKey: nextKey, connecting: true, transport: "websocket", error: undefined });
    void fetchSnapshot(normalizedSymbol, normalizedInterval);

    const nextStreamUrl = streamUrl(normalizedSymbol, normalizedInterval);
    if (!nextStreamUrl) {
      startPolling();
      return;
    }

    if (socketAlreadyMatches) return;
    socket?.close();
    socket = null;

    try {
      socket = new WebSocket(nextStreamUrl);
      socket.onopen = () => {
        reconnectAttempts = 0;
        stopPolling();
        set({ connected: true, connecting: false, transport: "websocket", error: undefined });
      };
      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as { k?: { t: number; o: string; h: string; l: string; c: string; v: string; x: boolean }; data?: { k?: { t: number; o: string; h: string; l: string; c: string; v: string; x: boolean } } };
        const kline = payload.k ?? payload.data?.k;
        if (!kline) return;
        const candle: MarketCandle = {
          time: Number(kline.t),
          open: Number(kline.o),
          high: Number(kline.h),
          low: Number(kline.l),
          close: Number(kline.c),
          volume: Number(kline.v),
          closed: Boolean(kline.x),
        };
        useLiveCandleStore.getState().applyCandle(normalizedSymbol, normalizedInterval, candle);
        set((state) => ({ connected: true, connecting: false, transport: "websocket", lastUpdate: Date.now(), tickCount: state.tickCount + 1 }));
      };
      socket.onerror = () => {
        set({ connected: false, connecting: false, error: "Erreur WebSocket kline" });
        startPolling();
      };
      socket.onclose = () => {
        set({ connected: false, connecting: false });
        startPolling();
        scheduleReconnect();
      };
    } catch (error) {
      set({ connected: false, connecting: false, error: error instanceof Error ? error.message : "WebSocket kline impossible" });
      startPolling();
    }
  },
  disconnect: () => {
    socket?.close();
    socket = null;
    stopPolling();
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
    set({ connected: false, connecting: false, transport: "idle" });
  },
  applySnapshot: (symbol, interval, candles) => {
    const nextKey = keyFor(symbol, interval);
    set((state) => ({
      lastUpdate: Date.now(),
      candlesByKey: {
        ...state.candlesByKey,
        [nextKey]: candles.slice(-MAX_CANDLES),
      },
    }));
  },
  applyCandle: (symbol, interval, candle) => {
    const nextKey = keyFor(symbol, interval);
    set((state) => ({
      candlesByKey: {
        ...state.candlesByKey,
        [nextKey]: upsertCandle(state.candlesByKey[nextKey] ?? [], candle),
      },
    }));
  },
}));

export { keyFor as liveCandleKey };
