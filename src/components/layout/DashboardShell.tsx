"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Main shell links use native navigation to keep data-heavy section changes immediate and reliable. */

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BrainCircuit, ChevronRight, Circle, Lock, Server } from "lucide-react";
import { navigation, topbarStatus } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/charts/charts";
import { LiveConnectionBadge, LiveMarketConnector, LivePagePulse, LiveTickerTape } from "@/components/live/LiveMarket";
import { KillSwitchButton } from "@/components/system/KillSwitchButton";
import { PaperRuntimeHeartbeat } from "@/components/system/PaperRuntimeHeartbeat";
import { RuntimeRouteAutoRefresh } from "@/components/system/RuntimeRouteAutoRefresh";
import { SystemIntegrityBanner } from "@/components/system/SystemIntegrityBanner";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [serverTime, setServerTime] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setServerTime(new Date());
    const frame = window.requestAnimationFrame(tick);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, []);

  const timeLabel = serverTime ? serverTime.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--";
  const dateLabel = serverTime ? serverTime.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "Synchronisation...";
  const routeIsActive = (href: string, matchHrefs: readonly string[] = []) => {
    if (href === "/") return pathname === "/";
    if (pathname === href || pathname.startsWith(`${href}/`)) return true;
    return matchHrefs.some((matchHref) => pathname === matchHref || pathname.startsWith(`${matchHref}/`));
  };

  return (
    <div className="min-h-screen bg-[#030916] text-slate-100">
      <LiveMarketConnector />
      <PaperRuntimeHeartbeat />
      <RuntimeRouteAutoRefresh />
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_0%,rgba(14,165,233,0.18),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(168,85,247,0.12),transparent_28%),linear-gradient(180deg,#06101d_0%,#020713_100%)]" />
      <aside className="fixed left-0 top-0 z-30 flex h-screen w-[244px] flex-col border-r border-[#16314a] bg-[#06111f]/92 px-3 py-5 backdrop-blur-xl">
        <a href="/" className="mb-6 flex items-center gap-3 px-3">
          <div className="grid size-11 place-items-center rounded-2xl border border-sky-400/40 bg-sky-500/10 text-sky-300 shadow-[0_0_30px_rgba(14,165,233,0.35)]">
            <BrainCircuit className="size-7" />
          </div>
          <div>
            <div className="text-lg font-bold text-white">Agent Trader AI</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-sky-400">cockpit</div>
          </div>
        </a>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {navigation.map((item) => {
            const active = routeIsActive(item.href, item.matchHrefs);
            const locked = item.status === "locked";
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm text-slate-300 transition-all hover:border-sky-400/30 hover:bg-sky-500/10 hover:text-sky-100",
                  locked && "text-slate-500 hover:border-slate-600/40 hover:bg-white/[0.025] hover:text-slate-300",
                  active && "border-sky-400/50 bg-sky-500/18 text-white shadow-[inset_3px_0_0_#0ea5e9,0_0_28px_rgba(14,165,233,0.16)]",
                  active && locked && "border-amber-400/35 bg-amber-500/10 text-amber-100 shadow-[inset_3px_0_0_#f59e0b,0_0_24px_rgba(245,158,11,0.12)]",
                )}
              >
                <Icon className="size-5 shrink-0" />
                <span className="truncate">{item.label}</span>
                {locked ? <Lock className="ml-auto size-3.5 text-slate-600 group-hover:text-amber-300" /> : active ? <ChevronRight className="ml-auto size-4 text-sky-300" /> : null}
              </a>
            );
          })}
        </nav>

        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-[#16314a] bg-white/[0.03] p-4 text-center">
            <div className="text-xs text-slate-400">Heure du serveur</div>
            <div className="font-mono text-2xl text-white">{timeLabel}</div>
            <div className="text-xs text-slate-500">{dateLabel}</div>
            <Sparkline color="#0ea5e9" />
          </div>
          <LiveConnectionBadge />
          <div className="px-3 font-mono text-xs text-slate-500">v1.8.2</div>
        </div>
      </aside>

      <div className="pl-[244px]">
        <header className="sticky top-0 z-20 border-b border-[#16314a] bg-[#06111f]/80 px-6 py-3 backdrop-blur-xl">
          <div className="flex items-center gap-4 rounded-2xl border border-[#16314a] bg-white/[0.03] px-4 py-2">
            <div className="flex min-w-[260px] items-center gap-3 text-sm text-slate-300">
              Agent connecté : <span className="flex items-center gap-2 font-semibold text-emerald-300"><Circle className="size-3 fill-current" />{topbarStatus.agent}</span>
            </div>
            <div className="flex overflow-hidden rounded-xl border border-red-500/40 bg-slate-950/80 text-sm">
              <span className="border-r border-sky-400/40 bg-sky-500/20 px-4 py-1.5 text-sky-200">Paper Trading</span>
              <span className="px-5 py-1.5 text-slate-400">Live</span>
            </div>
            <div className="h-7 w-px bg-[#1c3953]" />
            <div className="min-w-[210px] text-center text-sm text-slate-300">Capital alloué : <span className="font-mono font-bold text-sky-300">{topbarStatus.capital}</span></div>
            <div className="h-7 w-px bg-[#1c3953]" />
            <div className="text-sm text-slate-300">Mode autonome : <span className="rounded-lg border border-emerald-500/40 bg-emerald-500/12 px-2 py-1 font-semibold text-emerald-300">{topbarStatus.autonomy}</span></div>
            <div className="ml-auto flex items-center gap-3">
              <div className="hidden xl:block"><LiveConnectionBadge compact /></div>
              <div className="hidden items-center gap-2 rounded-xl border border-sky-500/20 bg-sky-500/8 px-3 py-2 text-xs text-sky-200 2xl:flex"><Server className="size-4" /> Sources API</div>
              <KillSwitchButton size="sm" />
            </div>
          </div>
          <SystemIntegrityBanner />
          <LiveTickerTape />
        </header>
        <main data-layout-scope="page" className="mx-auto max-w-[1720px] px-6 py-5">
          <LivePagePulse />
          <div className="mt-5">{children}</div>
        </main>
      </div>
    </div>
  );
}
