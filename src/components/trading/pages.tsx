/* eslint-disable @typescript-eslint/no-unused-vars */
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  BookOpenCheck,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Cloud,
  Download,
  Eye,
  FileText,
  Gauge,
  LineChart,
  Lock,
  Play,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Shield,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  Target,
  UserCheck,
  WalletCards,
  XCircle,
} from "lucide-react";
import type { MarketAsset, Trade } from "@/types/trading";
import { getAppData, type AppDataSnapshot } from "@/server/app-data";
import { readLocalAnalysisProviderConfig } from "@/server/analysis/local-provider";
import { readPaperAgentRoutingConfig } from "@/server/paper-trading/agent-routing-store";
import { readTradingAllocationConfig } from "@/server/trading/allocation-store";
import { DISCLAIMERS } from "@/lib/constants";
import { formatPercent, signed } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checklist, DataTable, DisclaimerBar, FilterBar, GlassCard, InfoHint, KpiCard, MetricGauge, ProgressBar, SectionTitle, StatusBadge, Stepper, Timeline, TogglePill } from "@/components/ui/dashboard";
import { TabbedContent, TabbedPanel } from "@/components/ui/tabbed-content";
import { AIArchitectWorkspace } from "@/components/architect/AIArchitectWorkspace";
import { LLMProviderTabs } from "@/components/llm/LLMProviderTabs";
import { LLMLiveInsight } from "@/components/llm/LLMLiveInsight";
import { LiveMarketBoard } from "@/components/live/LiveMarket";
import { OpenClawRuntimeWorkspace } from "@/components/openclaw/OpenClawRuntimeWorkspace";
import { SettingsWorkspace } from "@/components/settings/SettingsWorkspace";
import { KillSwitchButton } from "@/components/system/KillSwitchButton";
import { LocalActionButton } from "@/components/system/LocalActionButton";
import { PageRefreshButton } from "@/components/system/PageRefreshButton";
import { AlertCenterWorkspace } from "@/components/trading/AlertCenterWorkspace";
import { AgentsWorkspace } from "@/components/trading/AgentsWorkspace";
import { BacktestsWorkspace } from "@/components/trading/BacktestsWorkspace";
import { CapitalProgressWorkspace } from "@/components/trading/CapitalProgressWorkspace";
import { CrisisSimulatorWorkspace } from "@/components/trading/CrisisSimulatorWorkspace";
import { DecisionReplayWorkspace } from "@/components/trading/DecisionReplayWorkspace";
import { HumanValidationWorkspace } from "@/components/trading/HumanValidationWorkspace";
import { JournalWorkspace } from "@/components/trading/JournalWorkspace";
import { MarketsWorkspace } from "@/components/trading/MarketsWorkspace";
import { OverviewMarketPanel } from "@/components/trading/OverviewMarketPanel";
import { RuleLibraryWorkspace } from "@/components/trading/RuleLibraryWorkspace";
import { StrategiesWorkspace } from "@/components/trading/StrategiesWorkspace";
import { TradingDeskChart } from "@/components/trading/TradingDeskChart";
import { Donut, EquityCurve, HeatmapGrid, MultiLineScores, PerformanceBars, RadarScore, ResultDistribution, Sparkline } from "@/components/charts/charts";
import { getOpenClawConnectorConfig } from "@/server/openclaw/client";
import { getOpenClawContextSources } from "@/server/openclaw/context";
import { readOpenClawRolePolicy } from "@/server/openclaw/policy-store";
import type { OpenClawRuntimeSnapshot } from "@/types/openclaw";

type StrategiesTab = "library" | "builder" | "backtests" | "architect";
type JournalTab = "log" | "replay" | "postmortem";
type RiskTab = "limits" | "alerts" | "rules" | "validation" | "stress" | "kill";
type SettingsTab = "general" | "llm" | "openclaw";
type CapitalTab = "progress" | "maturity";
type RouteTab = {
  id: string;
  label: string;
  href: string;
  badge?: string;
  tone?: TruthTone;
  icon?: React.ReactNode;
};

function PageActions({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 flex flex-wrap justify-end gap-2">{children}</div>;
}

function LockedAction({ children, title = "Action non reliée au backend", ...props }: React.ComponentProps<typeof Button>) {
  return <Button {...props} disabled title={title}>{children}</Button>;
}

async function buildOpenClawRuntimeSnapshot(): Promise<OpenClawRuntimeSnapshot> {
  const config = getOpenClawConnectorConfig();
  const rolePolicy = await readOpenClawRolePolicy();
  const configured = Boolean(config.gatewayUrl && (config.authMode === "none" || (config.authMode === "token" && config.tokenConfigured) || (config.authMode === "password" && config.passwordConfigured)));

  return {
    config,
    status: {
      state: configured ? "configured" : "missing_config",
      configured,
      gatewayUrl: config.gatewayUrl,
      authMode: config.authMode,
      defaultAgentId: config.defaultAgentId,
      message: configured ? "Configuration prête à tester" : "Configuration OpenClaw incomplète",
    },
    agents: [],
    rolePolicy,
    dataSources: getOpenClawContextSources(),
    logs: [],
  };
}

function CardTitle({ icon, title, action, hint }: { icon?: React.ReactNode; title: string; action?: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-base font-bold text-white">{icon ? <span className="text-sky-300">{icon}</span> : null}{title}{hint ? <InfoHint content={hint} /> : null}</div>
      {action}
    </div>
  );
}

function FieldRows({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <div className="divide-y divide-[#16314a] text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-4 py-2">
          <span className="text-slate-400">{label}</span>
          <span className="text-right font-medium text-slate-100">{value}</span>
        </div>
      ))}
    </div>
  );
}

function Tags({ items, tone = "info" }: { items: string[]; tone?: "success" | "danger" | "warning" | "info" | "ai" | "neutral" }) {
  return <div className="flex flex-wrap gap-2">{items.map((item) => <StatusBadge key={item} tone={tone}>{item}</StatusBadge>)}</div>;
}

type TruthTone = "success" | "danger" | "warning" | "info" | "ai" | "neutral";

function TruthStrip({ items }: { items: Array<[string, string, TruthTone]> }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[#16314a] bg-slate-950/45 px-3 py-2 text-xs text-slate-300">
      <span className="font-semibold text-sky-200">Mode vérité</span>
      {items.map(([label, value, tone]) => (
        <StatusBadge key={`${label}-${value}`} tone={tone}>{label} · {value}</StatusBadge>
      ))}
    </div>
  );
}

