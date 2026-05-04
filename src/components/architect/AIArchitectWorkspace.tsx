"use client";

import Link from "next/link";
import type { ChangeEvent, ComponentType, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Code2,
  Download,
  FileJson,
  FlaskConical,
  Image as ImageIcon,
  Layers3,
  Lock,
  MessageSquareText,
  Play,
  Route,
  Save,
  ShieldCheck,
  Sparkles,
  Upload,
  WandSparkles,
} from "lucide-react";
import type { StrategyDefinition } from "@/data/runtime/strategies";
import { Button } from "@/components/ui/button";
import { LocalAnalysisButton } from "@/components/analysis/LocalAnalysisButton";
import {
  Checklist,
  DisclaimerBar,
  GlassCard,
  ProgressBar,
  SectionTitle,
  StatusBadge,
} from "@/components/ui/dashboard";
import { cn } from "@/lib/utils";
import { writeLocalStrategyDraft } from "@/lib/strategy-drafts";

type Tone = "success" | "danger" | "warning" | "info" | "ai" | "neutral";

type PineAnalysis = {
  title: string;
  version: string;
  mode: "strategy" | "indicator" | "unknown";
  indicators: string[];
  entries: number;
  exits: number;
  closes: number;
  hasStop: boolean;
  hasTakeProfit: boolean;
  hasTrailing: boolean;
  hasSizing: boolean;
  hasSecurity: boolean;
  hasLossPause: boolean;
  readiness: number;
  entryRules: string[];
  exitRules: string[];
  warnings: string[];
};

type WorkspaceTab = "brief" | "pine" | "image" | "audit" | "pipeline";

type AnalysisProviderConfig = {
  selection: string;
  providerId: string | null;
  source: string;
  updatedAt: string;
};

type AgentRoutingConfig = {
  roles: Record<string, "deterministic" | "ai">;
  providerId: string | null;
  failClosed: boolean;
  source: string;
  updatedAt: string;
};

type RemoteState<T> = {
  loading: boolean;
  config: T | null;
  error: string | null;
};

type BriefSignal = {
  label: string;
  status: "ok" | "warning" | "danger" | "pending";
};

type StrategyImageReference = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  path: string;
  uploadedAt: string;
};

const samplePineScript = `//@version=5
strategy("BTC EMA RSI Guarded Pullback", overlay=true, initial_capital=10000)
fast = ta.ema(close, 21)
slow = ta.ema(close, 55)
rsi = ta.rsi(close, 14)
atr = ta.atr(14)
longSignal = ta.crossover(fast, slow) and rsi > 52
shortSignal = ta.crossunder(fast, slow) and rsi < 48
if longSignal
    strategy.entry("Long", strategy.long, qty_percent=10)
    strategy.exit("Long SL/TP", "Long", stop=close - atr * 1.8, limit=close + atr * 2.4)
if shortSignal
    strategy.entry("Short", strategy.short, qty_percent=10)
    strategy.exit("Short SL/TP", "Short", stop=close + atr * 1.8, limit=close - atr * 2.4)`;

const defaultBrief = "Je veux tester une stratégie BTC/USDT qui suit la tendance, évite les news violentes, limite le risque par trade et passe en pause après deux pertes consécutives.";

const indicatorCatalog = [
  { token: "ta.ema", label: "EMA" },
  { token: "ta.sma", label: "SMA" },
  { token: "ta.rsi", label: "RSI" },
  { token: "ta.macd", label: "MACD" },
  { token: "ta.atr", label: "ATR" },
  { token: "ta.adx", label: "ADX" },
  { token: "ta.vwap", label: "VWAP" },
  { token: "supertrend", label: "Supertrend" },
  { token: "bollinger", label: "Bollinger" },
  { token: "ta.bb", label: "Bollinger Bands" },
];

const knownAssets = ["BTC/USD", "ETH/USD", "SOL/USD", "DOGE/USD", "LINK/USD", "XRP/USD", "LTC/USD", "WIF/USD", "PEPE/USD", "OP/USD"];

