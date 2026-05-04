"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { useLiveMarketStore } from "@/lib/live-market-store";

const REFRESH_INTERVAL_MS = 12_000;
const MIN_REFRESH_GAP_MS = 2_500;

function shouldRefreshPath(pathname: string) {
  return Boolean(pathname) && !pathname.startsWith("/api");
}

export function RuntimeRouteAutoRefresh() {
  const pathname = usePathname();
  const router = useRouter();
  const marketLastUpdate = useLiveMarketStore((state) => state.lastUpdate);
  const lastRefreshRef = useRef(0);
  const pendingRef = useRef<number | null>(null);

  const refresh = useCallback(() => {
    if (!shouldRefreshPath(pathname)) return;
    if (document.visibilityState === "hidden") return;
    const elapsed = Date.now() - lastRefreshRef.current;
    if (elapsed < MIN_REFRESH_GAP_MS) return;
    lastRefreshRef.current = Date.now();
    router.refresh();
  }, [pathname, router]);

  const scheduleRefresh = useCallback(() => {
    if (pendingRef.current !== null) return;
    pendingRef.current = window.setTimeout(() => {
      pendingRef.current = null;
      refresh();
    }, 350);
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    window.addEventListener("paper-runtime-cycle", scheduleRefresh);
    window.addEventListener("system-integrity-refresh", scheduleRefresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("paper-runtime-cycle", scheduleRefresh);
      window.removeEventListener("system-integrity-refresh", scheduleRefresh);
      if (pendingRef.current !== null) window.clearTimeout(pendingRef.current);
    };
  }, [refresh, scheduleRefresh]);

  useEffect(() => {
    if (!marketLastUpdate) return;
    scheduleRefresh();
  }, [marketLastUpdate, scheduleRefresh]);

  return null;
}
