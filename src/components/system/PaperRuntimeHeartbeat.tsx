"use client";

import { useCallback, useEffect, useRef } from "react";

type IntegrityPayload = {
  paperRuntime: {
    lastCycleAgeSeconds: number | null;
    status: "fresh" | "stale" | "empty";
    process: {
      alive: boolean;
    };
  };
  killSwitch: {
    active: boolean;
  };
};

const HEARTBEAT_INTERVAL_MS = 30_000;
const MIN_CYCLE_AGE_SECONDS = 24;
const LOCK_KEY = "agent-trader-paper-heartbeat";

function now() {
  return Date.now();
}

function canAcquireLock() {
  try {
    const previous = Number(window.localStorage.getItem(LOCK_KEY) || 0);
    if (previous && now() - previous < MIN_CYCLE_AGE_SECONDS * 1000) return false;
    window.localStorage.setItem(LOCK_KEY, String(now()));
    return true;
  } catch {
    return true;
  }
}

async function loadIntegrity() {
  const response = await fetch("/api/system/integrity", { cache: "no-store" });
  if (!response.ok) return null;
  return response.json() as Promise<IntegrityPayload>;
}

async function runPaperCycle() {
  await fetch("/api/paper-trading/cycle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  window.dispatchEvent(new Event("system-integrity-refresh"));
}

export function PaperRuntimeHeartbeat() {
  const runningRef = useRef(false);

  const tick = useCallback(async () => {
    if (runningRef.current || !canAcquireLock()) return;
    runningRef.current = true;
    try {
      const integrity = await loadIntegrity();
      if (!integrity || integrity.killSwitch.active) return;
      if (integrity.paperRuntime.process.alive) return;
      const age = integrity.paperRuntime.lastCycleAgeSeconds;
      if (age === null || age >= MIN_CYCLE_AGE_SECONDS || integrity.paperRuntime.status !== "fresh") {
        await runPaperCycle();
      }
    } finally {
      runningRef.current = false;
    }
  }, []);

  useEffect(() => {
    const firstTick = window.setTimeout(() => void tick(), 2_000);
    const timer = window.setInterval(() => void tick(), HEARTBEAT_INTERVAL_MS);
    return () => {
      window.clearTimeout(firstTick);
      window.clearInterval(timer);
    };
  }, [tick]);

  return null;
}