const workspaceTabs: Array<{ id: WorkspaceTab; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: "brief", label: "Brief IA", icon: MessageSquareText },
  { id: "pine", label: "Pine Script", icon: Code2 },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "audit", label: "Audit Codex", icon: BrainCircuit },
  { id: "pipeline", label: "Pipeline", icon: Route },
];

function countMatches(source: string, pattern: RegExp) {
  return source.match(pattern)?.length ?? 0;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function extractScriptName(code: string) {
  return code.match(/\b(?:strategy|indicator)\s*\(\s*["']([^"']+)/i)?.[1] ?? "Stratégie IA";
}

function analyzePineScript(code: string, brief: string): PineAnalysis {
  const trimmed = code.trim();
  const lower = trimmed.toLowerCase();
  const briefLower = brief.toLowerCase();
  const mode = /\bstrategy\s*\(/i.test(trimmed) ? "strategy" : /\bindicator\s*\(/i.test(trimmed) ? "indicator" : "unknown";
  const version = trimmed.match(/\/\/\s*@version\s*=\s*([0-9]+)/i)?.[1] ?? "non détectée";
  const indicators = unique(indicatorCatalog.filter((item) => lower.includes(item.token)).map((item) => item.label));
  const entries = countMatches(trimmed, /strategy\.entry\s*\(/gi);
  const exits = countMatches(trimmed, /strategy\.exit\s*\(/gi);
  const closes = countMatches(trimmed, /strategy\.close\s*\(/gi);
  const hasStop = /\b(stop|stop_loss|sl|loss)\b/i.test(trimmed);
  const hasTakeProfit = /\b(limit|take_profit|tp|profit)\b/i.test(trimmed);
  const hasTrailing = /\b(trail|trailing)\b/i.test(trimmed);
  const hasSizing = /\b(qty_percent|position_size|risk_percent|default_qty|strategy\.risk)\b/i.test(trimmed);
  const hasSecurity = /request\.security\s*\(/i.test(trimmed);
  const hasCross = /ta\.(cross|crossover|crossunder)\s*\(/i.test(trimmed);
  const hasConditions = /\bif\s+[\w(]/i.test(trimmed);
  const briefNeedsLossPause = /\b(pertes?|loss|losses|drawdown|pause|cooldown)\b/i.test(briefLower);
  const hasLossPause = /\b(strategy\.closedtrades|losstrades|losses|pertes?|cooldown|pause|drawdown)\b/i.test(trimmed);

  const entryRules = [
    entries > 0 ? `${entries} ordre(s) d'entrée détecté(s) via strategy.entry().` : "Aucune entrée strategy.entry() détectée.",
    hasCross ? "Signal de croisement détecté: convertir en règle d'entrée explicite." : "Condition d'entrée à clarifier: aucun crossover/crossunder détecté.",
    indicators.length > 0 ? `Contexte indicateurs: ${indicators.join(", ")}.` : "Aucun indicateur technique reconnu automatiquement.",
    hasConditions ? "Blocs if détectés: mapper chaque condition en règle testable." : "Pas de bloc conditionnel clair à auditer.",
  ];

  const exitRules = [
    exits > 0 ? `${exits} sortie(s) détectée(s) via strategy.exit().` : "Sortie non confirmée: ajouter stop-loss et take-profit avant backtest sérieux.",
    closes > 0 ? `${closes} fermeture(s) manuelle(s) détectée(s) via strategy.close().` : "Aucune fermeture strategy.close() détectée.",
    hasTakeProfit ? "Take-profit / limit détecté: contrôler le ratio rendement/risque." : "Take-profit non détecté automatiquement.",
    hasLossPause ? "Pause / pertes consécutives détectées: vérifier le reset et le nombre de barres." : "Pause après pertes à formaliser si elle fait partie du brief.",
  ];

  const warnings = [
    mode === "indicator" ? "Ce script est un indicator(), pas une strategy(): il faut générer les entrées/sorties avant backtest." : "",
    mode === "unknown" ? "Le type Pine Script n'est pas clair: strategy() ou indicator() attendu." : "",
    version === "non détectée" ? "Version Pine non détectée: ajouter //@version=5 ou //@version=6." : "",
    entries === 0 ? "Aucune entrée exécutable détectée." : "",
    exits === 0 ? "Aucune sortie strategy.exit() détectée." : "",
    !hasStop ? "Stop-loss non détecté: bloqué avant paper trading." : "",
    briefNeedsLossPause && !hasLossPause ? "Le brief demande une pause après pertes, mais le code ne la met pas encore en oeuvre." : "",
    hasSecurity ? "request.security() détecté: vérifier repainting / lookahead avant validation." : "",
  ].filter(Boolean);

  const readiness = Math.min(
    100,
    (trimmed ? 10 : 0) +
      (version !== "non détectée" ? 10 : 0) +
      (mode === "strategy" ? 20 : mode === "indicator" ? 8 : 0) +
      (entries > 0 ? 16 : 0) +
      (exits > 0 ? 14 : 0) +
      (hasStop ? 12 : 0) +
      (hasTakeProfit ? 6 : 0) +
      (hasSizing ? 6 : 0) +
      (hasLossPause ? 4 : 0) +
      (indicators.length > 0 ? 6 : 0),
  );

  return {
    title: extractScriptName(trimmed),
    version,
    mode,
    indicators,
    entries,
    exits,
    closes,
    hasStop,
    hasTakeProfit,
    hasTrailing,
    hasSizing,
    hasSecurity,
    hasLossPause,
    readiness,
    entryRules,
    exitRules,
    warnings,
  };
}

function inferBriefIntent(brief: string): BriefSignal[] {
  const value = brief.toLowerCase();
  return [
    { label: "Marché / actifs", status: /btc|eth|sol|doge|xrp|usd|usdt/.test(value) ? "ok" : "warning" },
    { label: "Logique d'entrée", status: /tendance|trend|breakout|range|mean|rsi|ema|signal/.test(value) ? "ok" : "warning" },
    { label: "Risque par trade", status: /risque|risk|stop|sl|drawdown|perte/.test(value) ? "ok" : "danger" },
    { label: "Sortie / TP", status: /take|tp|profit|sortie|exit|limit/.test(value) ? "ok" : "warning" },
    { label: "Cas de blocage", status: /pause|news|volatil|pertes|cooldown|bloqu/.test(value) ? "ok" : "pending" },
  ];
}

function detectAssets(input: string) {
  const normalized = input.toUpperCase().replaceAll("USDT", "USD");
  const detected = knownAssets.filter((asset) => {
    const base = asset.split("/")[0];
    return normalized.includes(asset) || normalized.includes(asset.replace("/", "")) || normalized.includes(base);
  });
  return detected.length > 0 ? detected : ["BTC/USD"];
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 42) || "strategie-ia";
}

function buildStrategyDraft(brief: string, pineCode: string, analysis: PineAnalysis): StrategyDefinition {
  const assets = detectAssets(`${brief}\n${pineCode}`);
  return {
    id: `ia-${slugify(analysis.title)}`,
    name: analysis.title,
    status: "draft",
    timeframe: /\b(1m|5m|15m|30m|1h|4h|1d)\b/i.exec(`${brief}\n${pineCode}`)?.[1] ?? "5m",
    risk: analysis.hasStop && analysis.readiness >= 75 ? "Modéré" : "Élevé",
    winRate: 0,
    performance: 0,
    drawdown: 0,
    validationRate: analysis.readiness,
    assets,
    entryRules: analysis.entryRules,
    exitRules: analysis.exitRules,
    filters: [
      analysis.hasSecurity ? "Contrôle repainting / lookahead" : "Pas de request.security détecté",
      analysis.hasLossPause ? "Pause après pertes présente" : "Pause après pertes à ajouter",
      analysis.indicators.length ? `Indicateurs: ${analysis.indicators.join(", ")}` : "Indicateurs à qualifier",
    ],
    recommendation: analysis.readiness >= 80
      ? "Brouillon prêt pour backtest prudent, sans activation automatique."
      : "Compléter les règles manquantes avant backtest.",
  };
}

function InfoRow({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#16314a] py-2 text-sm last:border-b-0">
      <span className="text-slate-400">{label}</span>
      <span
        className={cn(
          "text-right font-mono font-semibold",
          tone === "success" && "text-emerald-300",
          tone === "warning" && "text-amber-300",
          tone === "danger" && "text-red-300",
          tone === "info" && "text-sky-300",
          tone === "ai" && "text-violet-300",
          (!tone || tone === "neutral") && "text-slate-100",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function RuleList({ title, items, icon }: { title: string; items: string[]; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#16314a] bg-slate-950/35 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        <span className="text-sky-300">{icon}</span>
        {title}
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item} className="flex gap-2 text-xs leading-relaxed text-slate-300">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-300" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function AIArchitectWorkspace() {
  const [brief, setBrief] = useState(defaultBrief);
  const [pineCode, setPineCode] = useState(samplePineScript);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("brief");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUploadBusy, setImageUploadBusy] = useState(false);
  const [strategyImage, setStrategyImage] = useState<StrategyImageReference | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState("analyse live");
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
  const [providerState, setProviderState] = useState<RemoteState<AnalysisProviderConfig>>({ loading: true, config: null, error: null });
  const [routingState, setRoutingState] = useState<RemoteState<AgentRoutingConfig>>({ loading: true, config: null, error: null });

  const analysis = useMemo(() => analyzePineScript(pineCode, brief), [brief, pineCode]);
  const briefSignals = useMemo(() => inferBriefIntent(brief), [brief]);
  const draft = useMemo(() => buildStrategyDraft(brief, pineCode, analysis), [analysis, brief, pineCode]);
  const readinessTone: Tone = analysis.readiness >= 78 ? "success" : analysis.readiness >= 55 ? "warning" : "danger";
  const providerReady = Boolean(providerState.config?.providerId);
  const providerLabel = providerState.loading ? "chargement" : providerState.error ? "erreur" : providerState.config?.providerId ?? "off";
  const aiRoleCount = Object.values(routingState.config?.roles ?? {}).filter((mode) => mode === "ai").length;
  const totalRoleCount = Object.keys(routingState.config?.roles ?? {}).length || 5;

  useEffect(() => {
    let mounted = true;

    async function loadRuntimeState() {
      try {
        const [providerResponse, routingResponse] = await Promise.all([
          fetch("/api/analysis/provider", { cache: "no-store" }),
          fetch("/api/paper-trading/agent-routing", { cache: "no-store" }),
        ]);
        const providerPayload = await providerResponse.json() as { ok?: boolean; config?: AnalysisProviderConfig };
        const routingPayload = await routingResponse.json() as { ok?: boolean; config?: AgentRoutingConfig };

        if (!mounted) return;
        setProviderState({
          loading: false,
          config: providerPayload.config ?? null,
          error: providerPayload.ok ? null : "provider_unavailable",
        });
        setRoutingState({
          loading: false,
          config: routingPayload.config ?? null,
          error: routingPayload.ok ? null : "routing_unavailable",
        });
      } catch {
        if (!mounted) return;
        setProviderState({ loading: false, config: null, error: "fetch_failed" });
        setRoutingState({ loading: false, config: null, error: "fetch_failed" });
      }
    }

    void loadRuntimeState();
    return () => {
      mounted = false;
    };
  }, []);

  function handleAnalyze() {
    setLastAnalyzedAt(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    setSavedDraftId(null);
    setActiveTab("audit");
  }

  async function uploadStrategyImage(file: File, dataUrl: string) {
    setImageUploadBusy(true);
    setImageError(null);
    try {
      const response = await fetch("/api/analysis/strategy-image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: file.name, type: file.type, dataUrl }),
      });
      const payload = await response.json() as { ok?: boolean; image?: StrategyImageReference; error?: string };
      if (!response.ok || !payload.ok || !payload.image) throw new Error(payload.error || `upload ${response.status}`);
      setStrategyImage(payload.image);
      setActiveTab("image");
    } catch (error) {
      setStrategyImage(null);
      setImageError(error instanceof Error ? error.message : "upload image impossible");
    } finally {
      setImageUploadBusy(false);
    }
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      setImagePreview(dataUrl || null);
      if (dataUrl) void uploadStrategyImage(file, dataUrl);
    };
    reader.onerror = () => setImageError("lecture image impossible");
    reader.readAsDataURL(file);
  }

  function handleSaveDraft() {
    const persistedDraft = { ...draft, id: `${draft.id}-${Date.now()}` };
    writeLocalStrategyDraft(persistedDraft);
    setSavedDraftId(persistedDraft.id);
    setActiveTab("pipeline");
  }

  function handleExport() {
    downloadJson(`architecte-ia-${draft.id}.json`, {
      generatedAt: new Date().toISOString(),
      brief,
      pineCode,
      analysis,
      strategyImage,
      strategyDraft: draft,
      localProvider: providerState.config,
      paperAgentRouting: routingState.config,
    });
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Architecte IA"
        subtitle="Transformer une idée ou un Pine Script en brouillon testable."
        icon={<BrainCircuit className="size-6" />}
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <GlassCard>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Moteur IA local</div>
              <div className={cn("mt-1 font-mono text-2xl font-bold", providerReady ? "text-emerald-300" : "text-amber-300")}>{providerLabel}</div>
            </div>
            <StatusBadge tone={providerReady ? "success" : "warning"}>{providerState.config?.source ?? "runtime"}</StatusBadge>
          </div>
        </GlassCard>
        <GlassCard>
          <div className="text-xs uppercase tracking-wide text-slate-500">Agents dans la boucle</div>
          <div className="mt-1 font-mono text-2xl font-bold text-violet-300">{aiRoleCount}/{totalRoleCount}</div>
          <div className="text-xs text-slate-500">routing paper · {routingState.config?.providerId ?? "provider"}</div>
        </GlassCard>
        <GlassCard>
          <div className="text-xs uppercase tracking-wide text-slate-500">Readiness brouillon</div>
          <div className={cn("mt-1 font-mono text-2xl font-bold", readinessTone === "success" && "text-emerald-300", readinessTone === "warning" && "text-amber-300", readinessTone === "danger" && "text-red-300")}>{analysis.readiness}%</div>
          <ProgressBar value={analysis.readiness} tone={readinessTone} />
        </GlassCard>
        <GlassCard>
          <div className="text-xs uppercase tracking-wide text-slate-500">Pipeline</div>
          <div className="mt-1 flex items-center gap-2 font-semibold text-amber-200"><Lock className="size-4" /> live conditionnel</div>
          <div className="text-xs text-slate-500">seuil 80% · LLM requis</div>
        </GlassCard>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-[#16314a] bg-white/[0.03] p-2">
        {workspaceTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={active}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition",
                active ? "border-sky-400/60 bg-sky-500/15 text-sky-100" : "border-transparent text-slate-400 hover:border-sky-400/30 hover:text-slate-100",
              )}
            >
              <Icon className="size-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "brief" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <GlassCard glow>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 font-semibold text-white"><MessageSquareText className="size-4 text-violet-300" /> Brief</h3>
              <StatusBadge tone="ai">entrée IA</StatusBadge>
            </div>
            <textarea
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              className="min-h-[380px] w-full resize-y rounded-xl border border-[#16314a] bg-slate-950/70 p-4 text-sm leading-relaxed text-slate-100 outline-none transition focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/15"
              placeholder="Marché, logique d'entrée, sorties, filtres, risque max, cas de blocage."
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={handleAnalyze}><WandSparkles className="size-4" /> Préparer l'audit</Button>
              <Button variant="ghost" onClick={() => setBrief(defaultBrief)}>Exemple</Button>
              <Button variant="success" onClick={handleSaveDraft}><Save className="size-4" /> Sauvegarder brouillon</Button>
            </div>
          </GlassCard>

          <div className="space-y-5">
            <GlassCard>
              <div className="mb-4 flex items-center gap-2 font-semibold text-white"><ShieldCheck className="size-4 text-emerald-300" /> Brief exploitable</div>
              <Checklist items={briefSignals} />
            </GlassCard>
            <GlassCard>
              <div className="mb-4 flex items-center gap-2 font-semibold text-white"><Layers3 className="size-4 text-sky-300" /> Brouillon cible</div>
              <div className="space-y-1 rounded-2xl border border-[#16314a] bg-slate-950/45 p-4">
                <InfoRow label="Nom" value={draft.name} />
                <InfoRow label="Actifs" value={draft.assets.join(", ")} tone="info" />
                <InfoRow label="Timeframe" value={draft.timeframe} />
                <InfoRow label="Risque" value={draft.risk} tone={draft.risk === "Élevé" ? "danger" : "warning"} />
                <InfoRow label="Validation" value={`${draft.validationRate}%`} tone={readinessTone} />
              </div>
            </GlassCard>
          </div>
        </div>
      ) : null}

      {activeTab === "pine" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <GlassCard glow>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 font-semibold text-white"><Code2 className="size-4 text-sky-300" /> Pine Script</h3>
              <StatusBadge tone="info">{lastAnalyzedAt}</StatusBadge>
            </div>
            <textarea
              value={pineCode}
              onChange={(event) => setPineCode(event.target.value)}
              spellCheck={false}
              className="min-h-[560px] w-full resize-y rounded-xl border border-[#16314a] bg-[#030813] p-4 font-mono text-xs leading-relaxed text-slate-100 outline-none transition focus:border-sky-400/60 focus:ring-2 focus:ring-sky-500/15"
              placeholder={'//@version=5\nstrategy("Ma stratégie", overlay=true)\n...'}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={handleAnalyze}><WandSparkles className="size-4" /> Analyser</Button>
              <Button variant="ghost" onClick={() => setPineCode(samplePineScript)}><Code2 className="size-4" /> Exemple</Button>
              <Button variant="success" onClick={handleSaveDraft}><Save className="size-4" /> Sauvegarder brouillon</Button>
              <Button variant="warning" disabled><Play className="size-4" /> Paper verrouillé</Button>
            </div>
          </GlassCard>

          <div className="space-y-5">
            <GlassCard>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 font-semibold text-white"><FileJson className="size-4 text-violet-300" /> Parseur local</h3>
                <StatusBadge tone={readinessTone}>score {analysis.readiness}%</StatusBadge>
              </div>
              <div className="space-y-1 rounded-2xl border border-[#16314a] bg-slate-950/45 p-4">
                <InfoRow label="Type" value={analysis.mode} tone={analysis.mode === "strategy" ? "success" : "warning"} />
                <InfoRow label="Version" value={`Pine ${analysis.version}`} />
                <InfoRow label="Entrées" value={String(analysis.entries)} tone={analysis.entries > 0 ? "success" : "danger"} />
                <InfoRow label="Sorties" value={String(analysis.exits)} tone={analysis.exits > 0 ? "success" : "danger"} />
                <InfoRow label="Stop-loss" value={analysis.hasStop ? "détecté" : "manquant"} tone={analysis.hasStop ? "success" : "danger"} />
                <InfoRow label="Pause pertes" value={analysis.hasLossPause ? "détectée" : "manquante"} tone={analysis.hasLossPause ? "success" : "warning"} />
              </div>
            </GlassCard>
            <GlassCard>
              <div className="mb-4 flex items-center gap-2 font-semibold text-white"><AlertTriangle className="size-4 text-amber-300" /> Points à corriger</div>
              <div className="space-y-2">
                {(analysis.warnings.length > 0 ? analysis.warnings : ["Aucun blocage critique détecté par le parseur local."]).map((warning) => (
                  <div key={warning} className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-xs leading-relaxed text-amber-100/85">{warning}</div>
                ))}
              </div>
            </GlassCard>
          </div>
        </div>
      ) : null}

      {activeTab === "image" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <GlassCard glow>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 font-semibold text-white"><ImageIcon className="size-4 text-violet-300" /> Stratégie en image</h3>
              <StatusBadge tone={strategyImage ? "success" : imageError ? "danger" : "neutral"}>{strategyImage ? "uploadée" : imageUploadBusy ? "upload..." : "attente"}</StatusBadge>
            </div>
            <label
              htmlFor="strategy-image-upload"
              className="flex min-h-[500px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-violet-400/35 bg-slate-950/55 p-4 text-center transition hover:border-violet-300/70 hover:bg-violet-500/8"
              style={imagePreview ? { backgroundImage: `linear-gradient(rgba(3,8,19,0.12), rgba(3,8,19,0.78)), url(${imagePreview})`, backgroundSize: "contain", backgroundPosition: "center", backgroundRepeat: "no-repeat" } : undefined}
            >
              <Upload className="size-10 text-violet-300" />
              <span className="mt-3 text-sm font-semibold text-white">{strategyImage?.name ?? "Déposer une capture TradingView / setup"}</span>
              <span className="mt-1 text-xs text-slate-400">PNG, JPG ou WEBP · 5 MB max</span>
            </label>
            <input id="strategy-image-upload" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageChange} className="sr-only" />
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => setActiveTab("audit")} disabled={!strategyImage || imageUploadBusy}><BrainCircuit className="size-4" /> Auditer avec Codex</Button>
              <Button variant="ghost" onClick={() => setActiveTab("brief")}>Compléter le brief</Button>
              <Button variant="warning" disabled><Play className="size-4" /> Paper après backtest</Button>
            </div>
            {imageError ? <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/8 px-3 py-2 text-xs text-red-200">{imageError}</div> : null}
          </GlassCard>

          <div className="space-y-5">
            <GlassCard>
              <div className="mb-4 flex items-center gap-2 font-semibold text-white"><FileJson className="size-4 text-violet-300" /> Référence transmise</div>
              <div className="space-y-1 rounded-2xl border border-[#16314a] bg-slate-950/45 p-4">
                <InfoRow label="Nom" value={strategyImage?.name ?? "-"} />
                <InfoRow label="Type" value={strategyImage?.mimeType ?? "-"} tone="info" />
                <InfoRow label="Taille" value={strategyImage ? `${Math.round(strategyImage.sizeBytes / 1024)} KB` : "-"} />
                <InfoRow label="Chemin" value={strategyImage?.path ?? "-"} tone={strategyImage ? "ai" : "neutral"} />
              </div>
            </GlassCard>
            <GlassCard>
              <div className="mb-4 flex items-center gap-2 font-semibold text-white"><ShieldCheck className="size-4 text-emerald-300" /> Flux image</div>
              <Checklist
                items={[
                  { label: "Image sauvegardée côté serveur", status: strategyImage ? "ok" : "pending" },
                  { label: "Brief texte conseillé", status: brief.trim().length > 30 ? "ok" : "warning" },
                  { label: "Audit Codex avant backtest", status: "pending" },
                  { label: "Paper seulement après backtest", status: "pending" },
                ]}
              />
            </GlassCard>
          </div>
        </div>
      ) : null}

      {activeTab === "audit" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-5">
            <GlassCard glow>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 font-semibold text-white"><BrainCircuit className="size-4 text-violet-300" /> Codex local</h3>
                <StatusBadge tone={providerReady ? "success" : "warning"}>{providerLabel}</StatusBadge>
              </div>
              <LocalAnalysisButton
                surface="strategy-architect"
                task="Auditer le brief, le Pine Script et l'image de stratégie pour préparer une stratégie backtestable sans exécution."
                context={{ brief, pineCode, localParse: analysis, strategyDraft: draft, strategyImage }}
                label="Auditer avec Codex"
              />
            </GlassCard>

            <div className="grid gap-4 lg:grid-cols-2">
              <RuleList title="Entrées" icon={<ArrowRight className="size-4" />} items={analysis.entryRules} />
              <RuleList title="Sorties" icon={<FlaskConical className="size-4" />} items={analysis.exitRules} />
            </div>
          </div>

          <div className="space-y-5">
            <GlassCard>
              <div className="mb-4 flex items-center gap-2 font-semibold text-white"><ShieldCheck className="size-4 text-emerald-300" /> Garde-fous</div>
              <Checklist
                items={[
                  { label: "Stop-loss obligatoire", status: analysis.hasStop ? "ok" : "danger" },
                  { label: "Take-profit ou sortie", status: analysis.hasTakeProfit || analysis.exits > 0 ? "ok" : "warning" },
                  { label: "Pause après pertes", status: analysis.hasLossPause ? "ok" : "warning" },
                  { label: "Backtest avant paper", status: "pending" },
                  { label: "Live seulement si score >= 80%", status: "ok" },
                ]}
              />
            </GlassCard>
            <GlassCard>
              <div className="mb-4 flex items-center gap-2 font-semibold text-white"><Activity className="size-4 text-violet-300" /> Routing agents</div>
              <div className="space-y-2">
                {Object.entries(routingState.config?.roles ?? {}).map(([role, mode]) => (
                  <div key={role} className="flex items-center justify-between gap-3 rounded-xl border border-[#16314a] bg-slate-950/35 px-3 py-2 text-sm">
                    <span className="capitalize text-slate-300">{role}</span>
                    <StatusBadge tone={mode === "ai" ? "ai" : "neutral"}>{mode}</StatusBadge>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        </div>
      ) : null}

      {activeTab === "pipeline" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
          <GlassCard glow>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 font-semibold text-white"><Layers3 className="size-4 text-sky-300" /> Brouillon structuré</h3>
              <StatusBadge tone={savedDraftId ? "success" : "warning"}>{savedDraftId ? "sauvegardé" : "session"}</StatusBadge>
            </div>
            <div className="space-y-1 rounded-2xl border border-[#16314a] bg-slate-950/45 p-4">
              <InfoRow label="Nom" value={draft.name} />
              <InfoRow label="Source" value="Architecte IA + Pine Script" tone="ai" />
              <InfoRow label="Type" value={analysis.mode} tone={analysis.mode === "strategy" ? "success" : "warning"} />
              <InfoRow label="Actifs" value={draft.assets.join(", ")} tone="info" />
              <InfoRow label="Readiness" value={`${analysis.readiness}%`} tone={readinessTone} />
              <InfoRow label="ID local" value={savedDraftId ?? draft.id} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="success" onClick={handleSaveDraft}><Save className="size-4" /> Sauvegarder</Button>
              <Button variant="ghost" onClick={handleExport}><Download className="size-4" /> Export JSON</Button>
              <Link href="/strategies"><Button variant="ai"><Sparkles className="size-4" /> Ouvrir stratégies</Button></Link>
              <Link href="/backtests"><Button variant="ghost">Backtests</Button></Link>
              <Link href="/settings"><Button variant="ghost">Gate live</Button></Link>
            </div>
            {savedDraftId ? <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-3 py-2 text-xs text-emerald-200">Brouillon disponible dans la page Stratégies.</div> : null}
          </GlassCard>

          <div className="space-y-5">
            <RuleList title="Filtres" icon={<ShieldCheck className="size-4" />} items={draft.filters} />
            <GlassCard>
              <div className="mb-3 font-semibold text-white">Flux app</div>
              <div className="flex flex-wrap gap-2">
                {["Architecte", "Stratégies", "Backtest", "Risque", "Validation", "Paper"].map((step, index) => (
                  <StatusBadge key={step} tone={index === 0 ? "ai" : index === 1 ? "success" : index === 2 ? "warning" : index === 5 ? "success" : "info"}>{step}</StatusBadge>
                ))}
              </div>
            </GlassCard>
          </div>
        </div>
      ) : null}

      <DisclaimerBar
        items={[
          "Cette application ne fournit pas de conseil financier.",
          "Une stratégie importée depuis TradingView doit être backtestée avec frais, slippage et garde-fous avant tout paper trading.",
          "Le mode réel reste verrouillé tant que la maturité, le risque et la validation humaine ne sont pas conformes.",
        ]}
      />
    </div>
  );
}
