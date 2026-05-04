"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BrainCircuit,
  Cpu,
  Database,
  Download,
  HardDrive,
  KeyRound,
  Lock,
  Network,
  Palette,
  Save,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import type { AppDataSnapshot } from "@/server/app-data";
import { formatPercent } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checklist, GlassCard, ProgressBar, StatusBadge, TogglePill } from "@/components/ui/dashboard";
import { ExchangeConnectionPanel } from "@/components/settings/ExchangeConnectionPanel";
import { LiveTradingGatePanel } from "@/components/settings/LiveTradingGatePanel";
import { TradingAllocationPanel } from "@/components/settings/TradingAllocationPanel";
import { LocalActionButton } from "@/components/system/LocalActionButton";

type Props = {
  agents: AppDataSnapshot["agents"];
  llmRoleConfig: AppDataSnapshot["llmRoleConfig"];
  metrics: AppDataSnapshot["metrics"];
  riskLimits: AppDataSnapshot["riskLimits"];
  sourceStatus: AppDataSnapshot["sourceStatus"];
};

type Tone = "success" | "danger" | "warning" | "info" | "ai" | "neutral";
type SettingsTabId = "exchange" | "trading" | "agent" | "system" | "alerts" | "security" | "data" | "limits" | "appearance" | "backup";

type SettingsTab = {
  id: SettingsTabId;
  label: string;
  badge: string;
  icon: LucideIcon;
  tone: Tone;
};

export function SettingsWorkspace({ agents, llmRoleConfig, metrics, riskLimits, sourceStatus }: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>("exchange");
  const principalRole = llmRoleConfig.find((role) => role.role === "principal");
  const tabs: SettingsTab[] = [
    { id: "exchange", label: "Exchange", badge: metrics.exchange.apiKeyConfigured ? "API OK" : "API", icon: Network, tone: metrics.exchange.apiKeyConfigured ? "success" : "warning" },
    { id: "trading", label: "Trading", badge: sourceStatus.trading === "paper" ? "Paper" : sourceStatus.trading, icon: ShieldAlert, tone: sourceStatus.trading === "paper" ? "success" : "danger" },
    { id: "agent", label: "Agent", badge: `${metrics.agent.active}/${metrics.agent.total}`, icon: BrainCircuit, tone: metrics.agent.active ? "ai" : "warning" },
    { id: "system", label: "Système", badge: sourceStatus.paperRuntime, icon: Cpu, tone: sourceStatus.paperRuntime === "fresh" ? "success" : "warning" },
    { id: "alerts", label: "Alertes", badge: `${metrics.alert.active}`, icon: Bell, tone: metrics.alert.active ? "warning" : "success" },
    { id: "security", label: "Sécurité", badge: metrics.exchange.withdrawalsEnabled ? "Retraits ON" : "Verrouillé", icon: ShieldCheck, tone: metrics.exchange.withdrawalsEnabled ? "danger" : "success" },
    { id: "data", label: "Données", badge: sourceStatus.market, icon: Database, tone: sourceStatus.market === "connected" ? "success" : "warning" },
    { id: "limits", label: "Limites", badge: `${metrics.risk.activeAlerts}`, icon: SlidersHorizontal, tone: metrics.risk.activeAlerts ? "warning" : "success" },
    { id: "appearance", label: "Apparence", badge: "Sombre", icon: Palette, tone: "info" },
    { id: "backup", label: "Sauvegarde", badge: "Locale", icon: HardDrive, tone: "warning" },
  ];
  const selectedTab = tabs.find((tab) => tab.id === activeTab) ?? tabs[0]!;
  const SelectedIcon = selectedTab.icon;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#16314a] bg-slate-950/60 p-2 shadow-[0_18px_48px_rgba(0,0,0,0.22)] backdrop-blur-xl">
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = tab.id === activeTab;
            return (
              <button
                aria-pressed={selected}
                className={cn(
                  "inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition",
                  selected ? "border-sky-400/70 bg-sky-500/18 text-white shadow-[0_0_22px_rgba(14,165,233,0.16)]" : "border-transparent bg-white/[0.025] text-slate-300 hover:border-sky-400/40 hover:text-sky-100",
                )}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                title={tab.label}
                type="button"
              >
                <Icon className="size-4" />
                <span>{tab.label}</span>
                <StatusBadge className="px-1.5 py-0.5" tone={tab.tone}>{tab.badge}</StatusBadge>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#16314a] bg-white/[0.025] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-sky-400/40 bg-sky-500/10 text-sky-200">
            <SelectedIcon className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold text-white">{selectedTab.label}</h2>
            <div className="mt-1 flex flex-wrap gap-2">
              <StatusBadge tone={selectedTab.tone}>{selectedTab.badge}</StatusBadge>
              <StatusBadge tone="neutral">1 panneau actif</StatusBadge>
            </div>
          </div>
        </div>
        <LocalActionButton actionLabel="Paramètres">
          <Save className="size-4" />
          Enregistrer tout
        </LocalActionButton>
      </div>

      {activeTab === "exchange" ? <ExchangeTab metrics={metrics} sourceStatus={sourceStatus} /> : null}
      {activeTab === "trading" ? <TradingTab metrics={metrics} sourceStatus={sourceStatus} /> : null}
      {activeTab === "agent" ? <AgentTab agents={agents} metrics={metrics} principalRole={principalRole} /> : null}
      {activeTab === "system" ? <SystemTab agents={agents} metrics={metrics} sourceStatus={sourceStatus} /> : null}
      {activeTab === "alerts" ? <AlertsTab metrics={metrics} sourceStatus={sourceStatus} /> : null}
      {activeTab === "security" ? <SecurityTab metrics={metrics} sourceStatus={sourceStatus} /> : null}
      {activeTab === "data" ? <DataTab metrics={metrics} sourceStatus={sourceStatus} /> : null}
      {activeTab === "limits" ? <LimitsTab metrics={metrics} riskLimits={riskLimits} /> : null}
      {activeTab === "appearance" ? <AppearanceTab /> : null}
      {activeTab === "backup" ? <BackupTab metrics={metrics} sourceStatus={sourceStatus} /> : null}
    </div>
  );
}

