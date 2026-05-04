"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowDownCircle,
  CheckCircle2,
  ClipboardCheck,
  Gauge,
  Lock,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Target,
  WalletCards,
} from "lucide-react";
import type { AppDataSnapshot } from "@/server/app-data";
import { CAPITAL_STAGES } from "@/lib/constants";
import { formatPercent, signed } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { GlassCard, KpiCard, ProgressBar, StatusBadge, Timeline, TogglePill } from "@/components/ui/dashboard";
import { TabbedContent, TabbedPanel } from "@/components/ui/tabbed-content";
import { Donut, Sparkline } from "@/components/charts/charts";
import { LocalActionButton } from "@/components/system/LocalActionButton";

type CapitalStage = (typeof CAPITAL_STAGES)[number];
type CapitalStageId = CapitalStage["id"];
type DecisionMode = "maintain" | "prepare" | "promote" | "pause" | "rollback";
type AllocationMode = "paper" | "prepared-live" | "frozen";
type ScenarioMode = "strict" | "standard" | "stress";
type Tone = "success" | "danger" | "warning" | "info" | "ai" | "neutral";

type CapitalProgressWorkspaceProps = {
  metrics: AppDataSnapshot["metrics"];
  priceSeries: AppDataSnapshot["priceSeries"];
  sourceStatus: AppDataSnapshot["sourceStatus"];
};

type Gate = {
  defaultChecked: boolean;
  detail: string;
  id: string;
  label: string;
  score: number;
};

const decisionOptions: Array<{
  detail: string;
  icon: ReactNode;
  id: DecisionMode;
  label: string;
  tone: Tone;
}> = [
  { id: "maintain", label: "Maintenir", detail: "Garder le niveau actuel", tone: "success", icon: <ShieldCheck className="size-4" /> },
  { id: "prepare", label: "Préparer montée", detail: "Créer un dossier de passage", tone: "info", icon: <Target className="size-4" /> },
  { id: "promote", label: "Demander validation", detail: "Soumettre la cible choisie", tone: "ai", icon: <ClipboardCheck className="size-4" /> },
  { id: "pause", label: "Geler niveau", detail: "Bloquer toute montée", tone: "warning", icon: <Pause className="size-4" /> },
  { id: "rollback", label: "Rétrograder", detail: "Revenir à un palier inférieur", tone: "danger", icon: <ArrowDownCircle className="size-4" /> },
];

const allocationModes: Array<{ detail: string; id: AllocationMode; label: string; tone: Tone }> = [
  { id: "paper", label: "Paper", detail: "Simulation active", tone: "success" },
  { id: "prepared-live", label: "Préparer réel", detail: "Validation requise", tone: "warning" },
  { id: "frozen", label: "Gel", detail: "Pas de montée", tone: "neutral" },
];

const scenarioModes: Array<{ factor: number; id: ScenarioMode; label: string; tone: Tone }> = [
  { id: "strict", label: "Strict", factor: 0.5, tone: "success" },
  { id: "standard", label: "Standard", factor: 1, tone: "info" },
  { id: "stress", label: "Stress", factor: 1.5, tone: "warning" },
];