function RouteTabs({ activeId, tabs }: { activeId: string; tabs: RouteTab[] }) {
  return (
    <div className="mb-4 rounded-2xl border border-[#16314a] bg-slate-950/60 p-2 shadow-[0_18px_48px_rgba(0,0,0,0.22)] backdrop-blur-xl">
      <div className="flex gap-2 overflow-x-auto" role="tablist">
        {tabs.map((tab) => {
          const selected = tab.id === activeId;

          return (
            <Link
              aria-selected={selected}
              className={cn(
                "inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition",
                selected ? "border-sky-400/70 bg-sky-500/18 text-white shadow-[0_0_22px_rgba(14,165,233,0.16)]" : "border-transparent bg-white/[0.025] text-slate-300 hover:border-sky-400/40 hover:text-sky-100",
              )}
              href={tab.href}
              key={tab.id}
              prefetch={false}
              role="tab"
            >
              {tab.icon ? <span className="shrink-0 text-sky-300">{tab.icon}</span> : null}
              <span>{tab.label}</span>
              {tab.badge ? <StatusBadge className="px-1.5 py-0.5" tone={tab.tone ?? "neutral"}>{tab.badge}</StatusBadge> : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function FormBox({ title, index, children, className }: { title: string; index?: number; children: React.ReactNode; className?: string }) {
  return (
    <GlassCard className={className}>
      <CardTitle title={`${index ? `${index}. ` : ""}${title}`} />
      {children}
    </GlassCard>
  );
}

function TextInput({ label, value, locked = false }: { label: string; value: string; locked?: boolean }) {
  return (
    <label className="block text-xs text-slate-400">
      {label}
      <div className="mt-1 flex h-10 items-center justify-between rounded-xl border border-[#1b3a55] bg-slate-950/50 px-3 text-sm text-slate-200">
        <span>{value}</span>
        {locked ? <Lock className="size-4 text-slate-500" /> : null}
      </div>
    </label>
  );
}

function ToggleRow({ label, active = true, detail }: { label: string; active?: boolean; detail?: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl border border-[#16314a] bg-white/[0.025] px-3 py-2 text-sm"><span className="flex items-center gap-2 text-slate-200">{label}{detail ? <InfoHint content={detail} /> : null}</span><TogglePill active={active} disabled /></div>;
}

function SliderRow({ label, value, tone = "info" }: { label: string; value: number; tone?: "success" | "danger" | "warning" | "info" | "ai" | "neutral" }) {
  const displayValue = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: value > 0 && value < 10 ? 1 : 0 }).format(value);
  return <div className="space-y-1"><div className="flex justify-between text-sm"><span className="text-slate-300">{label}</span><span className="font-mono text-white">{displayValue}%</span></div><ProgressBar value={value} tone={tone} /></div>;
}

function OverviewMetricTile({ label, value, delta, tone, icon, children }: { label: string; value: string; delta: string; tone: "success" | "danger" | "warning" | "info" | "ai"; icon?: React.ReactNode; children?: React.ReactNode }) {
  const toneClass = {
    success: "border-emerald-400/25 from-emerald-500/12 text-emerald-300",
    danger: "border-red-400/25 from-red-500/12 text-red-300",
    warning: "border-amber-400/25 from-amber-500/12 text-amber-300",
    info: "border-sky-400/25 from-sky-500/12 text-sky-300",
    ai: "border-violet-400/25 from-violet-500/12 text-violet-300",
  }[tone];

  return (
    <section data-layout-card="true" className={cn("relative overflow-hidden rounded-3xl border bg-[linear-gradient(145deg,var(--tw-gradient-from),rgba(5,16,31,0.9)_45%,rgba(2,8,19,0.96))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_48px_rgba(0,0,0,0.24)]", toneClass)}>
      <div className="absolute -right-8 -top-10 size-28 rounded-full bg-current opacity-[0.08] blur-2xl" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
          <div className="mt-2 truncate font-mono text-3xl font-black text-white">{value}</div>
          <div className="mt-2 inline-flex rounded-lg border border-current/15 bg-current/8 px-2 py-1 text-[11px] font-semibold">{delta}</div>
        </div>
        {icon ? <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-current/25 bg-current/10">{icon}</div> : null}
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}

function CompactActionFeed({ trades, primarySymbol, primaryChange }: { trades: Trade[]; primarySymbol: string; primaryChange: number }) {
  const items = [
    ...trades.slice(0, 4).map((trade) => ({
      key: trade.id,
      title: `${trade.asset} · ${trade.status}`,
      time: trade.time,
      detail: trade.initialReason,
      tone: trade.status === "refused" ? "danger" as const : trade.pnl >= 0 ? "success" as const : "warning" as const,
    })),
    {
      key: "live-market",
      title: `${primarySymbol} ${primaryChange}%`,
      time: "live",
      detail: "Dernier mouvement marché",
      tone: primaryChange >= 0 ? "success" as const : "danger" as const,
    },
  ];

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={item.key} className="flex items-center gap-3 rounded-2xl border border-[#16314a] bg-white/[0.025] px-3 py-2">
          <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border font-mono text-xs", item.tone === "success" && "border-emerald-400/35 bg-emerald-500/10 text-emerald-300", item.tone === "danger" && "border-red-400/35 bg-red-500/10 text-red-300", item.tone === "warning" && "border-amber-400/35 bg-amber-500/10 text-amber-300")}>{index + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-white">{item.title}</div>
            <div className="font-mono text-[11px] text-slate-500">{item.time}</div>
          </div>
          <InfoHint content={item.detail} />
        </div>
      ))}
    </div>
  );
}

function ageLabel(seconds: number | null) {
  if (seconds === null) return "aucun cycle";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m${String(seconds % 60).padStart(2, "0")}`;
}

function timeLabel(iso: string | null) {
  if (!iso) return "--:--:--";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export async function OverviewPage() {
  const { agents, marketAssets, priceSeries, monthlyHeatmap, resultDistribution, strategies, strategyComparison, replaySteps, trades, alerts, riskLimits, riskRules, allLlmProviders, llmRoleConfig, crisisScenarios, crisisTimeline, maturityScores, scoreEvolution, validationRequests, weeklyBars, weeklyLessons, sourceStatus, metrics } = await getAppData();

  const recentTrades = trades.slice(0, 5);
  const primaryAsset = metrics.market.primaryAsset;
  const latestTrade = metrics.trade.latest;
  const learningScore = metrics.maturity.globalScore;
  const frequentError = weeklyLessons.repeated[0] ?? "Aucune erreur répétée détectée";
  const dailyLesson = weeklyLessons.adjustments[0] ?? "Maintenir les garde-fous actuels";
  return (
    <>
      <SectionTitle title="Vue d'ensemble" subtitle="Cockpit principal de supervision de l'agent autonome Alpha-01." icon={<BrainCircuit />} />
      <TruthStrip items={[["Marchés", sourceStatus.market === "connected" ? "dYdX live" : "indisponible", sourceStatus.market === "connected" ? "success" : "danger"], ["Journal", `${metrics.trade.total} trades paper`, metrics.trade.total ? "success" : "warning"], ["Risque", "calculé runtime", "info"], ["Live", sourceStatus.trading === "live-enabled" ? "non exécuté" : "verrouillé", "danger"]]} />
      <div className="grid grid-cols-6 gap-3">
        <OverviewMetricTile label="P&L net" value={signed(metrics.trade.pnlTotal, " $")} delta={`${metrics.trade.closed} trades clos`} tone={metrics.trade.pnlTotal >= 0 ? "success" : "danger"}><Sparkline data={priceSeries.slice(-18)} color="#22c55e" /></OverviewMetricTile>
        <OverviewMetricTile label="Win rate" value={`${metrics.trade.winRate}%`} delta={`${metrics.trade.closed} audités`} tone="info"><Sparkline data={priceSeries.slice(-18)} color="#0ea5e9" /></OverviewMetricTile>
        <OverviewMetricTile label="Risque jour" value={`${metrics.risk.dailyRiskPercent}%`} delta={`limite ${metrics.risk.dailyRiskLimit}%`} tone={metrics.risk.dailyRiskPercent > metrics.risk.dailyRiskLimit * 0.7 ? "danger" : "success"}><Sparkline data={priceSeries.slice(-18)} color="#ef4444" /></OverviewMetricTile>
        <OverviewMetricTile label="Trades" value={`${metrics.trade.total}`} delta={`${metrics.trade.refused} refusés`} tone="info" icon={<BarIcon />} />
        <OverviewMetricTile label="Ouvertes" value={`${metrics.trade.open}`} delta={metrics.trade.open ? "surveillance" : "aucune exposition"} tone="ai"><Sparkline data={priceSeries.slice(-18)} color="#a855f7" /></OverviewMetricTile>
        <OverviewMetricTile label="Discipline" value={`${metrics.trade.averageDiscipline}/100`} delta={`agents ${metrics.agent.averageDiscipline}/100`} tone="ai"><ProgressBar value={metrics.trade.averageDiscipline} tone="ai" /></OverviewMetricTile>
      </div>

      <TabbedContent
        className="mt-4"
        defaultTab="synthese"
        tabs={[
          { id: "synthese", label: "Synthèse", badge: sourceStatus.paperRuntime, tone: sourceStatus.paperRuntime === "fresh" ? "success" : "warning", icon: <Gauge className="size-4" /> },
          { id: "marche", label: "Marché", badge: metrics.market.primarySymbol, tone: "info", icon: <LineChart className="size-4" /> },
          { id: "agents", label: "Agents", badge: sourceStatus.llm, tone: sourceStatus.llm === "connected" ? "success" : "warning", icon: <BrainCircuit className="size-4" /> },
          { id: "risque", label: "Risque", badge: `${metrics.risk.activeAlerts}`, tone: metrics.risk.activeAlerts ? "danger" : "success", icon: <Shield className="size-4" /> },
          { id: "journal", label: "Journal", badge: `${recentTrades.length}`, tone: "neutral", icon: <FileText className="size-4" /> },
          { id: "apprentissage", label: "Apprentissage", badge: `${learningScore}%`, tone: "ai", icon: <BookOpenCheck className="size-4" /> },
        ]}
      >
        <TabbedPanel id="synthese">
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr_0.75fr]">
            <GlassCard>
              <CardTitle icon={<Gauge />} title="État runtime" />
              <FieldRows rows={[["Marché", <span className="text-emerald-300" key="s">{sourceStatus.market === "connected" ? "connecté" : "indisponible"}</span>], ["Runtime paper", <StatusBadge key="runtime" tone={sourceStatus.paperRuntime === "fresh" ? "success" : "warning"}>{sourceStatus.paperRuntime}</StatusBadge>], ["Dernier cycle", `${timeLabel(metrics.runtime.paper.lastCycleAt)} · ${ageLabel(metrics.runtime.paper.lastCycleAgeSeconds)}`], ["Prochaine décision", metrics.risk.activeAlerts ? "après résolution alerte" : "cycle suivant"], ["Paire active", metrics.market.primarySymbol], ["LLM", <span className={sourceStatus.llm === "connected" ? "text-emerald-300" : "text-amber-300"} key="llm">{sourceStatus.llm}</span>]]} />
            </GlassCard>
            <GlassCard>
              <CardTitle icon={<Shield />} title="Risque immédiat" action={<Link href="/risk"><Button size="sm" variant="ghost">Détails</Button></Link>} />
              <div className="space-y-3">{riskLimits.slice(0, 4).map((limit) => <SliderRow key={limit.label} label={`${limit.label} ${limit.current}/${limit.limit}${limit.unit}`} value={(limit.current / limit.limit) * 100} tone={limit.current > limit.limit * 0.8 ? "danger" : "info"} />)}</div>
            </GlassCard>
            <GlassCard>
              <CardTitle icon={<Activity />} title="Actions récentes" />
              <CompactActionFeed trades={trades} primarySymbol={metrics.market.primarySymbol} primaryChange={metrics.market.primaryChange} />
            </GlassCard>
          </div>
        </TabbedPanel>

        <TabbedPanel id="marche">
          <OverviewMarketPanel marketAssets={marketAssets} trades={trades} initialSymbol={metrics.market.primarySymbol} riskPercent={metrics.risk.tradeRiskPercent} latestTrade={latestTrade} />
        </TabbedPanel>

        <TabbedPanel id="agents">
          <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
            <GlassCard>
              <CardTitle icon={<BrainCircuit />} title="Raisonnement actuel" />
              <div className="space-y-3 text-sm text-slate-300">
                <p><span className="text-violet-300">Signal :</span> {primaryAsset?.signal ?? "Aucun flux marché"} sur {metrics.market.primarySymbol}</p>
                <p><span className="text-violet-300">Confiance :</span> {primaryAsset?.confidence ?? 0} %</p>
                <p><span className="text-amber-300">Risque par trade :</span> {metrics.risk.tradeRiskPercent} % / limite {metrics.risk.tradeRiskLimit} %</p>
                <p><span className="text-amber-300">Décision :</span> {metrics.risk.activeAlerts ? "Attendre validation risque" : "Surveillance active"}</p>
                <p><span className="text-sky-300">Refus :</span> stop manquant / volatilité extrême / spread élevé / confiance faible</p>
              </div>
              <div className="mt-4"><Stepper active={2} steps={["Scanner", "Analyser", "Valider", "Exécuter", "Journaliser", "Apprendre"]} /></div>
            </GlassCard>
            <GlassCard>
              <CardTitle icon={<BrainCircuit />} title="Agents" action={<Link href="/agents"><Button size="sm" variant="ghost">Gérer</Button></Link>} />
              <DataTable headers={["Agent", "Focus", "Statut", "Score"]} rows={agents.slice(0, 6).map((agent) => [agent.name, agent.focus, <StatusBadge key={`${agent.id}-status`} tone={agent.status === "active" ? "success" : "warning"}>{agent.status}</StatusBadge>, `${agent.disciplineScore}/100`])} />
            </GlassCard>
          </div>
        </TabbedPanel>

        <TabbedPanel id="risque">
          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <GlassCard>
              <CardTitle icon={<Shield />} title="Limites" action={<Link href="/risk"><Button size="sm" variant="ghost">Ouvrir risque</Button></Link>} />
              <div className="space-y-3">{riskLimits.map((limit) => <SliderRow key={limit.label} label={`${limit.label} ${limit.current}/${limit.limit}${limit.unit}`} value={(limit.current / limit.limit) * 100} tone={limit.current >= limit.limit ? "danger" : limit.current > limit.limit * 0.7 ? "warning" : "success"} />)}</div>
            </GlassCard>
            <GlassCard>
              <CardTitle icon={<AlertTriangle />} title="Alertes & règles" action={<Link href="/alerts"><Button size="sm" variant="ghost">Alertes</Button></Link>} />
              <DataTable headers={["Type", "Sévérité", "Action"]} rows={(alerts.length ? alerts.slice(0, 6).map((alert) => [alert.type, <StatusBadge key={`${alert.id}-sev`} tone={alert.severity === "critical" ? "danger" : alert.severity === "warning" ? "warning" : "info"}>{alert.severity}</StatusBadge>, alert.recommendedAction]) : riskRules.slice(0, 6).map((rule) => [rule.name, <StatusBadge key={rule.id} tone={rule.severity === "critical" ? "danger" : rule.severity === "warning" ? "warning" : "info"}>{rule.severity}</StatusBadge>, rule.actions.join(", ")]))} />
            </GlassCard>
          </div>
        </TabbedPanel>

        <TabbedPanel id="journal">
          <GlassCard>
            <CardTitle icon={<FileText />} title="Journal de trading" action={<Link href="/journal"><Button size="sm" variant="ghost">Ouvrir</Button></Link>} />
            <DataTable headers={["Heure", "Actif", "Type", "Entrée", "Sortie", "P&L", "Audit"]} rows={recentTrades.map((trade) => [trade.time, trade.asset, <StatusBadge key={trade.id} tone={trade.side === "LONG" ? "success" : "danger"}>{trade.side}</StatusBadge>, trade.entry, trade.exit ?? "-", <span key={`${trade.id}-pnl`} className={trade.pnl >= 0 ? "text-emerald-300" : "text-red-300"}>{signed(trade.pnl, " $")}</span>, <InfoHint key={`${trade.id}-reason`} content={trade.initialReason} />])} />
          </GlassCard>
        </TabbedPanel>

        <TabbedPanel id="apprentissage">
          <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
            <GlassCard className="overflow-hidden">
              <CardTitle icon={<BrainCircuit />} title="Apprentissage" action={<Link href="/weekly-postmortem"><Button size="sm" variant="ghost">Post-mortem</Button></Link>} />
              <div className="grid grid-cols-[1fr_120px] items-center gap-4">
                <div className="space-y-2 text-sm text-slate-300">
                  <div className="flex items-center justify-between rounded-2xl border border-sky-400/20 bg-sky-500/8 px-3 py-2"><span>Erreurs fréquentes</span><InfoHint content={frequentError} /></div>
                  <div className="flex items-center justify-between rounded-2xl border border-violet-400/20 bg-violet-500/8 px-3 py-2"><span>Leçon du jour</span><InfoHint content={dailyLesson} /></div>
                  <div className="rounded-2xl border border-[#16314a] bg-slate-950/35 px-3 py-2"><div className="mb-1 flex justify-between text-xs text-slate-400"><span>Qualité apprentissage</span><span className="font-mono text-violet-200">{learningScore}%</span></div><ProgressBar value={learningScore} tone="ai" /></div>
                </div>
                <Donut value={learningScore} colors={["#8b5cf6"]} />
              </div>
            </GlassCard>
            <GlassCard>
              <CardTitle icon={<Target />} title="Maturité" action={<Link href="/maturity"><Button size="sm" variant="ghost">Détails</Button></Link>} />
              <div className="grid gap-3 md:grid-cols-2">{maturityScores.slice(0, 4).map((score) => <SliderRow key={score.subject} label={score.subject} value={score.score} tone={score.score >= 80 ? "success" : "ai"} />)}</div>
            </GlassCard>
          </div>
        </TabbedPanel>
      </TabbedContent>
    </>
  );
}

function BarIcon() {
  return <div className="flex h-8 items-end gap-1">{[30, 55, 42, 70, 48].map((h, i) => <span key={i} className="w-1.5 rounded bg-sky-400" style={{ height: `${h}%` }} />)}</div>;
}

export async function AgentsPage() {
  const { agents, marketAssets, priceSeries, monthlyHeatmap, resultDistribution, strategies, strategyComparison, replaySteps, trades, alerts, riskLimits, riskRules, paperEvents, allLlmProviders, llmRoleConfig, crisisScenarios, crisisTimeline, maturityScores, scoreEvolution, validationRequests, weeklyBars, weeklyLessons, sourceStatus, metrics } = await getAppData();
  const paperAgentRoutingConfig = await readPaperAgentRoutingConfig();
  const localAnalysisProviderConfig = await readLocalAnalysisProviderConfig();

  return (
    <>
      <SectionTitle title="Gestion des agents" subtitle="Supervisez les rôles, comportements, capacités et workflows de chaque agent." icon={<Target />} />
      <TruthStrip items={[["Agents", "config locale", "warning"], ["Paires", `${metrics.market.sourceLabel ?? "provider"} · ${metrics.market.watchedPairs}`, sourceStatus.market === "connected" ? "success" : "warning"], ["Runtime", sourceStatus.paperRuntime, sourceStatus.paperRuntime === "fresh" ? "success" : "warning"], ["Actions agent", "session locale", "warning"]]} />
      <AgentsWorkspace agents={agents} priceSeries={priceSeries} trades={trades} metrics={metrics} paperAgentRoutingConfig={paperAgentRoutingConfig} localAnalysisProviderConfig={localAnalysisProviderConfig} paperEvents={paperEvents} />
    </>
  );
}

export async function NewAgentPage() {
  const { agents, marketAssets, priceSeries, monthlyHeatmap, resultDistribution, strategies, strategyComparison, replaySteps, trades, alerts, riskLimits, riskRules, allLlmProviders, llmRoleConfig, crisisScenarios, crisisTimeline, maturityScores, scoreEvolution, validationRequests, weeklyBars, weeklyLessons, sourceStatus, metrics } = await getAppData();

  return (
    <>
      <SectionTitle title="Nouvel agent" subtitle="Créez et configurez un agent autonome, paper trading par défaut et live verrouillé." icon={<UserCheck />} />
      <TruthStrip items={[["Formulaire", "prérempli local", "warning"], ["Création", "pas d'API persistante", "neutral"], ["Paper test", sourceStatus.paperRuntime, sourceStatus.paperRuntime === "fresh" ? "success" : "warning"], ["Live", "verrouillé", "danger"]]} />
      <PageActions><Link href="/agents"><Button variant="ghost">Retour agents</Button></Link><Link href="/llm-providers"><Button variant="ai">Configurer LLM</Button></Link></PageActions>
      <div className="mt-4 grid grid-cols-[1fr_340px] items-start gap-4">
        <TabbedContent
          tabs={[
            { id: "identity", label: "Identité", badge: "4 blocs", tone: "info", icon: <UserCheck className="size-4" /> },
            { id: "behavior", label: "Comportement", badge: "3 blocs", tone: "ai", icon: <Target className="size-4" /> },
            { id: "risk", label: "Risque", badge: "3 blocs", tone: "warning", icon: <Shield className="size-4" /> },
            { id: "ai", label: "IA", badge: `${llmRoleConfig.length} rôles`, tone: "ai", icon: <BrainCircuit className="size-4" /> },
          ]}
        >
          <TabbedPanel id="identity">
            <div className="grid grid-cols-2 gap-4">
              <FormBox title="Identité de l'agent" index={1}><div className="space-y-3"><TextInput label="Nom de l'agent" value="Alpha-02" /><div className="flex gap-3 text-3xl">{["🦊", "🤖", "〽️", "△", "✳️", "🧠"].map((a) => <span key={a} className="grid size-12 place-items-center rounded-full border border-sky-400/30 bg-sky-500/10">{a}</span>)}</div><TextInput label="Description" value="Agent de trading systématique axé opportunités court terme crypto." /><Tags items={["Scan court terme", "Volatilité", "Momentum", "Crypto"]} /></div></FormBox>
              <FormBox title="Rôle & type de trading" index={2}><div className="grid grid-cols-2 gap-3"><Tags items={["Scanner", "Analyste", "Exécuteur", "Auditeur"]} tone="ai" /><div className="space-y-3"><StatusBadge tone="success">Spot / Perp</StatusBadge><StatusBadge tone="neutral"><Lock className="size-3" /> Live verrouillé</StatusBadge></div></div></FormBox>
              <FormBox title="Marché & instruments" index={3}><div className="grid grid-cols-2 gap-3"><TextInput label="Classe d'actifs" value="Crypto-monnaies" /><TextInput label="Heure de trading" value="24/7 recommandé" /><Tags items={marketAssets.slice(0, 3).map((asset) => asset.symbol)} tone="success" /><Tags items={["dYdX", "Kraken", "Coinbase", "Binance"]} /></div></FormBox>
              <FormBox title="Mode d'opération" index={4}><div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-sky-400/60 bg-sky-500/10 p-4"><div className="flex items-center gap-2 font-bold text-sky-200">Paper Trading<InfoHint content="Sans risque avec fonds virtuels" /></div></div><div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 opacity-70"><div className="flex items-center gap-2 font-bold text-slate-300"><Lock className="size-4" /> Live Trading<InfoHint content="Verrouillé : complétez la configuration" /></div></div></div></FormBox>
            </div>
          </TabbedPanel>
          <TabbedPanel id="behavior">
            <div className="grid grid-cols-3 gap-4">
              <FormBox title="Niveau d'autonomie" index={5}><SliderRow label="Conservateur → Élevé" value={60} /></FormBox>
              <FormBox title="Comportement de trading" index={6}><div className="space-y-4"><SliderRow label="Agressivité" value={64} /><SliderRow label="Prudence" value={72} /><SliderRow label="Fréquence" value={58} /><SliderRow label="Adaptation" value={71} /></div></FormBox>
              <FormBox title="Stratégie attachée" index={7}><div className="space-y-3"><ToggleRow label="Utiliser une stratégie existante" detail="Trend Momentum actif" /><ToggleRow label="Personnaliser les paramètres" active={false} /><ToggleRow label="Créer une stratégie personnalisée" active={false} /><Sparkline data={priceSeries.slice(-18)} color="#22c55e" /></div></FormBox>
            </div>
          </TabbedPanel>
          <TabbedPanel id="risk">
            <div className="grid grid-cols-3 gap-4">
              <FormBox title="Garde-fous & risque" index={8}><div className="grid grid-cols-2 gap-3"><TextInput label="Risque max par trade" value="1,00 % du capital" /><TextInput label="Perte max quotidienne" value="3,00 % du capital" /><TextInput label="Positions ouvertes max." value="5 simultanées" /><TextInput label="Drawdown max autorisé" value="15,00 %" /><ToggleRow label="Stop-loss requis" /><ToggleRow label="Kill switch automatique" /></div></FormBox>
              <FormBox title="Permissions & notifications" index={9}><div className="space-y-3"><ToggleRow label="Peut placer des ordres" /><ToggleRow label="Modifier stop-loss / TP" /><ToggleRow label="Peut désactiver l'agent" active={false} /><ToggleRow label="Recevoir des alertes" /></div></FormBox>
              <FormBox title="Apprentissage & journalisation" index={10}><div className="space-y-3"><ToggleRow label="Apprentissage automatique" /><ToggleRow label="Optimisation continue" /><ToggleRow label="Journaliser toutes les décisions" /><TextInput label="Conserver les données" value="90 jours" /></div></FormBox>
            </div>
          </TabbedPanel>
          <TabbedPanel id="ai">
            <FormBox title="Configuration IA" index={11}><div className="grid grid-cols-4 gap-3">{llmRoleConfig.map((cfg) => <TextInput key={cfg.role} label={`LLM ${cfg.role}`} value={`${cfg.providerId} / ${cfg.modelId}`} />)}</div><Link href="/llm-providers"><Button className="mt-4" variant="ai">Configurer providers LLM</Button></Link></FormBox>
          </TabbedPanel>
        </TabbedContent>
        <AgentPreview />
      </div>
      <div className="mt-4 flex justify-between"><Link href="/agents"><Button variant="ghost">Annuler</Button></Link><div className="flex gap-3"><LocalActionButton actionLabel="Brouillon agent" variant="ghost"><Save className="size-4" /> Enregistrer brouillon local</LocalActionButton><Link href="/markets"><Button variant="ai"><Play className="size-4" /> Tester sur marchés</Button></Link><LocalActionButton actionLabel="Agent préparé localement" variant="success">Préparer localement <ArrowRight className="size-4" /></LocalActionButton></div></div>
    </>
  );
}

function AgentPreview() {
  return <div className="space-y-4"><GlassCard><CardTitle title="Aperçu de l'agent" /><div className="flex items-center gap-3"><div className="grid size-20 place-items-center rounded-full border border-sky-400/50 bg-sky-500/10 text-5xl">🦊</div><div><div className="text-xl font-bold text-white">Alpha-02</div><StatusBadge tone="success">Nouveau</StatusBadge><p className="mt-2 text-sm text-slate-400">Scanner, Analyste · Paper Trading · Crypto</p></div></div><Tags items={["Volatilité", "Momentum", "Court terme"]} /></GlassCard><GlassCard><CardTitle title="Score de discipline estimé" /><div className="flex items-center justify-between"><div className="font-mono text-3xl font-bold text-white">76<span className="text-base text-slate-500">/100</span></div><Donut value={76} colors={["#8b5cf6"]} /></div><div className="space-y-3"><SliderRow label="Gestion du risque" value={82} tone="success" /><SliderRow label="Cohérence" value={71} tone="ai" /><SliderRow label="Adaptabilité" value={74} tone="info" /></div></GlassCard><GlassCard><CardTitle title="Compatibilité système" /><Checklist items={[{ label: "Ressources suffisantes", status: "ok" }, { label: "Stratégie compatible", status: "ok" }, { label: "Règles de risque", status: "ok" }, { label: "Permissions valides", status: "ok" }]} /></GlassCard><GlassCard><CardTitle title="Résumé de lancement" /><FieldRows rows={[["Mode", "Paper Trading"], ["Capital virtuel", "10 000,00 $"], ["Date de création", "24 mai 2025 09:23"], ["Statut", <StatusBadge key="ready" tone="success">Prêt à créer</StatusBadge>]]} /></GlassCard></div>;
}

function StrategyBuilderPanel({ marketAssets, priceSeries, llmRoleCount }: { marketAssets: MarketAsset[]; priceSeries: Array<{ price: number }>; llmRoleCount: number }) {
  return (
    <div className="grid grid-cols-[1fr_320px] items-start gap-4">
      <TabbedContent
        tabs={[
          { id: "base", label: "Base", badge: "3 blocs", tone: "info", icon: <SlidersHorizontal className="size-4" /> },
          { id: "rules", label: "Règles", badge: "entrée/sortie", tone: "ai", icon: <Target className="size-4" /> },
          { id: "risk", label: "Risque", badge: "filtres", tone: "warning", icon: <Shield className="size-4" /> },
          { id: "validation", label: "Actifs & test", badge: `${marketAssets.length}`, tone: "success", icon: <CheckCircle2 className="size-4" /> },
        ]}
      >
        <TabbedPanel id="base">
          <div className="grid grid-cols-3 gap-4">
            <FormBox index={1} title="Identité de la stratégie"><TextInput label="Nom" value="Breakout Momentum Pro" /><TextInput label="Description" value="Breakout avec confirmation momentum et risque dynamique." /><Tags items={["breakout", "momentum", "trend"]} /></FormBox>
            <FormBox index={2} title="Type & objectif"><Tags items={["Trend Following", "Mean Reversion", "Breakout", "Scalping", "Arbitrage", "Custom"]} tone="ai" /><TextInput label="Objectif" value="Maximiser rendement ajusté au risque" /></FormBox>
            <FormBox index={3} title="Marché & unités de temps"><Tags items={["Crypto", "Spot/Perp", "1h", "4h", "24/7"]} /><TextInput label="Fréquence de risque" value="Élevée" /></FormBox>
          </div>
        </TabbedPanel>
        <TabbedPanel id="rules">
          <div className="grid grid-cols-[1fr_320px] gap-4">
            <FormBox index={4} title="Règles d'entrée"><DataTable headers={["#", "Indicateur", "Opérateur", "Valeur"]} rows={["Prix clôture au-dessus EMA 50", "RSI supérieur à 55", "MACD au-dessus signal", "Volume > SMA 20", "Breakout plus haut 20 périodes", "Aucune actualité majeure"].map((rule, index) => [index + 1, rule, "ET", <XCircle key={rule} className="size-4 text-red-300" />])} /></FormBox>
            <FormBox index={5} title="Règles de sortie"><Tags items={["Prix sous EMA 50", "RSI < 45", "Take-profit 2,5R", "Temps max 48h", "Stop-loss atteint"]} tone="danger" /></FormBox>
          </div>
        </TabbedPanel>
        <TabbedPanel id="risk">
          <div className="grid grid-cols-2 gap-4">
            <FormBox index={6} title="Gestion du risque"><FieldRows rows={[["Stop-loss", "ATR x 1,8"], ["Take-profit", "ATR x 3,0"], ["Risque/trade", "1,0 %"], ["Positions max", "3"], ["Risque quotidien", "4,0 %"]]} /></FormBox>
            <FormBox index={7} title="Filtres & conditions"><div className="space-y-2"><ToggleRow label="Tendance de fond EMA 200" /><ToggleRow label="Volatilité ATR" /><ToggleRow label="Volume minimum" /><ToggleRow label="Éviter annonces majeures" /></div></FormBox>
          </div>
        </TabbedPanel>
        <TabbedPanel id="validation">
          <div className="grid grid-cols-3 gap-4">
            <FormBox index={8} title="Actifs autorisés"><div className="space-y-2">{marketAssets.slice(0, 6).map((asset) => <ToggleRow key={asset.symbol} label={asset.symbol} active={asset.authorized} />)}</div></FormBox>
            <FormBox index={9} title="Validation & test"><TextInput label="Données historiques" value="2 dernières années" /><TextInput label="Frais" value="0,10 %" /><TextInput label="Slippage" value="0,05 %" /><TextInput label="Capital initial" value="10 000 USDT" /></FormBox>
            <FormBox index={10} title="Notes & IA"><div className="space-y-3 text-sm text-slate-300"><div className="flex items-center gap-2">Rôles LLM configurés<StatusBadge tone="ai">{llmRoleCount}</StatusBadge></div><div className="flex items-center gap-2">Recommandations<InfoHint content="Ajouter un filtre corrélation BTC, tester une sortie partielle à 1,5R, surveiller performances sur 30m." /></div></div></FormBox>
          </div>
        </TabbedPanel>
      </TabbedContent>
      <GlassCard><CardTitle title="Aperçu de la stratégie" /><FieldRows rows={[["Taux de réussite estimé", <span key="w" className="text-emerald-300">64,3%</span>], ["Rendement / Risque", <span key="r" className="text-violet-300">2,67</span>], ["Drawdown max cible", <span key="d" className="text-red-300">{signed(-8.21, "%")}</span>], ["Score global", "81/100"]]} /><Donut value={81} colors={["#8b5cf6"]} /><Checklist items={[{ label: "Marché crypto", status: "ok" }, { label: "Tendance haussière", status: "ok" }, { label: "Volatilité moyenne", status: "ok" }, { label: "Compatibilité Alpha-01", status: "ok" }]} /><Sparkline data={priceSeries.slice(-18)} color="#8b5cf6" /></GlassCard>
    </div>
  );
}

export async function MarketsPage() {
  const { agents, marketAssets, priceSeries, monthlyHeatmap, resultDistribution, strategies, strategyComparison, replaySteps, trades, alerts, riskLimits, riskRules, allLlmProviders, llmRoleConfig, crisisScenarios, crisisTimeline, maturityScores, scoreEvolution, validationRequests, weeklyBars, weeklyLessons, sourceStatus, metrics } = await getAppData();

  return (
    <>
      <SectionTitle title="Marchés crypto" subtitle="Sélectionnez, surveillez et autorisez les marchés traitables par l'agent." icon={<BarIcon />} />
      <TruthStrip items={[["Prix", `${metrics.market.sourceLabel ?? "provider"} live`, sourceStatus.market === "connected" ? "success" : "warning"], ["OHLC", `${metrics.market.sourceLabel ?? "provider"} candles`, sourceStatus.market === "connected" ? "success" : "warning"], ["Univers", `${marketAssets.length} paires`, marketAssets.length === 10 ? "success" : "warning"], ["Execution", "paper uniquement", "info"]]} />
      <PageActions><Link href="/strategies"><Button variant="ghost">Voir stratégies</Button></Link><Link href="/risk"><Button variant="ghost"><Shield className="size-4" /> Risque</Button></Link><Link href="/strategies/new"><Button><Plus className="size-4" /> Créer stratégie</Button></Link></PageActions>
      <MarketsWorkspace agents={agents} marketAssets={marketAssets} priceSeries={priceSeries} trades={trades} riskPercent={metrics.risk.tradeRiskPercent} sourceStatus={sourceStatus.market} metrics={metrics.market} />
    </>
  );
}

export async function StrategiesPage({ defaultTab = "library" }: { defaultTab?: StrategiesTab } = {}) {
  const { agents, marketAssets, priceSeries, monthlyHeatmap, resultDistribution, strategies, strategyComparison, replaySteps, trades, alerts, riskLimits, riskRules, allLlmProviders, llmRoleConfig, crisisScenarios, crisisTimeline, maturityScores, scoreEvolution, validationRequests, weeklyBars, weeklyLessons, sourceStatus, metrics } = await getAppData();
  const allocation = await readTradingAllocationConfig();
  const recommended = marketAssets
    .filter((asset) => asset.price > 0 && asset.price < 1 && asset.authorized)
    .toSorted((a, b) => (b.confidence + b.volatility) - (a.confidence + a.volatility))[0] ?? marketAssets[0];

  return (
    <>
      <SectionTitle title="Stratégies" subtitle="Un seul espace pour choisir, créer, auditer et tester les stratégies." icon={<Target />} />
      <TruthStrip items={[["Bibliothèque", "runtime local", "success"], ["Builder", "intégré", "info"], ["Backtests", recommended?.symbol ?? metrics.market.primarySymbol, "warning"], ["Architecte IA", "intégré", "ai"]]} />
      <RouteTabs
        activeId={defaultTab}
        tabs={[
          { id: "library", label: "Bibliothèque", href: "/strategies", badge: `${strategies.length}`, tone: "success", icon: <Target className="size-4" /> },
          { id: "builder", label: "Créer", href: "/strategies/new", badge: "builder", tone: "info", icon: <Plus className="size-4" /> },
          { id: "backtests", label: "Backtests", href: "/backtests", badge: recommended?.symbol ?? "simulation", tone: "warning", icon: <LineChart className="size-4" /> },
          { id: "architect", label: "Architecte IA", href: "/ai-architect", badge: "Codex", tone: "ai", icon: <BrainCircuit className="size-4" /> },
        ]}
      />
      {defaultTab === "library" ? <StrategiesWorkspace strategies={strategies} priceSeries={priceSeries} strategyComparison={strategyComparison} metrics={metrics} /> : null}
      {defaultTab === "builder" ? <StrategyBuilderPanel marketAssets={marketAssets} priceSeries={priceSeries} llmRoleCount={llmRoleConfig.length} /> : null}
      {defaultTab === "backtests" ? <BacktestsWorkspace marketAssets={marketAssets} priceSeries={priceSeries} monthlyHeatmap={monthlyHeatmap} resultDistribution={resultDistribution} strategies={strategies} trades={trades} metrics={metrics} sourceStatus={sourceStatus} paperAllocation={allocation.paper} /> : null}
      {defaultTab === "architect" ? <AIArchitectWorkspace /> : null}
      <DisclaimerBar items={DISCLAIMERS} />
    </>
  );
}

export async function NewStrategyPage() {
  return <StrategiesPage defaultTab="builder" />;
}

export async function BacktestsPage() {
  return <StrategiesPage defaultTab="backtests" />;
}

export async function JournalPage({ defaultTab = "log", initialTradeId }: { defaultTab?: JournalTab; initialTradeId?: string } = {}) {
  const { agents, marketAssets, priceSeries, monthlyHeatmap, resultDistribution, strategies, strategyComparison, replaySteps, trades, alerts, riskLimits, riskRules, paperEvents, allLlmProviders, llmRoleConfig, crisisScenarios, crisisTimeline, maturityScores, scoreEvolution, validationRequests, weeklyBars, weeklyLessons, sourceStatus, paperRuntime, killSwitch, dataMode, metrics } = await getAppData();
  const snapshot: AppDataSnapshot = { agents, marketAssets, priceSeries, monthlyHeatmap, resultDistribution, strategies, strategyComparison, replaySteps, trades, alerts, riskLimits, riskRules, paperEvents, allLlmProviders, llmRoleConfig, crisisScenarios, crisisTimeline, maturityScores, scoreEvolution, validationRequests, weeklyBars, weeklyLessons, sourceStatus, paperRuntime, killSwitch, dataMode, metrics };

  return (
    <>
      <SectionTitle title="Journal" subtitle="Historique, replay de décision et post-mortem hebdomadaire dans un seul fil." icon={<FileText />} />
      <PageActions><PageRefreshButton /><Link href="/api/paper-trading/state"><Button variant="ghost"><Download className="size-4" /> État runtime</Button></Link></PageActions>
      <div className="grid grid-cols-5 gap-4"><KpiCard label="Décisions journalisées" value={`${metrics.trade.total}`} delta={`${metrics.trade.open} ordres ouverts`} tone="info" /><KpiCard label="Signaux non ouverts" value={`${metrics.trade.refused}`} delta="bloqués ou ignorés" tone={metrics.trade.refused ? "warning" : "success"} /><KpiCard label="P&L latent" value={signed(metrics.trade.unrealizedPnl, " $")} delta={`réalisé ${signed(metrics.trade.pnlTotal, " $")}`} tone={metrics.trade.unrealizedPnl >= 0 ? "success" : "danger"} /><KpiCard label="Erreurs critiques" value={`${metrics.risk.criticalAlerts}`} delta={`${metrics.risk.activeAlerts} alertes actives`} tone={metrics.risk.criticalAlerts ? "danger" : "success"} /><KpiCard label="Qualité décisions" value={`${metrics.trade.averageDiscipline}/100`} delta="discipline moyenne" tone="ai"><Donut value={metrics.trade.averageDiscipline} colors={["#8b5cf6"]} /></KpiCard></div>
      <TruthStrip items={[["Journal", "paper-runtime", "success"], ["Données démo", sourceStatus.demoData, sourceStatus.demoData === "off" ? "success" : "danger"], ["Événements", `${paperEvents.length}`, paperEvents.length ? "info" : "warning"], ["Export", "JSON local/runtime", "success"]]} />
      <RouteTabs
        activeId={defaultTab}
        tabs={[
          { id: "log", label: "Journal", href: "/journal", badge: `${metrics.trade.total}`, tone: "info", icon: <FileText className="size-4" /> },
          { id: "replay", label: "Replay", href: "/decision-replay", badge: trades[0]?.asset ?? "vide", tone: trades.length ? "success" : "warning", icon: <Play className="size-4" /> },
          { id: "postmortem", label: "Post-mortem", href: "/weekly-postmortem", badge: `${metrics.weekly.analyzed} trades`, tone: "ai", icon: <ClipboardCheck className="size-4" /> },
        ]}
      />
      {defaultTab === "log" ? <JournalWorkspace trades={trades} priceSeries={priceSeries} replaySteps={replaySteps} riskRules={riskRules} riskLimits={riskLimits} paperEvents={paperEvents} /> : null}
      {defaultTab === "replay" ? (trades.length ? <DecisionReplayWorkspace initialTradeId={initialTradeId} trades={trades} replaySteps={replaySteps} marketMetrics={metrics.market} riskMetrics={metrics.risk} sourceStatus={sourceStatus} /> : <GlassCard><CardTitle title="Aucun trade disponible" /><StatusBadge tone="warning">Runtime paper en attente</StatusBadge></GlassCard>) : null}
      {defaultTab === "postmortem" ? <WeeklyPostmortemPanel data={snapshot} /> : null}
    </>
  );
}

function TradeDetail({ selected, priceSeries, replaySteps }: { selected: Trade; priceSeries: Array<Record<string, string | number>>; replaySteps: Array<{ time: string; title: string; detail: string }> }) {
  return <div className="space-y-4"><GlassCard><CardTitle title="Détail du trade sélectionné" action={<StatusBadge tone="success">Gagnant</StatusBadge>} /><div className="flex items-center justify-between"><div><div className="text-xl font-bold text-white">{selected.asset}</div><StatusBadge tone="success">{selected.side}</StatusBadge></div><div className="font-mono text-2xl text-emerald-300">{signed(selected.pnl, " $")}</div></div><FieldRows rows={[["Entrée", selected.entry], ["Sortie", selected.exit], ["Durée", "01:12:48"], ["Date", `${selected.date} ${selected.time}`]]} /></GlassCard><GlassCard><CardTitle title="Aperçu live avec niveaux" /><div className="grid grid-cols-2 gap-3"><MetricGauge value={selected.confidence} label="Confiance" tone="info" /><FieldRows rows={[["Risque/trade", `${selected.riskPercent}%`], ["Exposition", "6,50%"], ["R:R estimé", "2,6:1"]]} /></div><TradingDeskChart compact symbol={selected.asset} trades={[selected]} riskPercent={selected.riskPercent} title={`${selected.asset} · replay niveaux`} /></GlassCard><GlassCard><CardTitle title="Chaîne de raisonnement" /><Timeline items={replaySteps.slice(0, 5).map((s) => ({ time: s.time, title: s.title, detail: s.detail, tone: "success" }))} /></GlassCard><GlassCard><CardTitle title="Checklist / post-mortem / leçons" /><Checklist items={[{ label: "Tendance alignée", status: "ok" }, { label: "Volume confirmé", status: "ok" }, { label: "Risque < 1%", status: "ok" }, { label: "Entrée un peu anticipée", status: "warning" }]} /><div className="mt-4 flex items-center gap-2 text-sm text-slate-300">Leçon<InfoHint content={selected.lesson} /></div><Link href={`/decision-replay?trade=${encodeURIComponent(selected.id)}`}><Button className="mt-4 w-full" variant="ghost">Rejouer la décision</Button></Link></GlassCard></div>;
}

function WeeklyPostmortemPanel({ data }: { data: AppDataSnapshot }) {
  const { monthlyHeatmap, strategies, weeklyBars, weeklyLessons, metrics } = data;

  return (
    <TabbedContent
      tabs={[
        { id: "summary", label: "Résumé", badge: `${metrics.weekly.analyzed} trades`, tone: "info", icon: <ClipboardCheck className="size-4" /> },
        { id: "lessons", label: "Leçons", badge: "5 axes", tone: "ai", icon: <BrainCircuit className="size-4" /> },
        { id: "performance", label: "Performance", badge: signed(metrics.weekly.netPerformance, "%"), tone: metrics.weekly.netPerformance >= 0 ? "success" : "danger", icon: <LineChart className="size-4" /> },
      ]}
    >
      <TabbedPanel id="summary">
        <div className="space-y-4">
          <div className="grid grid-cols-6 gap-4"><KpiCard label="Trades analysés" value={`${metrics.weekly.analyzed}`} delta={`${metrics.trade.closed} clos`} tone="info" /><KpiCard label="Gagnants / perdants" value={`${metrics.weekly.winners} / ${metrics.weekly.losers}`} delta={`${formatPercent(metrics.trade.winRate, 1)} réussite`} tone="success" /><KpiCard label="Trades évités correctement" value={`${metrics.weekly.avoided}`} delta={`${metrics.weekly.avoidedQuality}% qualité`} tone="success" /><KpiCard label="Violations" value={`${metrics.weekly.violations}`} delta={`${metrics.risk.activeAlerts} alertes`} tone={metrics.weekly.violations ? "danger" : "success"} /><KpiCard label="Leçon principale" value="Risque" delta={metrics.weekly.mainLesson} tone="ai" /><KpiCard label="Performance nette" value={signed(metrics.weekly.netPerformance, "%")} delta={signed(metrics.trade.pnlTotal, " $")} tone={metrics.weekly.netPerformance >= 0 ? "success" : "danger"} /></div>
          <div className="grid grid-cols-[1fr_1fr_300px] gap-4"><GlassCard><CardTitle title="Résumé hebdomadaire" hint={metrics.weekly.mainLesson} /><Tags items={["Discipline améliorée", "Meilleure gestion du risque", "Moins de FOMO", "Fatigue identifiée le soir"]} /></GlassCard><GlassCard><CardTitle title="Résultats journaliers" /><PerformanceBars data={weeklyBars} /></GlassCard><GlassCard><CardTitle title="Résumé exécutif" /><FieldRows rows={[["Performance nette", <span key="p" className={metrics.weekly.netPerformance >= 0 ? "text-emerald-300" : "text-red-300"}>{signed(metrics.weekly.netPerformance, "%")}</span>], ["Trades analysés", `${metrics.weekly.analyzed}`], ["Gagnants / perdants", `${metrics.weekly.winners} / ${metrics.weekly.losers}`], ["Max drawdown", <span key="d" className="text-red-300">{formatPercent(metrics.risk.drawdownPercent)}</span>], ["Conformité", <span key="c" className="text-emerald-300">{formatPercent(metrics.risk.conformityPercent, 0)}</span>]]} /></GlassCard></div>
        </div>
      </TabbedPanel>
      <TabbedPanel id="lessons">
        <div className="grid grid-cols-5 gap-4"><GlassCard><CardTitle title="Ce qui a bien fonctionné" /><Timeline items={weeklyLessons.worked.map((item) => ({ title: item, tone: "success" }))} /></GlassCard><GlassCard><CardTitle title="Ce qui a moins bien fonctionné" /><Timeline items={weeklyLessons.failed.map((item) => ({ title: item, tone: "warning" }))} /></GlassCard><GlassCard><CardTitle title="Erreurs répétées" /><Timeline items={weeklyLessons.repeated.map((item) => ({ title: item, tone: "danger" }))} /></GlassCard><GlassCard><CardTitle title="Ajustements proposés" /><Timeline items={weeklyLessons.adjustments.map((item) => ({ title: item, tone: "info" }))} /></GlassCard><GlassCard><CardTitle title="Règles à renforcer" />{["Gestion du risque", "Entrée", "Sortie", "Gestion émotionnelle", "Respect du plan"].map((rule, index) => <div className="mb-3" key={rule}><SliderRow label={rule} value={[90, 78, 72, 65, 85][index]} tone="ai" /></div>)}</GlassCard></div>
      </TabbedPanel>
      <TabbedPanel id="performance">
        <div className="grid grid-cols-[1fr_1fr_300px] gap-4"><GlassCard><CardTitle title="Performance par jour / heure" /><HeatmapGrid values={monthlyHeatmap} /></GlassCard><GlassCard><CardTitle title="Stratégies à activer / désactiver" action={<Link href="/strategies"><Button size="sm" variant="ghost">Ouvrir</Button></Link>} /><DataTable headers={["Stratégie", "Statut", "Performance", "Recommandation"]} rows={strategies.map((strategy) => [strategy.name, <StatusBadge key={strategy.id} tone={strategy.status === "active" ? "success" : "neutral"}>{strategy.status}</StatusBadge>, <span key={`${strategy.id}-p`} className={strategy.performance >= 0 ? "text-emerald-300" : "text-red-300"}>{signed(strategy.performance, "%")}</span>, <StatusBadge key={`${strategy.id}-action`} tone={strategy.performance < 0 ? "danger" : "info"}>{strategy.performance < 0 ? "Désactiver" : "Conserver"}</StatusBadge>])} /></GlassCard><GlassCard><CardTitle title="Meilleure / pire décision" /><div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-3"><div className="font-bold text-emerald-300">Meilleure décision</div><p className="text-sm text-slate-300">{metrics.weekly.bestTrade?.asset ?? "-"} · {signed(metrics.weekly.bestTrade?.pnl ?? 0, " $")}</p></div><div className="mt-3 rounded-2xl border border-red-500/20 bg-red-500/8 p-3"><div className="font-bold text-red-300">Pire décision</div><p className="text-sm text-slate-300">{metrics.weekly.worstTrade?.asset ?? "-"} · {signed(metrics.weekly.worstTrade?.pnl ?? 0, " $")}</p></div></GlassCard></div>
      </TabbedPanel>
    </TabbedContent>
  );
}

export async function RiskPage({ defaultTab = "limits" }: { defaultTab?: RiskTab } = {}) {
  const { agents, marketAssets, priceSeries, monthlyHeatmap, resultDistribution, strategies, strategyComparison, replaySteps, trades, alerts, riskLimits, riskRules, allLlmProviders, llmRoleConfig, crisisScenarios, crisisTimeline, maturityScores, scoreEvolution, validationRequests, weeklyBars, weeklyLessons, sourceStatus, metrics } = await getAppData();
  const exposureLimitReached = metrics.risk.exposureLimit > 0 && metrics.risk.exposurePercent >= metrics.risk.exposureLimit;
  const exposureNearLimit = metrics.risk.exposureLimit > 0 && metrics.risk.exposurePercent >= metrics.risk.exposureLimit * 0.8;
  const exposureGaugeValue = Math.min(100, (metrics.risk.exposurePercent / Math.max(metrics.risk.exposureLimit, 1)) * 100);
  const exposureRows = metrics.risk.openExposures.length
    ? metrics.risk.openExposures.map((exposure) => [
        exposure.asset,
        <div key={exposure.asset} className="min-w-[160px]">
          <div className="mb-1 flex justify-between gap-3 font-mono text-xs text-slate-300"><span>{formatPercent(exposure.current, 2)}</span><span>{signed(exposure.pnlUsd, " $")}</span></div>
          <ProgressBar value={Math.min(100, (exposure.current / Math.max(metrics.risk.exposureLimit, 1)) * 100)} tone={exposure.current >= metrics.risk.exposureLimit ? "danger" : "warning"} />
        </div>,
      ])
    : marketAssets.slice(0, 6).map((asset) => [asset.symbol, <ProgressBar key={asset.symbol} value={0} tone="neutral" />]);

  return (
    <>
      <SectionTitle title="Risque" subtitle="Limites, alertes, règles, validations et stress tests dans un seul poste de contrôle." icon={<Shield />} />
      <TruthStrip items={[["Limites", "runtime paper", "success"], ["Alertes", `${metrics.risk.activeAlerts}`, metrics.risk.activeAlerts ? "warning" : "success"], ["Kill switch", sourceStatus.killSwitch, sourceStatus.killSwitch === "inactive" ? "success" : "danger"], ["Live", "bloqué", "danger"]]} />
      <PageActions><Link href="/capital-progress"><Button>Progression capital</Button></Link></PageActions>
      <div className="grid grid-cols-5 gap-4"><KpiCard label="Perte quotidienne utilisée" value={formatPercent(metrics.risk.dailyRiskPercent)} delta={`sur ${metrics.risk.dailyRiskLimit}% limite`} tone={metrics.risk.dailyRiskPercent > metrics.risk.dailyRiskLimit * 0.7 ? "warning" : "success"}><Donut value={Math.round((metrics.risk.dailyRiskPercent / Math.max(metrics.risk.dailyRiskLimit, 1)) * 100)} colors={["#22c55e"]} /></KpiCard><KpiCard label="Drawdown actuel" value={formatPercent(metrics.risk.drawdownPercent)} delta={`sur ${metrics.risk.drawdownLimit}% limite`} tone="danger"><Sparkline data={priceSeries.slice(-18)} color="#ef4444" /></KpiCard><KpiCard label="Exposition totale" value={formatPercent(metrics.risk.exposurePercent)} delta={`sur ${metrics.risk.exposureLimit}% limite`} tone={exposureLimitReached ? "danger" : exposureNearLimit ? "warning" : "info"}><Donut value={Math.round(exposureGaugeValue)} /></KpiCard><KpiCard label="Conformité des règles" value={formatPercent(metrics.risk.conformityPercent, 0)} delta={`${metrics.risk.activeRules}/${riskRules.length} règles actives`} tone="success" /><KpiCard label="Alertes actives" value={`${metrics.risk.activeAlerts}`} delta="Voir le flux" tone={metrics.risk.activeAlerts ? "warning" : "success"} icon={<Bell />} /></div>
      <RouteTabs
        activeId={defaultTab}
        tabs={[
          { id: "limits", label: "Limites", href: "/risk", badge: `${riskLimits.length}`, tone: "success", icon: <Shield className="size-4" /> },
          { id: "alerts", label: "Alertes", href: "/alerts", badge: `${metrics.alert.active}`, tone: metrics.alert.active ? "warning" : "success", icon: <Bell className="size-4" /> },
          { id: "rules", label: "Règles", href: "/rules", badge: `${metrics.risk.activeRules}`, tone: "info", icon: <BookOpenCheck className="size-4" /> },
          { id: "validation", label: "Validation", href: "/human-validation", badge: `${metrics.validation.pending}`, tone: metrics.validation.pending ? "warning" : "success", icon: <UserCheck className="size-4" /> },
          { id: "stress", label: "Stress test", href: "/crisis-simulator", badge: metrics.crisis.selected.severity, tone: "warning", icon: <Gauge className="size-4" /> },
          { id: "kill", label: "Kill switch", href: "/risk?tab=kill", badge: sourceStatus.killSwitch, tone: sourceStatus.killSwitch === "inactive" ? "success" : "danger", icon: <Siren className="size-4" /> },
        ]}
      />
      {defaultTab === "limits" ? (
        <div className="grid grid-cols-[1fr_1fr_0.8fr] gap-4">
          <GlassCard><CardTitle title="Vue d'ensemble du risque" />{riskLimits.map((limit) => <div className="mb-4" key={limit.label}><SliderRow label={`${limit.label} ${limit.current}/${limit.limit}${limit.unit}`} value={(limit.current / limit.limit) * 100} tone={limit.current >= limit.limit ? "danger" : limit.current > limit.limit * 0.7 ? "warning" : "success"} /></div>)}</GlassCard>
          <GlassCard><CardTitle title="Exposition par actif" /><DataTable headers={["Actif", "% capital"]} rows={exposureRows} /><CardTitle title="Concentration & corrélation" /><MetricGauge value={exposureGaugeValue} label={exposureLimitReached ? "Limite atteinte" : exposureNearLimit ? "Surveillée" : "Contrôlée"} tone={exposureLimitReached ? "danger" : exposureNearLimit ? "warning" : "success"} /></GlassCard>
          <LiveMarketBoard limit={4} />
        </div>
      ) : null}
      {defaultTab === "alerts" ? (alerts.length ? <AlertCenterWorkspace alerts={alerts} dailyRiskPercent={metrics.risk.dailyRiskPercent} /> : <GlassCard><CardTitle title="Flux d'alertes" /><StatusBadge tone="success">Aucune alerte opérationnelle</StatusBadge></GlassCard>) : null}
      {defaultTab === "rules" ? <RuleLibraryWorkspace rules={riskRules} alerts={alerts} riskLimits={riskLimits} /> : null}
      {defaultTab === "validation" ? (validationRequests.length ? <HumanValidationWorkspace requests={validationRequests} trades={trades} riskPercent={metrics.risk.tradeRiskPercent} /> : <GlassCard><CardTitle title="File de validation" /><StatusBadge tone="success">Aucune validation humaine en attente</StatusBadge><div className="mt-4 grid grid-cols-3 gap-3"><KpiCard label="Approuvés paper" value={`${metrics.trade.closed}`} delta="trades clos" tone="success" /><KpiCard label="Refusés" value={`${metrics.trade.refused}`} delta="moteur risque" tone="danger" /><KpiCard label="Trades sensibles" value="0" delta="aucun" tone="success" /></div></GlassCard>) : null}
      {defaultTab === "stress" ? <CrisisSimulatorWorkspace scenarios={crisisScenarios} timeline={crisisTimeline} metrics={metrics.crisis} killSwitchStatus={sourceStatus.killSwitch} /> : null}
      {defaultTab === "kill" ? <GlassCard className="border-red-500/40"><CardTitle icon={<Siren />} title="Kill Switch / Arrêt automatique" /><StatusBadge tone={sourceStatus.killSwitch === "active" ? "danger" : "success"}>{sourceStatus.killSwitch === "active" ? "ACTIF" : "VEILLE"}</StatusBadge><FieldRows rows={[["Perte quotidienne ≥", `${metrics.risk.dailyRiskLimit}%`], ["Drawdown ≥", `${metrics.risk.drawdownLimit}%`], ["Risque/trade ≥", `${metrics.risk.tradeRiskLimit}%`], ["Alertes critiques ≥", `${metrics.risk.criticalAlerts}`]]} /><KillSwitchButton className="mt-4 w-full" size="md" /></GlassCard> : null}
      <DisclaimerBar items={DISCLAIMERS} />
    </>
  );
}

export async function SettingsPage({ defaultTab = "general" }: { defaultTab?: SettingsTab } = {}) {
  const [data, openClawSnapshot] = await Promise.all([getAppData(), buildOpenClawRuntimeSnapshot()]);
  const { agents, llmRoleConfig, riskLimits, sourceStatus, metrics } = data;

  return (
    <>
      <SectionTitle title="Paramètres" subtitle="Configuration générale, providers IA et OpenClaw regroupés au même endroit." icon={<SlidersHorizontal />} />
      <TruthStrip items={[["Env", "lecture serveur", "info"], ["LLM", sourceStatus.llm, sourceStatus.llm === "connected" ? "success" : "warning"], ["OpenClaw", openClawSnapshot.status.state, openClawSnapshot.status.configured ? "success" : "warning"], ["Secrets", "non exposés", "success"]]} />
      <RouteTabs
        activeId={defaultTab}
        tabs={[
          { id: "general", label: "Général", href: "/settings", badge: "runtime", tone: "info", icon: <SlidersHorizontal className="size-4" /> },
          { id: "llm", label: "LLM", href: "/llm-providers", badge: `${metrics.llm.connectedProviders}/${metrics.llm.totalProviders}`, tone: sourceStatus.llm === "connected" ? "success" : "warning", icon: <BrainCircuit className="size-4" /> },
          { id: "openclaw", label: "OpenClaw", href: "/openclaw", badge: openClawSnapshot.status.state, tone: openClawSnapshot.status.configured ? "success" : "warning", icon: <Cloud className="size-4" /> },
        ]}
      />
      {defaultTab === "general" ? <SettingsWorkspace agents={agents} llmRoleConfig={llmRoleConfig} metrics={metrics} riskLimits={riskLimits} sourceStatus={sourceStatus} /> : null}
      {defaultTab === "llm" ? <LLMProvidersPanel data={data} /> : null}
      {defaultTab === "openclaw" ? <OpenClawRuntimeWorkspace initialSnapshot={openClawSnapshot} /> : null}
    </>
  );
}

export async function CapitalProgressPage({ defaultTab = "progress" }: { defaultTab?: CapitalTab } = {}) {
  const data = await getAppData();
  const { priceSeries, sourceStatus, metrics } = data;

  return (
    <>
      <SectionTitle title="Capital & progression" subtitle="Paliers de capital et maturité de l'agent dans le même chemin de décision." icon={<WalletCards />} />
      <TruthStrip items={[["Capital", "paliers configurés", "info"], ["Maturité", `${metrics.maturity.globalScore}/100`, metrics.maturity.globalScore >= 75 ? "success" : "warning"], ["Live", sourceStatus.trading, sourceStatus.trading === "live-enabled" ? "danger" : "success"], ["Risque", "runtime paper", "success"]]} />
      <PageActions><Link href="/risk"><Button variant="ghost"><Shield className="size-4" /> Risque</Button></Link></PageActions>
      <RouteTabs
        activeId={defaultTab}
        tabs={[
          { id: "progress", label: "Progression", href: "/capital-progress", badge: metrics.capital.current.label, tone: "info", icon: <WalletCards className="size-4" /> },
          { id: "maturity", label: "Maturité", href: "/maturity", badge: `${metrics.maturity.globalScore}/100`, tone: metrics.maturity.globalScore >= 75 ? "success" : "warning", icon: <ShieldCheck className="size-4" /> },
        ]}
      />
      {defaultTab === "progress" ? <CapitalProgressWorkspace metrics={metrics} priceSeries={priceSeries} sourceStatus={sourceStatus} /> : null}
      {defaultTab === "maturity" ? <MaturityPanel data={data} /> : null}
    </>
  );
}

function MaturityPanel({ data }: { data: AppDataSnapshot }) {
  const { priceSeries, maturityScores, scoreEvolution, metrics } = data;

  return (
    <TabbedContent
        tabs={[
          { id: "summary", label: "Synthèse", badge: `${metrics.maturity.globalScore}/100`, tone: metrics.maturity.globalScore >= 75 ? "success" : "warning", icon: <ShieldCheck className="size-4" /> },
          { id: "profile", label: "Profil", badge: `${maturityScores.length}`, tone: "ai", icon: <Target className="size-4" /> },
          { id: "evolution", label: "Évolution", badge: signed(metrics.maturity.evolution, " pts"), tone: metrics.maturity.evolution >= 0 ? "success" : "danger", icon: <LineChart className="size-4" /> },
          { id: "decision", label: "Décision", badge: metrics.maturity.readiness, tone: "warning", icon: <ClipboardCheck className="size-4" /> },
        ]}
      >
        <TabbedPanel id="summary">
          <div className="grid grid-cols-6 gap-4"><KpiCard label="Score global maturité" value={`${metrics.maturity.globalScore}/100`} delta={signed(metrics.maturity.evolution, " pts")} tone={metrics.maturity.globalScore >= 75 ? "success" : "warning"}><Donut value={metrics.maturity.globalScore} colors={["#22c55e"]} /></KpiCard>{maturityScores.slice(0, 4).map((s, i) => <KpiCard key={s.subject} label={s.subject} value={`${s.score}/100`} delta={`poids ${s.weight}%`} tone={i === 3 ? "warning" : i === 2 ? "ai" : "success"}><Sparkline data={priceSeries.slice(-18)} color={i === 3 ? "#f59e0b" : i === 2 ? "#a855f7" : "#22c55e"} /></KpiCard>)}<KpiCard label="Évolution 30 jours" value={signed(metrics.maturity.evolution, " pts")} delta={`${metrics.maturity.previousScore} → ${metrics.maturity.latestScore}`} tone={metrics.maturity.evolution >= 0 ? "success" : "danger"} /></div>
        </TabbedPanel>
        <TabbedPanel id="profile">
          <div className="grid grid-cols-[1fr_1fr] gap-4"><GlassCard><CardTitle title="Profil de maturité pondéré" /><RadarScore data={maturityScores} /></GlassCard><GlassCard><CardTitle title="Détail des scores par catégorie" /><DataTable headers={["Catégorie", "Score", "Poids", "Statut"]} rows={maturityScores.map((s) => [s.subject, <span key={s.subject} className={s.score >= 72 ? "text-emerald-300" : "text-amber-300"}>{s.score}/100</span>, `${s.weight}%`, <StatusBadge key={`${s.subject}-status`} tone={s.score >= 72 ? "success" : "warning"}>{s.score >= 72 ? "Fort" : "Moyen"}</StatusBadge>])} /></GlassCard></div>
        </TabbedPanel>
        <TabbedPanel id="evolution">
          <GlassCard><CardTitle title="Évolution des scores" /><MultiLineScores data={scoreEvolution} /></GlassCard>
        </TabbedPanel>
        <TabbedPanel id="decision">
          <div className="grid grid-cols-3 gap-4"><GlassCard><CardTitle title="Maturité globale" /><div className="text-2xl font-bold text-amber-300">Bonne mais prudence</div><div className="mt-2 flex items-center gap-2 text-sm text-slate-300">Synthèse<InfoHint content="Comportement globalement solide. Poursuivre paper trading avec surveillance ciblée." /></div><CardTitle title="Checklist" /><Checklist items={[{ label: "Limites de risque", status: "ok" }, { label: "Discipline", status: "ok" }, { label: "Gestion pertes", status: "ok" }, { label: "Stabilité résultats", status: "warning" }, { label: "Patience", status: "warning" }]} /></GlassCard><GlassCard><CardTitle title="Méthodologie & pondérations" /><FieldRows rows={maturityScores.slice(0, 5).map((s) => [s.subject, <ProgressBar key={s.subject} value={s.weight} max={30} tone={s.subject === "Profit" ? "warning" : "ai"} />])} /><div className="mt-3 flex items-center gap-2 text-sm text-slate-300">Pondération<InfoHint content="Le profit n'est pas le critère dominant." /></div></GlassCard><GlassCard><CardTitle title="Décision recommandée" /><div className="space-y-3"><StatusBadge tone="info">{metrics.maturity.readiness}</StatusBadge><StatusBadge tone="neutral">Prochain palier : {metrics.capital.next?.label ?? "aucun"}</StatusBadge><StatusBadge tone={metrics.risk.activeAlerts ? "danger" : "success"}>{metrics.risk.activeAlerts ? "Risque à résoudre" : "Risque stable"}</StatusBadge></div></GlassCard></div>
        </TabbedPanel>
      </TabbedContent>
  );
}

export async function MaturityPage() {
  return <CapitalProgressPage defaultTab="maturity" />;
}

export async function WeeklyPostmortemPage() {
  return <JournalPage defaultTab="postmortem" />;
}

export async function CrisisSimulatorPage() {
  return <RiskPage defaultTab="stress" />;
}

export async function DecisionReplayPage({ initialTradeId }: { initialTradeId?: string } = {}) {
  return <JournalPage defaultTab="replay" initialTradeId={initialTradeId} />;
}

export async function AlertsPage() {
  return <RiskPage defaultTab="alerts" />;
}

export async function RulesPage() {
  return <RiskPage defaultTab="rules" />;
}

export async function HumanValidationPage() {
  return <RiskPage defaultTab="validation" />;
}

function LLMProvidersPanel({ data }: { data: AppDataSnapshot }) {
  const { allLlmProviders, llmRoleConfig, sourceStatus, metrics } = data;
  const connected = metrics.llm.connectedProviders;

  return (
    <>
      <div className="grid grid-cols-5 gap-4">
        <KpiCard label="Fournisseurs catalogue" value={`${metrics.llm.totalProviders}`} delta="OpenAI, Europe, Asie, custom" tone="info" />
        <KpiCard label="Connectés" value={`${connected}`} delta={sourceStatus.llm === "connected" ? "Clés détectées côté serveur" : "Aucune clé dans .env"} tone="success" />
        <KpiCard label="Rôles configurés" value={`${metrics.llm.rolesConfigured}/4`} delta="Principal, rapide, auditeur, fallback" tone="ai" />
        <KpiCard label="Coût estimé aujourd'hui" value={`${metrics.llm.estimatedDailyCost} $`} delta="Depuis logs provider" tone="warning" />
        <KpiCard label="Tokens consommés" value={`${metrics.llm.tokensToday}`} delta="Usage API reçu si provider l'expose" tone="info" />
      </div>

      <div className="mt-4 grid grid-cols-[1fr_360px] gap-4">
        <div className="space-y-4">
          <GlassCard>
            <CardTitle title="Architecture logique" />
            <div className="grid grid-cols-6 gap-3 text-center">
              {["LLM raisonnement", "Moteur stratégie", "Moteur risque", "Exécuteur", "Auditeur", "Journalisation"].map((step, index) => (
                <div key={step} className="rounded-2xl border border-[#16314a] bg-white/[0.03] p-4">
                  <div className="font-bold text-white">{step}</div>
                  {index === 2 ? (
                    <StatusBadge tone="danger">Peut bloquer</StatusBadge>
                  ) : (
                    <StatusBadge tone={index === 0 || index === 4 ? "ai" : "info"}>contrôlé</StatusBadge>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-300">Principe de contrôle<InfoHint content="Même si le LLM recommande un trade, le moteur de risque déterministe peut refuser l'exécution." /></div>
          </GlassCard>

          <GlassCard>
            <CardTitle title="Rôles LLM par agent" />
            <DataTable
              headers={["Rôle", "Provider", "Modèle", "Fallback", "Température", "Raisonnement", "Tokens"]}
              rows={llmRoleConfig.map((cfg) => [
                cfg.role,
                cfg.providerId,
                cfg.modelId,
                cfg.fallbackModelId ?? "-",
                cfg.temperature,
                cfg.reasoningLevel,
                cfg.tokenLimit,
              ])}
            />
          </GlassCard>

          <LLMProviderTabs providers={allLlmProviders} />
        </div>

        <div className="space-y-4">
          <GlassCard>
            <CardTitle title="Configuration sécurisée" />
            <Checklist
              items={[
                { label: "Clés API masquées", status: "ok" },
                { label: "Secrets jamais renvoyés au frontend", status: "ok" },
                { label: "Rotation/révocation prévue", status: "pending" },
                { label: "Logs d'usage", status: "ok" },
                { label: "Mode .env", status: "ok" },
                { label: "Mode interface", status: "ok" },
              ]}
            />
          </GlassCard>
          <LLMLiveInsight page="llm-providers" role="auditeur" />
          <GlassCard>
            <CardTitle title="Ajouter un provider" />
            <TextInput label="Provider" value="Custom OpenAI-compatible" />
            <TextInput label="Base URL" value="https://..." />
            <TextInput label="API key" value="••••••••••••••••" locked />
            <TextInput label="Model ID" value="model-custom" />
            <TextInput label="Rôle" value="principal / rapide / auditeur / fallback" />
            <LocalActionButton actionLabel="Provider custom" className="mt-4 w-full">Tester et enregistrer</LocalActionButton>
          </GlassCard>
          <GlassCard>
            <CardTitle title="Avertissement GPT-5.5" hint="GPT-5.5 Thinking est proposé comme modèle personnalisé privé. Le système ne présuppose pas sa disponibilité publique et doit basculer vers un fallback si l'API refuse le modèle." />
          </GlassCard>
        </div>
      </div>
    </>
  );
}

export async function LLMProvidersPage() {
  return <SettingsPage defaultTab="llm" />;
}