function ExchangeTab({ metrics, sourceStatus }: Pick<Props, "metrics" | "sourceStatus">) {
  const exchange = metrics.exchange;

  return (
    <div className="grid grid-cols-[minmax(280px,0.85fr)_minmax(360px,1.15fr)] gap-4 max-xl:grid-cols-1">
      <PanelSection action={<StatusBadge tone={exchange.marketDataStatus === "connected" ? "success" : "warning"}>{exchange.marketDataStatus}</StatusBadge>} icon={<Network className="size-5" />} title="État exchange">
        <FieldRows rows={[
          ["Exchange", <StatusBadge key="exchange" tone={exchange.marketDataStatus === "connected" ? "success" : "warning"}>{exchange.provider}</StatusBadge>],
          ["Type marché", exchange.marketType],
          ["Wallet déclaré", exchange.walletConfigured ? <StatusBadge key="wallet" tone="success">{exchange.walletProvider}</StatusBadge> : "non configuré"],
          ["Clé API", exchange.apiKeyConfigured ? "configurée" : "non configurée"],
          ["Clé secrète", exchange.secretConfigured ? "configurée" : "non configurée"],
          ["Dernière synchro", sourceStatus.market === "connected" ? "rendu serveur" : "indisponible"],
        ]} />
        <div className="mt-4 grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <StatusBlock label="Lecture" tone="success" value="Active" />
          <StatusBlock label="Live" tone={exchange.tradingEnabled ? "warning" : "success"} value={exchange.tradingEnabled ? "Configuré" : "Verrouillé"} />
          <StatusBlock label="Retraits" tone={exchange.withdrawalsEnabled ? "danger" : "success"} value={exchange.withdrawalsEnabled ? "Activés" : "Bloqués"} />
          <StatusBlock label="Passphrase" tone={exchange.passphraseConfigured ? "success" : "neutral"} value={exchange.passphraseConfigured ? "OK" : "Optionnelle"} />
        </div>
      </PanelSection>

      <PanelSection icon={<KeyRound className="size-5" />} title="API & wallet">
        <ExchangeConnectionPanel initialStatus={exchange} />
      </PanelSection>
    </div>
  );
}

