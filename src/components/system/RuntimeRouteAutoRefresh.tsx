"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

const REFRESH_INTERVAL_MS = 60_000;
const MIN_REFRESH_GAP_MS = 15_000;
const USER_INTERACTION_QUIET_MS = 3_000;

function shouldRefreshPath(pathname: string) {
  return Boolean(pathname) && !pathname.startsWith("/api");
}

export function RuntimeRouteAutoRefresh() {
  const pathname = usePathname();
  const router = useRouter();
  const lastRefreshRef = useRef(0);
  const lastInteractionRef = useRef(0);
  const pendingRef = useRef<number | null>(null);

  const refresh = useCallback(() => {
    if (!shouldRefreshPath(pathname)) return;
    if (document.visibilityState === "hidden") return;
    if (Date.now() - lastInteractionRef.current < USER_INTERACTION_QUIET_MS) return;
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
    const markInteraction = () => {
      lastInteractionRef.current = Date.now();
    };
    const timer = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    document.addEventListener("pointerdown", markInteraction, true);
    document.addEventListener("keydown", markInteraction, true);
    window.addEventListener("paper-runtime-cycle", scheduleRefresh);
    window.addEventListener("system-integrity-refresh", scheduleRefresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("pointerdown", markInteraction, true);
      document.removeEventListener("keydown", markInteraction, true);
      window.removeEventListener("paper-runtime-cycle", scheduleRefresh);
      window.removeEventListener("system-integrity-refresh", scheduleRefresh);
      if (pendingRef.current !== null) window.clearTimeout(pendingRef.current);
    };
  }, [refresh, scheduleRefresh]);

  return null;
}