function parseCapitalValue(value: string) {
  const parsed = Number(value.replace(/[^\d,.]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function stageTone(stage: CapitalStage): Tone {
  if (stage.state === "current") return "success";
  if (stage.state === "locked") return "neutral";
  if (stage.state === "pending") return "warning";
  return "info";
}

function readinessTone(value: number): Tone {
  if (value >= 80) return "success";
  if (value >= 60) return "warning";
  return "danger";
}

function decisionVariant(decision: DecisionMode): React.ComponentProps<typeof Button>["variant"] {
  if (decision === "rollback") return "danger";
  if (decision === "pause") return "warning";
  if (decision === "promote") return "ai";
  if (decision === "maintain") return "success";
  return "default";
}

function formatUsd(value: number) {
  if (!Number.isFinite(value)) return "0 $";
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: value < 10 ? 2 : 0 })} $`;
}

function PanelTitle({ action, eyebrow, title }: { action?: ReactNode; eyebrow?: string; title: string }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        {eyebrow ? <div className="text-xs font-semibold uppercase tracking-wide text-sky-300">{eyebrow}</div> : null}
        <h2 className="mt-1 text-base font-bold text-white">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function FieldRows({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <div className="divide-y divide-[#16314a] text-sm">
      {rows.map(([label, value]) => (
        <div className="flex items-center justify-between gap-4 py-2" key={label}>
          <span className="text-slate-400">{label}</span>
          <span className="text-right font-medium text-slate-100">{value}</span>
        </div>
      ))}
    </div>
  );
}

function ChoiceButton({
  active,
  detail,
  label,
  onClick,
  tone = "info",
}: {
  active: boolean;
  detail?: string;
  label: string;
  onClick: () => void;
  tone?: Tone;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "min-h-16 rounded-xl border p-3 text-left transition",
        active
          ? "border-sky-400/70 bg-sky-500/18 text-white shadow-[0_0_22px_rgba(14,165,233,0.14)]"
          : "border-[#16314a] bg-slate-950/35 text-slate-300 hover:border-sky-400/40 hover:text-sky-100",
      )}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold">{label}</span>
        <StatusBadge tone={active ? tone : "neutral"}>{active ? "choisi" : "option"}</StatusBadge>
      </div>
      {detail ? <div className="mt-1 text-xs text-slate-400">{detail}</div> : null}
    </button>
  );
}

function DecisionButton({
  active,
  detail,
  icon,
  label,
  onClick,
  tone,
}: {
  active: boolean;
  detail: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tone: Tone;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "flex min-h-16 items-center justify-between gap-3 rounded-xl border p-3 text-left transition",
        active
          ? "border-sky-400/70 bg-sky-500/18 text-white shadow-[0_0_22px_rgba(14,165,233,0.14)]"
          : "border-[#16314a] bg-slate-950/35 text-slate-300 hover:border-sky-400/40 hover:text-sky-100",
      )}
      onClick={onClick}
      type="button"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg border", active ? "border-sky-400/50 bg-sky-500/16 text-sky-200" : "border-white/10 bg-white/[0.03] text-slate-400")}>{icon}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold">{label}</span>
          <span className="block text-xs text-slate-400">{detail}</span>
        </span>
      </span>
      <StatusBadge tone={active ? tone : "neutral"}>{active ? "actif" : "choisir"}</StatusBadge>
    </button>
  );
}

function StageChoice({
  active,
  index,
  onClick,
  stage,
}: {
  active: boolean;
  index: number;
  onClick: () => void;
  stage: CapitalStage;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "flex min-h-[122px] flex-col justify-between rounded-2xl border p-3 text-left transition",
        active
          ? "border-sky-400/80 bg-sky-500/18 shadow-[0_0_28px_rgba(14,165,233,0.16)]"
          : "border-[#16314a] bg-slate-950/35 hover:border-sky-400/40 hover:bg-sky-500/8",
      )}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-sky-400/30 bg-sky-500/10 font-mono text-xs text-sky-200">
          {index + 1}
        </span>
        {stage.state === "locked" ? <Lock className="size-4 shrink-0 text-slate-500" /> : active ? <CheckCircle2 className="size-4 shrink-0 text-emerald-300" /> : null}
      </div>
      <div>
        <div className="font-bold text-white">{stage.label}</div>
        <div className="mt-1 font-mono text-sm text-sky-300">{stage.capital}</div>
      </div>
      <StatusBadge tone={stageTone(stage)}>{stage.state}</StatusBadge>
    </button>
  );
}

function GateToggleRow({
  checked,
  gate,
  onToggle,
}: {
  checked: boolean;
  gate: Gate;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[#16314a] bg-slate-950/35 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-white">{gate.label}</div>
          <div className="mt-1 text-xs text-slate-400">{gate.detail}</div>
        </div>
        <TogglePill active={checked} onClick={onToggle} title={checked ? "Marquer non validé" : "Marquer validé"} />
      </div>
      <div className="mt-3">
        <ProgressBar value={gate.score} tone={checked ? "success" : "warning"} />
      </div>
    </div>
  );
}

function SliderRow({ label, tone = "info", value }: { label: string; tone?: Tone; value: number }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="text-slate-300">{label}</span>
        <span className="font-mono text-slate-100">{Math.round(value)}%</span>
      </div>
      <ProgressBar value={value} tone={tone} />
    </div>
  );
}

export function CapitalProgressWorkspace({ metrics, priceSeries, sourceStatus }: CapitalProgressWorkspaceProps) {
  const defaultTarget = (metrics.capital.next?.id ?? metrics.capital.current.id) as CapitalStageId;
  const [selectedStageId, setSelectedStageId] = useState<CapitalStageId>(defaultTarget);
  const [decision, setDecision] = useState<DecisionMode>("prepare");
  const [allocationMode, setAllocationMode] = useState<AllocationMode>("paper");
  const [scenario, setScenario] = useState<ScenarioMode>("standard");
  const [reviewNote, setReviewNote] = useState("");
  const [lastPrepared, setLastPrepared] = useState<string | null>(null);
  const [gateOverrides, setGateOverrides] = useState<Record<string, boolean>>({});

  const selectedStage = CAPITAL_STAGES.find((stage) => stage.id === selectedStageId) ?? metrics.capital.current;
  const selectedDecision = decisionOptions.find((option) => option.id === decision) ?? decisionOptions[0];
  const selectedScenario = scenarioModes.find((option) => option.id === scenario) ?? scenarioModes[1];
  const currentAmount = parseCapitalValue(metrics.capital.current.capital);
  const targetAmount = parseCapitalValue(selectedStage.capital);
  const selectedStageIndex = CAPITAL_STAGES.findIndex((stage) => stage.id === selectedStage.id);
  const targetDelta = selectedStageIndex - metrics.capital.currentIndex;
  const targetSequence = targetDelta === 0 ? "niveau actuel" : targetDelta === 1 ? "montée directe" : targetDelta > 1 ? `+${targetDelta} paliers` : `${Math.abs(targetDelta)} palier(s) retour`;
  const hasBlockingRisk = metrics.risk.drawdownPercent > metrics.risk.drawdownLimit || metrics.risk.dailyRiskPercent > metrics.risk.dailyRiskLimit || sourceStatus.killSwitch === "active";

  const gates = useMemo<Gate[]>(
    () => [
      {
        id: "journal",
        label: "Journal suffisant",
        detail: `${metrics.trade.total}/20 décisions journalisées`,
        score: Math.min(100, (metrics.trade.total / 20) * 100),
        defaultChecked: metrics.trade.total >= 20,
      },
      {
        id: "drawdown",
        label: "Drawdown acceptable",
        detail: `${formatPercent(metrics.risk.drawdownPercent)} sur ${formatPercent(metrics.risk.drawdownLimit)}`,
        score: Math.max(0, 100 - (metrics.risk.drawdownPercent / Math.max(metrics.risk.drawdownLimit, 1)) * 100),
        defaultChecked: metrics.risk.drawdownPercent <= metrics.risk.drawdownLimit,
      },
      {
        id: "discipline",
        label: "Discipline validée",
        detail: `${metrics.trade.averageDiscipline}/100 de score moyen`,
        score: metrics.trade.averageDiscipline,
        defaultChecked: metrics.trade.averageDiscipline >= 75,
      },
      {
        id: "rules",
        label: "Règles respectées",
        detail: `${formatPercent(metrics.risk.conformityPercent, 0)} de conformité runtime`,
        score: metrics.risk.conformityPercent,
        defaultChecked: metrics.risk.conformityPercent >= 90,
      },
      {
        id: "risk-budget",
        label: "Budget risque disponible",
        detail: `${formatPercent(metrics.risk.dailyRiskPercent)} utilisé sur ${formatPercent(metrics.risk.dailyRiskLimit)}`,
        score: Math.max(0, 100 - (metrics.risk.dailyRiskPercent / Math.max(metrics.risk.dailyRiskLimit, 1)) * 100),
        defaultChecked: metrics.risk.dailyRiskPercent <= metrics.risk.dailyRiskLimit * 0.7,
      },
      {
        id: "human",
        label: "Validation humaine",
        detail: selectedStage.state === "locked" ? "Obligatoire pour palier verrouillé" : "Recommandée avant promotion",
        score: selectedStage.state === "locked" ? 35 : 70,
        defaultChecked: selectedStage.state !== "locked",
      },
    ],
    [metrics.risk.conformityPercent, metrics.risk.dailyRiskLimit, metrics.risk.dailyRiskPercent, metrics.risk.drawdownLimit, metrics.risk.drawdownPercent, metrics.trade.averageDiscipline, metrics.trade.total, selectedStage.state],
  );

  const gateStatus = (gate: Gate) => gateOverrides[gate.id] ?? gate.defaultChecked;
  const approvedGateCount = gates.filter((gate) => gateStatus(gate)).length;
  const userReadiness = Math.round((metrics.capital.readiness * 0.5) + ((approvedGateCount / gates.length) * 100 * 0.5));
  const gateTone = readinessTone(userReadiness);
  const riskPerTradeUsd = targetAmount * (metrics.risk.tradeRiskPercent / 100) * selectedScenario.factor;
  const dailyRiskUsd = targetAmount * (metrics.risk.dailyRiskLimit / 100) * selectedScenario.factor;
  const targetChange = targetAmount - currentAmount;
  const isLockedTarget = selectedStage.state === "locked";
  const actionStatus = hasBlockingRisk
    ? "Risque à résoudre"
    : decision === "pause"
      ? "Montée gelée"
      : decision === "rollback"
        ? "Retour préparé"
        : isLockedTarget
          ? "Validation requise"
          : userReadiness >= 80
            ? "Prêt à soumettre"
            : "À renforcer";

  const stageCapitalSeries = CAPITAL_STAGES.map((stage) => ({ label: stage.label, value: parseCapitalValue(stage.capital) }));

  function toggleGate(id: string, fallback: boolean) {
    setGateOverrides((current) => ({ ...current, [id]: !(current[id] ?? fallback) }));
  }

  function resetChoices() {
    setSelectedStageId(defaultTarget);
    setDecision("prepare");
    setAllocationMode("paper");
    setScenario("standard");
    setReviewNote("");
    setLastPrepared(null);
    setGateOverrides({});
  }

  return (
    <TabbedContent
      tabs={[
        { id: "decision", label: "Décision", badge: selectedStage.label, tone: selectedDecision.tone, icon: <ClipboardCheck className="size-4" /> },
        { id: "gates", label: "Gates", badge: `${approvedGateCount}/${gates.length}`, tone: gateTone, icon: <ShieldCheck className="size-4" /> },
        { id: "simulation", label: "Simulation", badge: `${userReadiness}%`, tone: gateTone, icon: <Gauge className="size-4" /> },
        { id: "history", label: "Historique", badge: `${metrics.trade.total} trades`, tone: "info", icon: <Activity className="size-4" /> },
      ]}
    >
      <TabbedPanel id="decision">
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4 max-xl:grid-cols-2 max-md:grid-cols-1">
            <KpiCard label="Niveau actuel" value={metrics.capital.current.label} delta={`Palier ${metrics.capital.currentIndex + 1}/${CAPITAL_STAGES.length}`} tone="success" icon={<WalletCards className="size-4" />} />
            <KpiCard label="Cible choisie" value={selectedStage.label} delta={targetSequence} tone={isLockedTarget ? "warning" : "info"} icon={<Target className="size-4" />} />
            <KpiCard label="Readiness utilisateur" value={`${userReadiness}%`} delta={`${approvedGateCount}/${gates.length} gates validées`} tone={gateTone}>
              <ProgressBar value={userReadiness} tone={gateTone} />
            </KpiCard>
            <KpiCard label="Décision locale" value={selectedDecision.label} delta={actionStatus} tone={selectedDecision.tone}>
              <Donut value={userReadiness} colors={[userReadiness >= 80 ? "#22c55e" : userReadiness >= 60 ? "#f59e0b" : "#ef4444"]} />
            </KpiCard>
          </div>

          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)] gap-4 max-xl:grid-cols-1">
            <GlassCard>
              <PanelTitle eyebrow="Cible" title="Choisir le palier de capital" />
              <div className="grid grid-cols-7 gap-3 max-2xl:grid-cols-4 max-lg:grid-cols-3 max-md:grid-cols-2">
                {CAPITAL_STAGES.map((stage, index) => (
                  <StageChoice active={stage.id === selectedStageId} index={index} key={stage.id} onClick={() => setSelectedStageId(stage.id)} stage={stage} />
                ))}
              </div>
            </GlassCard>

            <GlassCard>
              <PanelTitle eyebrow="Décision" title="Choisir quoi faire maintenant" />
              <div className="space-y-2">
                {decisionOptions.map((option) => (
                  <DecisionButton
                    active={option.id === decision}
                    detail={option.detail}
                    icon={option.icon}
                    key={option.id}
                    label={option.label}
                    onClick={() => setDecision(option.id)}
                    tone={option.tone}
                  />
                ))}
              </div>
            </GlassCard>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-4 max-xl:grid-cols-1">
            <GlassCard>
              <PanelTitle eyebrow="Mode" title="Mode d'allocation demandé" />
              <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
                {allocationModes.map((mode) => (
                  <ChoiceButton
                    active={mode.id === allocationMode}
                    detail={mode.detail}
                    key={mode.id}
                    label={mode.label}
                    onClick={() => setAllocationMode(mode.id)}
                    tone={mode.tone}
                  />
                ))}
              </div>
              <textarea
                className="mt-4 min-h-28 w-full resize-y rounded-2xl border border-[#16314a] bg-slate-950/45 p-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-400/60"
                onChange={(event) => setReviewNote(event.target.value)}
                placeholder="Note de décision, condition de passage, raison du gel ou demande de validation..."
                value={reviewNote}
              />
            </GlassCard>

            <GlassCard>
              <PanelTitle eyebrow="Préparation" title="Synthèse de l'action" />
              <FieldRows
                rows={[
                  ["Cible", <StatusBadge key="target" tone={stageTone(selectedStage)}>{selectedStage.label}</StatusBadge>],
                  ["Décision", <StatusBadge key="decision" tone={selectedDecision.tone}>{selectedDecision.label}</StatusBadge>],
                  ["Mode demandé", allocationModes.find((mode) => mode.id === allocationMode)?.label ?? allocationMode],
                  ["Statut", <StatusBadge key="status" tone={hasBlockingRisk ? "danger" : isLockedTarget ? "warning" : gateTone}>{actionStatus}</StatusBadge>],
                  ["Live runtime", <StatusBadge key="live" tone={sourceStatus.trading === "live-enabled" ? "danger" : "success"}>{sourceStatus.trading}</StatusBadge>],
                ]}
              />
              <div className="mt-4 flex flex-wrap gap-2">
                <LocalActionButton
                  actionLabel="Décision capital"
                  onClick={() => setLastPrepared(`${selectedDecision.label} · ${selectedStage.label} · ${allocationModes.find((mode) => mode.id === allocationMode)?.label ?? allocationMode}`)}
                  variant={decisionVariant(decision)}
                >
                  Préparer décision locale <Play className="size-4" />
                </LocalActionButton>
                <Button onClick={resetChoices} variant="ghost">
                  <RotateCcw className="size-4" /> Réinitialiser
                </Button>
              </div>
              {lastPrepared ? <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/8 p-3 text-sm text-emerald-200">{lastPrepared}</div> : null}
            </GlassCard>
          </div>
        </div>
      </TabbedPanel>

      <TabbedPanel id="gates">
        <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-4 max-xl:grid-cols-1">
          <GlassCard>
            <PanelTitle eyebrow="Validation" title="Gates modifiables par l'utilisateur" action={<StatusBadge tone={gateTone}>{approvedGateCount}/{gates.length}</StatusBadge>} />
            <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
              {gates.map((gate) => (
                <GateToggleRow checked={gateStatus(gate)} gate={gate} key={gate.id} onToggle={() => toggleGate(gate.id, gate.defaultChecked)} />
              ))}
            </div>
          </GlassCard>

          <div className="space-y-4">
            <GlassCard>
              <PanelTitle eyebrow="Score" title="Résultat après choix" />
              <div className="grid place-items-center py-2">
                <Donut value={userReadiness} colors={[userReadiness >= 80 ? "#22c55e" : userReadiness >= 60 ? "#f59e0b" : "#ef4444"]} />
              </div>
              <FieldRows
                rows={[
                  ["Readiness serveur", `${metrics.capital.readiness}%`],
                  ["Readiness ajustée", <span className="font-mono text-sky-300" key="r">{userReadiness}%</span>],
                  ["Gates validées", `${approvedGateCount}/${gates.length}`],
                  ["Risque bloquant", hasBlockingRisk ? <span className="text-red-300" key="yes">oui</span> : <span className="text-emerald-300" key="no">non</span>],
                ]}
              />
            </GlassCard>

            <GlassCard>
              <PanelTitle eyebrow="Arrêts" title="Conditions qui bloquent" />
              <div className="space-y-4">
                <SliderRow label={`Risque jour · ${formatPercent(metrics.risk.dailyRiskPercent)}/${formatPercent(metrics.risk.dailyRiskLimit)}`} tone={metrics.risk.dailyRiskPercent > metrics.risk.dailyRiskLimit ? "danger" : "success"} value={(metrics.risk.dailyRiskPercent / Math.max(metrics.risk.dailyRiskLimit, 1)) * 100} />
                <SliderRow label={`Drawdown · ${formatPercent(metrics.risk.drawdownPercent)}/${formatPercent(metrics.risk.drawdownLimit)}`} tone={metrics.risk.drawdownPercent > metrics.risk.drawdownLimit ? "danger" : "warning"} value={(metrics.risk.drawdownPercent / Math.max(metrics.risk.drawdownLimit, 1)) * 100} />
                <SliderRow label={`Conformité · ${formatPercent(metrics.risk.conformityPercent, 0)}`} tone="success" value={metrics.risk.conformityPercent} />
              </div>
            </GlassCard>
          </div>
        </div>
      </TabbedPanel>

      <TabbedPanel id="simulation">
        <div className="space-y-4">
          <div className="grid grid-cols-5 gap-4 max-2xl:grid-cols-3 max-lg:grid-cols-2 max-md:grid-cols-1">
            <KpiCard label="Capital cible" value={selectedStage.capital} delta={targetSequence} tone={isLockedTarget ? "warning" : "info"} />
            <KpiCard label="Écart vs actuel" value={signed(targetChange, " $")} delta={`${metrics.capital.current.capital} actuel`} tone={targetChange >= 0 ? "success" : "warning"} />
            <KpiCard label="Risque/trade simulé" value={formatUsd(riskPerTradeUsd)} delta={`${metrics.risk.tradeRiskPercent}% · ${selectedScenario.label}`} tone={riskPerTradeUsd > targetAmount * 0.02 ? "warning" : "info"} />
            <KpiCard label="Perte jour max" value={formatUsd(dailyRiskUsd)} delta={`${metrics.risk.dailyRiskLimit}% · ${selectedScenario.label}`} tone={dailyRiskUsd > targetAmount * 0.03 ? "danger" : "warning"} />
            <KpiCard label="P&L audité" value={signed(metrics.trade.pnlTotal, " $")} delta={`${metrics.trade.total} décisions`} tone={metrics.trade.pnlTotal >= 0 ? "success" : "danger"}>
              <Sparkline data={priceSeries.slice(-18)} color={metrics.trade.pnlTotal >= 0 ? "#22c55e" : "#ef4444"} />
            </KpiCard>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-4 max-xl:grid-cols-1">
            <GlassCard>
              <PanelTitle eyebrow="Projection" title="Capital par palier" />
              <div className="h-56">
                <Sparkline data={stageCapitalSeries} dataKey="value" color="#0ea5e9" />
              </div>
              <div className="mt-4 grid grid-cols-7 gap-2 max-lg:grid-cols-4 max-md:grid-cols-2">
                {CAPITAL_STAGES.map((stage) => (
                  <button
                    aria-pressed={stage.id === selectedStageId}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-left text-xs transition",
                      stage.id === selectedStageId ? "border-sky-400/70 bg-sky-500/18 text-white" : "border-[#16314a] bg-slate-950/35 text-slate-400 hover:border-sky-400/40",
                    )}
                    key={stage.id}
                    onClick={() => setSelectedStageId(stage.id)}
                    type="button"
                  >
                    <span className="block font-semibold">{stage.label}</span>
                    <span className="font-mono text-sky-300">{stage.capital}</span>
                  </button>
                ))}
              </div>
            </GlassCard>

            <GlassCard>
              <PanelTitle eyebrow="Scénario" title="Choisir le stress de calcul" />
              <div className="space-y-2">
                {scenarioModes.map((mode) => (
                  <ChoiceButton active={mode.id === scenario} detail={`Facteur x${mode.factor}`} key={mode.id} label={mode.label} onClick={() => setScenario(mode.id)} tone={mode.tone} />
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/8 p-3 text-sm text-amber-100">
                La simulation prépare une décision. Elle ne modifie pas le capital, le wallet, ni le mode live.
              </div>
            </GlassCard>
          </div>
        </div>
      </TabbedPanel>

      <TabbedPanel id="history">
        <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-4 max-xl:grid-cols-1">
          <GlassCard>
            <PanelTitle eyebrow="Paliers" title="Historique de progression" />
            <Timeline
              items={[
                { time: "maintenant", title: `${metrics.capital.current.label} actif`, tone: "success" },
                { time: "choix", title: lastPrepared ?? `${selectedDecision.label} vers ${selectedStage.label}`, tone: selectedDecision.tone },
                { time: "avant", title: `${CAPITAL_STAGES[1].label} validé`, tone: "info" },
                { time: "initial", title: `${CAPITAL_STAGES[0].label} activé`, tone: "info" },
                { time: "risque", title: `${metrics.risk.activeAlerts} alerte(s) surveillées`, tone: metrics.risk.activeAlerts ? "warning" : "success" },
              ]}
            />
          </GlassCard>

          <GlassCard>
            <PanelTitle eyebrow="Activité" title="Tendance des décisions" />
            <FieldRows
              rows={[
                ["Trades totaux", `${metrics.trade.total}`],
                ["Trades gagnants", metrics.trade.closed ? `${Math.round((metrics.trade.winRate / 100) * metrics.trade.closed)} (${formatPercent(metrics.trade.winRate, 1)})` : "0"],
                ["PnL net", <span className={metrics.trade.pnlTotal >= 0 ? "text-emerald-300" : "text-red-300"} key="pnl">{signed(metrics.trade.pnlTotal, " $")}</span>],
                ["Win rate", <span className="text-emerald-300" key="win">{formatPercent(metrics.trade.winRate, 1)}</span>],
                ["Drawdown max", <span className="text-sky-300" key="dd">{formatPercent(metrics.risk.drawdownPercent)}</span>],
                ["Décision active", <StatusBadge key="decision" tone={selectedDecision.tone}>{selectedDecision.label}</StatusBadge>],
              ]}
            />
          </GlassCard>
        </div>
      </TabbedPanel>
    </TabbedContent>
  );
}