function TradingTab({ metrics, sourceStatus }: Pick<Props, "metrics" | "sourceStatus">) {
  return (
    <div className="grid grid-cols-[1fr_0.85fr] gap-4 max-xl:grid-cols-1">
      <PanelSection action={<StatusBadge tone="info">Paper Trading</StatusBadge>} icon={<ShieldAlert className="size-5" />} title="Mode de trading">
        <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-1">
          <StatusBlock label="Mode actuel" tone={metrics.exchange.tradingEnabled ? "danger" : "info"} value={metrics.exchange.tradingEnabled ? "Live LLM" : "Paper Trading"} />
          <StatusBlock label="Live" tone={metrics.exchange.tradingEnabled ? "warning" : "success"} value={metrics.exchange.tradingEnabled ? "Configuré" : "Verrouillé"} />
          <StatusBlock label="Retraits" tone={metrics.exchange.withdrawalsEnabled ? "danger" : "success"} value={metrics.exchange.withdrawalsEnabled ? "Activés" : "Désactivés"} />
        </div>
        <div className="mt-4">
          <Checklist items={[
            { label: "Clé API vérifiée", status: metrics.exchange.apiKeyConfigured ? "ok" : "pending" },
            { label: "Wallet déclaré", status: metrics.exchange.walletConfigured ? "ok" : "pending" },
            { label: "Risques live acceptés", status: "pending" },
            { label: "Fonds supportables", status: "pending" },
          ]} />
        </div>
      </PanelSection>

      <PanelSection icon={<Lock className="size-5" />} title="Garde-fous">
        <FieldRows rows={[
          ["Trading source", sourceStatus.trading],
          ["Kill switch", <StatusBadge key="kill" tone={sourceStatus.killSwitch === "inactive" ? "success" : "danger"}>{sourceStatus.killSwitch}</StatusBadge>],
          ["Risque/trade", `${metrics.risk.tradeRiskPercent}% / ${metrics.risk.tradeRiskLimit}%`],
          ["Positions ouvertes", `${metrics.trade.open}`],
          ["Alertes actives", `${metrics.risk.activeAlerts}`],
        ]} />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link href="/risk"><Button className="w-full" variant="ghost">Risque</Button></Link>
          <Link href="/human-validation"><Button className="w-full" variant="ghost">Validation</Button></Link>
        </div>
      </PanelSection>
      <div className="xl:col-span-2">
        <TradingAllocationPanel />
      </div>
      <div className="xl:col-span-2">
        <LiveTradingGatePanel />
      </div>
    </div>
  );
}

function AgentTab({ agents, metrics, principalRole }: Pick<Props, "agents" | "metrics"> & { principalRole: Props["llmRoleConfig"][number] | undefined }) {
  return (
    <div className="grid grid-cols-[1fr_0.85fr] gap-4 max-xl:grid-cols-1">
      <PanelSection action={<StatusBadge tone="ai">{metrics.agent.active} actif(s)</StatusBadge>} icon={<BrainCircuit className="size-5" />} title="Paramètres de l'agent">
        <FieldRows rows={[
          ["Agent actif", <span className="text-emerald-300" key="agent">{agents[0]?.name ?? "Aucun"}</span>],
          ["Modèle IA principal", principalRole?.modelId || "non configuré"],
          ["Provider LLM", principalRole?.providerId || "non configuré"],
          ["Autonomie", `${metrics.agent.active} agent(s) actif(s)`],
          ["Apprentissage auto", <TogglePill key="learning" disabled />],
        ]} />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link href="/llm-providers"><Button className="w-full" variant="ai">Modèles IA</Button></Link>
          <Link href="/agents"><Button className="w-full" variant="ghost">Agents</Button></Link>
        </div>
      </PanelSection>

      <PanelSection title="Santé agent">
        <Checklist items={[
          { label: "Analyse marché", status: metrics.market.watchedPairs ? "ok" : "warning" },
          { label: "Gestion risque", status: metrics.risk.activeAlerts ? "warning" : "ok" },
          { label: "Exécution ordres", status: metrics.exchange.tradingEnabled ? "warning" : "pending" },
          { label: "Apprentissage", status: metrics.llm.connectedProviders ? "ok" : "pending" },
        ]} />
      </PanelSection>
    </div>
  );
}

function SystemTab({ agents, metrics, sourceStatus }: Pick<Props, "agents" | "metrics" | "sourceStatus">) {
  return (
    <div className="grid grid-cols-[1fr_0.85fr] gap-4 max-xl:grid-cols-1">
      <PanelSection action={<StatusBadge tone={sourceStatus.paperRuntime === "fresh" ? "success" : "warning"}>{sourceStatus.paperRuntime}</StatusBadge>} icon={<Cpu className="size-5" />} title="Informations système">
        <FieldRows rows={[
          ["Agent actif", <span className="text-emerald-300" key="agent">{agents[0]?.name ?? "Aucun"}</span>],
          ["Source marché", sourceStatus.market],
          ["Runtime paper", sourceStatus.paperRuntime],
          ["Dernier cycle", runtimeAge(metrics.runtime.paper.lastCycleAgeSeconds)],
          ["Données démo", sourceStatus.demoData],
          ["LLM", sourceStatus.llm],
          ["Mode trading", sourceStatus.trading],
          ["Providers connectés", `${metrics.llm.connectedProviders}/${metrics.llm.totalProviders}`],
        ]} />
      </PanelSection>

      <PanelSection title="Runtime paper">
        <div className="grid grid-cols-2 gap-3">
          <StatusBlock label="Cycles" tone="info" value={`${metrics.runtime.paper.cycles}`} />
          <StatusBlock label="Process" tone={metrics.runtime.paper.process.alive ? "success" : "warning"} value={metrics.runtime.paper.process.alive ? "Actif" : "Arrêté"} />
          <StatusBlock label="Positions" tone="neutral" value={`${metrics.runtime.paper.openPositions}`} />
          <StatusBlock label="Refusés" tone={metrics.runtime.paper.refusedSignals ? "warning" : "success"} value={`${metrics.runtime.paper.refusedSignals}`} />
        </div>
      </PanelSection>
    </div>
  );
}

function AlertsTab({ metrics, sourceStatus }: Pick<Props, "metrics" | "sourceStatus">) {
  return (
    <div className="grid grid-cols-[1fr_0.85fr] gap-4 max-xl:grid-cols-1">
      <PanelSection action={<StatusBadge tone={metrics.alert.active ? "warning" : "success"}>{metrics.alert.active} active(s)</StatusBadge>} icon={<Bell className="size-5" />} title="Notifications">
        <div className="space-y-3">
          <ToggleRow label="Push mobile" />
          <ToggleRow label="Email" />
          <ToggleRow label="Telegram" />
        </div>
        <div className="mt-4">
          <Tags items={["Toutes", "Élevées", "Critiques"]} />
        </div>
      </PanelSection>

      <PanelSection title="Flux surveillé">
        <FieldRows rows={[
          ["Alertes actives", `${metrics.alert.active}`],
          ["Critiques", `${metrics.alert.critical}`],
          ["API incidents", `${metrics.alert.apiIncidents}`],
          ["Kill switch", sourceStatus.killSwitch],
        ]} />
        <Link href="/alerts"><Button className="mt-4 w-full" variant="ghost">Centre d'alertes</Button></Link>
      </PanelSection>
    </div>
  );
}

function SecurityTab({ metrics, sourceStatus }: Pick<Props, "metrics" | "sourceStatus">) {
  return (
    <div className="grid grid-cols-[1fr_0.85fr] gap-4 max-xl:grid-cols-1">
      <PanelSection action={<StatusBadge tone="success">Secrets masqués</StatusBadge>} icon={<ShieldCheck className="size-5" />} title="Sécurité & accès">
        <div className="space-y-3">
          <ToggleRow label="2FA" active={false} />
          <ToggleRow label="Journal d'audit" />
          <ToggleRow label="Secrets frontend" />
        </div>
        <FieldRows rows={[
          ["Permissions", "Rôles et accès"],
          ["Retraits", metrics.exchange.withdrawalsEnabled ? "Activés" : "Désactivés"],
          ["Live trading", sourceStatus.trading],
          ["Clé secrète", metrics.exchange.secretConfigured ? "configurée" : "non configurée"],
        ]} />
      </PanelSection>

      <PanelSection title="Verrous critiques">
        <Checklist items={[
          { label: "Secrets non exposés côté interface", status: "ok" },
          { label: "Retraits désactivés", status: metrics.exchange.withdrawalsEnabled ? "danger" : "ok" },
          { label: "Mode live verrouillé", status: sourceStatus.trading === "live-enabled" ? "warning" : "ok" },
          { label: "Kill switch disponible", status: sourceStatus.killSwitch === "inactive" ? "ok" : "danger" },
        ]} />
      </PanelSection>
    </div>
  );
}

function DataTab({ metrics, sourceStatus }: Pick<Props, "metrics" | "sourceStatus">) {
  return (
    <div className="grid grid-cols-[1fr_0.85fr] gap-4 max-xl:grid-cols-1">
      <PanelSection action={<StatusBadge tone={sourceStatus.market === "connected" ? "success" : "warning"}>{sourceStatus.market}</StatusBadge>} icon={<Database className="size-5" />} title="Données & marché">
        <FieldRows rows={[
          ["Source", `${metrics.exchange.provider} public data`],
          ["Type", metrics.exchange.marketType],
          ["Paires suivies", `${metrics.market.watchedPairs}`],
          ["Paire active", metrics.market.primarySymbol],
          ["Fuseau", "Europe/Paris"],
          ["Données démo", sourceStatus.demoData],
        ]} />
      </PanelSection>

      <PanelSection title="Qualité du flux">
        <div className="space-y-4">
          <SliderRow label="Confiance moyenne" tone="info" value={metrics.market.avgConfidence} />
          <SliderRow label="Ratio positif" tone={metrics.market.positiveRatio >= 50 ? "success" : "warning"} value={metrics.market.positiveRatio} />
          <SliderRow label="Volatilité moyenne" max={10} tone="warning" value={metrics.market.avgVolatility} />
        </div>
      </PanelSection>
    </div>
  );
}

function LimitsTab({ metrics, riskLimits }: Pick<Props, "metrics" | "riskLimits">) {
  return (
    <div className="grid grid-cols-[1fr_0.85fr] gap-4 max-xl:grid-cols-1">
      <PanelSection action={<StatusBadge tone={metrics.risk.activeAlerts ? "warning" : "success"}>{metrics.risk.activeAlerts} alerte(s)</StatusBadge>} icon={<SlidersHorizontal className="size-5" />} title="Limites par défaut">
        <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-1">
          <SettingInput label="Risque quotidien max" value={`${metrics.risk.dailyRiskLimit}%`} />
          <SettingInput label="Drawdown max autorisé" value={`${metrics.risk.drawdownLimit}%`} />
          <SettingInput label="Positions ouvertes" value={`${metrics.trade.open}`} />
        </div>
      </PanelSection>

      <PanelSection title="Utilisation actuelle">
        <div className="space-y-4">
          {riskLimits.map((limit) => (
            <SliderRow
              key={limit.label}
              label={`${limit.label} · ${limit.current}/${limit.limit}${limit.unit}`}
              tone={limit.current >= limit.limit ? "danger" : limit.current > limit.limit * 0.7 ? "warning" : "success"}
              value={(limit.current / Math.max(limit.limit, 1)) * 100}
            />
          ))}
        </div>
      </PanelSection>
    </div>
  );
}

function AppearanceTab() {
  return (
    <div className="grid grid-cols-[1fr_0.85fr] gap-4 max-xl:grid-cols-1">
      <PanelSection action={<StatusBadge tone="info">Sombre</StatusBadge>} icon={<Palette className="size-5" />} title="Apparence">
        <Tags items={["Sombre", "Dynamique", "Clair", "Compact"]} />
        <div className="mt-4 flex flex-wrap gap-3">
          {["bg-sky-500", "bg-violet-500", "bg-cyan-400", "bg-emerald-400", "bg-amber-400", "bg-red-400"].map((color) => (
            <button aria-label={`Couleur ${color}`} className={cn("size-8 rounded-full border border-white/20 shadow-lg", color)} key={color} type="button" />
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Densité">
        <div className="space-y-3">
          <ToggleRow label="Mode compact" />
          <ToggleRow label="Animations discrètes" />
          <ToggleRow label="Contraste élevé" active={false} />
        </div>
      </PanelSection>
    </div>
  );
}

function BackupTab({ metrics, sourceStatus }: Pick<Props, "metrics" | "sourceStatus">) {
  return (
    <div className="grid grid-cols-[1fr_0.85fr] gap-4 max-xl:grid-cols-1">
      <PanelSection action={<StatusBadge tone="warning">Partiel runtime</StatusBadge>} icon={<HardDrive className="size-5" />} title="Sauvegarde & export">
        <FieldRows rows={[
          ["Dernière sauvegarde", "stockage local/distant prêt"],
          ["Sauvegarde auto", <StatusBadge key="auto" tone="warning">Prévue API</StatusBadge>],
          ["Trades audités", `${metrics.trade.total}`],
          ["Runtime paper", sourceStatus.paperRuntime],
        ]} />
        <div className="mt-4 grid grid-cols-2 gap-2 max-sm:grid-cols-1">
          <LocalActionButton actionLabel="Sauvegarde runtime" className="w-full" variant="ghost">
            <Save className="size-4" />
            Sauvegarder
          </LocalActionButton>
          <LocalActionButton actionLabel="Export paramètres" className="w-full" variant="ghost">
            <Download className="size-4" />
            Exporter
          </LocalActionButton>
        </div>
      </PanelSection>

      <PanelSection title="Contenu sauvegardé">
        <Checklist items={[
          { label: "Configuration exchange", status: metrics.exchange.apiKeyConfigured ? "ok" : "pending" },
          { label: "Statut runtime paper", status: sourceStatus.paperRuntime === "fresh" ? "ok" : "warning" },
          { label: "Secrets masqués", status: "ok" },
          { label: "Préférences interface", status: "pending" },
        ]} />
      </PanelSection>
    </div>
  );
}

function PanelSection({ action, children, className, icon, title }: { action?: ReactNode; children: ReactNode; className?: string; icon?: ReactNode; title: string }) {
  return (
    <GlassCard className={cn("min-w-0", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {icon ? <span className="shrink-0 text-sky-300">{icon}</span> : null}
          <div className="truncate text-base font-bold text-white">{title}</div>
        </div>
        {action}
      </div>
      {children}
    </GlassCard>
  );
}

function FieldRows({ rows }: { rows: Array<[string, ReactNode]> }) {
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

function Tags({ items, tone = "info" }: { items: string[]; tone?: Tone }) {
  return <div className="flex flex-wrap gap-2">{items.map((item) => <StatusBadge key={item} tone={tone}>{item}</StatusBadge>)}</div>;
}

function ToggleRow({ active = true, label }: { active?: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#16314a] bg-white/[0.025] px-3 py-2 text-sm">
      <span className="min-w-0 truncate text-slate-200">{label}</span>
      <TogglePill active={active} disabled />
    </div>
  );
}

function SettingInput({ label, value }: { label: string; value: string }) {
  return (
    <label className="block text-xs text-slate-400">
      {label}
      <div className="mt-1 flex h-10 items-center justify-between rounded-xl border border-[#1b3a55] bg-slate-950/50 px-3 text-sm text-slate-200">
        <span className="truncate">{value}</span>
        <Lock className="size-4 shrink-0 text-slate-500" />
      </div>
    </label>
  );
}

function StatusBlock({ label, tone, value }: { label: string; tone: Tone; value: string }) {
  return (
    <div className="rounded-xl border border-[#16314a] bg-white/[0.025] px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1"><StatusBadge tone={tone}>{value}</StatusBadge></div>
    </div>
  );
}

function SliderRow({ label, max = 100, tone = "info", value }: { label: string; max?: number; tone?: Tone; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-3 text-sm">
        <span className="min-w-0 truncate text-slate-300">{label}</span>
        <span className="shrink-0 font-mono text-white">{formatPercent(value, value > 0 && value < 10 ? 1 : 0)}</span>
      </div>
      <ProgressBar max={max} tone={tone} value={value} />
    </div>
  );
}

function runtimeAge(seconds: number | null) {
  if (seconds === null) return "aucun cycle";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  return `${Math.floor(seconds / 3600)} h`;
}
