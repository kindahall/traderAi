"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, ExternalLink, LineChart, Loader2, Plus, RefreshCcw, Search, Sparkles, Telescope } from "lucide-react";
import type { StrategyDefinition } from "@/data/runtime/strategies";
import type { AppDataSnapshot } from "@/server/app-data";
import { formatPercent, signed } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { LocalAnalysisButton } from "@/components/analysis/LocalAnalysisButton";
import { GlassCard, InfoHint, KpiCard, StatusBadge, Timeline, TogglePill } from "@/components/ui/dashboard";
import { Donut, Sparkline } from "@/components/charts/charts";
import { LOCAL_STRATEGY_DRAFTS_STORAGE_KEY, readLocalStrategyDrafts, writeLocalStrategyDraft } from "@/lib/strategy-drafts";

type Props = {
  strategies: StrategyDefinition[];
  priceSeries: Array<{ price: number }>;
  strategyComparison: Array<Record<string, string | number>>;
  metrics: AppDataSnapshot["metrics"];
};

type StrategyStatusFilter = "all" | StrategyDefinition["status"];
type StrategyDiscoveryVisibility = "open-source" | "public-idea" | "unknown" | "protected" | "invite-only";
type StrategyDiscoveryStage = "source_watch" | "codex_review" | "backtest_queue" | "paper_incubation" | "live_candidate" | "blocked";

type StrategyDiscoveryPineSummary = {
  version: string;
  entries: number;
  exits: number;
  closes: number;
  hasStopLoss: boolean;
  hasTrailingStop: boolean;
  hasMultiTakeProfit: boolean;
  hasRunUpProtection: boolean;
  canLong: boolean;
  canShort: boolean;
  pyramiding: number;
  defaultQtyPercent: number;
  warnings: string[];
};

type StrategyDiscoveryCandidate = {
  id: string;
  title: string;
  source: "tradingview" | "user-url" | "pine-import" | "image-import" | "manual";
  sourceUrl?: string;
  pineCode?: string;
  pineSummary?: StrategyDiscoveryPineSummary;
  visibility: StrategyDiscoveryVisibility;
  stage: StrategyDiscoveryStage;
  score: number;
  risk: StrategyDefinition["risk"];
  timeframe: string;
  assets: string[];
  tags: string[];
  notes: string;
  blockers: string[];
  licenseNotes: string;
  nextAction: string;
  discoveredAt: string;
  updatedAt: string;
  lastReviewAt?: string;
  paper: {
    status: "not_started" | "queued" | "watching" | "running" | "passed" | "failed";
    trades: number;
    closedTrades?: number;
    openTrades?: number;
    winningTrades?: number;
    losingTrades?: number;
    winRate: number;
    pnlUsd: number;
  };
};

type StrategyDiscoveryState = {
  version: 1;
  enabled: boolean;
  cadence: "daily";
  maxCandidatesPerDay: number;
  lastScanAt?: string;
  nextScanAt?: string;
  updatedAt: string;
  sources: Array<{ id: string; label: string; enabled: boolean; policy: string }>;
  candidates: StrategyDiscoveryCandidate[];
};

type StrategyDiscoveryPayload = {
  ok: boolean;
  state?: StrategyDiscoveryState;
  discovered?: number;
  scanned?: number;
  failed?: number;
  error?: string;
};

const emptyDiscoveryState: StrategyDiscoveryState = {
  version: 1,
  enabled: true,
  cadence: "daily",
  maxCandidatesPerDay: 3,
  updatedAt: "",
  sources: [],
  candidates: [],
};

const comparisonKeys: Record<string, string> = {
  "trend-momentum": "trend",
  "breakout-h4": "breakout",
  "mean-reversion": "mean",
  "scalp-volatility": "scalp",
};

function strategyWinRateLabel(strategy: StrategyDefinition) {
  if (strategy.paperStats && strategy.paperStats.closedTrades === 0) return "En attente";
  return formatPercent(strategy.winRate, 1);
}

function strategyWinRateEvidence(strategy: StrategyDefinition) {
  const stats = strategy.paperStats;
  if (!stats) return "Aucun détail paper";
  if (!stats.totalTrades) return "Aucun ordre paper";
  if (!stats.closedTrades) return `${stats.openTrades} ouvert(s) · aucune clôture`;
  const flatTrades = Math.max(0, stats.closedTrades - stats.winningTrades - stats.losingTrades);
  const suffix = stats.closedTrades < 8 ? " · échantillon faible" : "";
  const flats = flatTrades ? ` · ${flatTrades} flat` : "";
  const open = stats.openTrades ? ` · ${stats.openTrades} ouvert(s)` : "";
  return `${stats.winningTrades}/${stats.closedTrades} gagnants clos · ${stats.losingTrades} perdant(s)${flats}${open}${suffix}`;
}

export function StrategiesWorkspace({ strategies, priceSeries, strategyComparison, metrics }: Props) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StrategyStatusFilter>("all");
  const [selectedId, setSelectedId] = useState(strategies[0]?.id ?? "");
  const [statusOverrides, setStatusOverrides] = useState<Record<string, StrategyDefinition["status"]>>({});
  const [localDrafts, setLocalDrafts] = useState<StrategyDefinition[]>([]);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [discovery, setDiscovery] = useState<StrategyDiscoveryState>(emptyDiscoveryState);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [discoveryError, setDiscoveryError] = useState("");
  const [candidateUrl, setCandidateUrl] = useState("");
  const [candidateTitle, setCandidateTitle] = useState("");
  const [candidateVisibility, setCandidateVisibility] = useState<StrategyDiscoveryVisibility>("open-source");
  const [candidateAssets, setCandidateAssets] = useState("BTC/USD, ETH/USD");
  const [candidatePineCode, setCandidatePineCode] = useState("");
  const [scanStatus, setScanStatus] = useState("");

  useEffect(() => {
    let mounted = true;
    window.queueMicrotask(() => {
      if (mounted) setLocalDrafts(readLocalStrategyDrafts());
    });

    function handleStorage(event: StorageEvent) {
      if (event.key === LOCAL_STRATEGY_DRAFTS_STORAGE_KEY) setLocalDrafts(readLocalStrategyDrafts());
    }

    window.addEventListener("storage", handleStorage);
    return () => {
      mounted = false;
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    void loadDiscovery();
  }, []);

  const serverStrategyIds = useMemo(() => new Set(strategies.map((strategy) => strategy.id)), [strategies]);
  const serverStrategyNames = useMemo(() => new Set(strategies.map((strategy) => slug(strategy.name))), [strategies]);
  const visibleLocalDrafts = useMemo(
    () => localDrafts.filter((strategy) => !serverStrategyIds.has(strategy.id) && !serverStrategyNames.has(slug(strategy.name))),
    [localDrafts, serverStrategyIds, serverStrategyNames],
  );
  const allStrategies = useMemo(
    () => [...strategies, ...visibleLocalDrafts].map((strategy) => ({ ...strategy, status: statusOverrides[strategy.id] ?? strategy.status })),
    [statusOverrides, strategies, visibleLocalDrafts],
  );
  const candidateDraftKeys = useMemo(
    () => new Set([...strategies, ...visibleLocalDrafts].map((strategy) => slug(strategy.name))),
    [strategies, visibleLocalDrafts],
  );
  const visibleStrategies = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return allStrategies
      .filter((strategy) => statusFilter === "all" || strategy.status === statusFilter)
      .filter((strategy) => {
        if (!normalizedQuery) return true;
        return [strategy.name, strategy.id, strategy.timeframe, strategy.risk, strategy.status, ...strategy.assets, ...strategy.entryRules, ...strategy.exitRules, ...strategy.filters]
          .some((value) => value.toLowerCase().includes(normalizedQuery));
      });
  }, [allStrategies, query, statusFilter]);

  const selected = allStrategies.find((strategy) => strategy.id === selectedId) ?? visibleStrategies[0] ?? allStrategies[0];
  const activeCount = allStrategies.filter((strategy) => strategy.status === "active").length;
  const draftCount = allStrategies.filter((strategy) => strategy.status === "draft").length;
  const comparisonKey = comparisonKeys[selected?.id ?? ""] ?? comparisonKeys[selected?.id.replace(/-copy-.+$/, "") ?? ""] ?? "trend";

  async function toggleStrategyStatus(strategyId: string) {
    const strategy = allStrategies.find((item) => item.id === strategyId);
    if (!strategy) return;
    const nextStatus: StrategyDefinition["status"] = strategy.status === "active" ? "inactive" : "active";
    setStatusOverrides((current) => ({
      ...current,
      [strategyId]: nextStatus,
    }));

    const localDraft = visibleLocalDrafts.find((item) => item.id === strategyId);
    if (localDraft && !serverStrategyIds.has(strategyId)) {
      setLocalDrafts(writeLocalStrategyDraft({ ...localDraft, status: nextStatus }));
      return;
    }

    try {
      const response = await fetch("/api/strategies/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: strategyId, status: nextStatus }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "status_update_failed");
      setScanStatus(`${strategy.name} ${nextStatus === "active" ? "activée" : "désactivée"} dans la bibliothèque runtime.`);
    } catch {
      setStatusOverrides((current) => ({ ...current, [strategyId]: strategy.status }));
      setDiscoveryError("Statut stratégie non enregistré.");
    }
  }

  function duplicateSelected() {
    if (!selected) return;
    const copy: StrategyDefinition = {
      ...selected,
      id: `${selected.id}-copy-${Date.now()}`,
      name: `${selected.name} copie`,
      status: "draft",
      recommendation: `Brouillon local basé sur ${selected.name}.`,
    };
    const nextDrafts = writeLocalStrategyDraft(copy);
    setLocalDrafts(nextDrafts);
    setSelectedId(copy.id);
    setActionsOpen(true);
  }

  function exportSelected() {
    if (!selected) return;
    downloadJson(`strategie-${selected.id}.json`, {
      generatedAt: new Date().toISOString(),
      strategy: selected,
      comparisonKey,
      localDraft: selected.status === "draft",
    });
  }

  async function loadDiscovery() {
    setDiscoveryBusy(true);
    setDiscoveryError("");
    setScanStatus("");
    try {
      const response = await fetch("/api/strategies/discovery", { cache: "no-store" });
      const payload = await response.json() as StrategyDiscoveryPayload;
      if (!payload.ok || !payload.state) throw new Error(payload.error || "discovery_unavailable");
      setDiscovery(payload.state);
    } catch {
      setDiscoveryError("Veille stratégie indisponible.");
    } finally {
      setDiscoveryBusy(false);
    }
  }

  async function addDiscoveryCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDiscoveryBusy(true);
    setDiscoveryError("");
    setScanStatus("");

    try {
      const response = await fetch("/api/strategies/discovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "add",
          sourceUrl: candidateUrl,
          title: candidateTitle,
          visibility: candidateVisibility,
          assets: candidateAssets.split(",").map((item) => item.trim()).filter(Boolean),
          tags: ["veille", candidateVisibility],
        }),
      });
      const payload = await response.json() as StrategyDiscoveryPayload;
      if (!payload.ok || !payload.state) throw new Error(payload.error || "candidate_add_failed");
      setDiscovery(payload.state);
      setCandidateUrl("");
      setCandidateTitle("");
      setScanStatus("Source ajoutée à la veille. Lance le scan pour l'enrichir.");
    } catch {
      setDiscoveryError("Source non ajoutée.");
    } finally {
      setDiscoveryBusy(false);
    }
  }

  async function importPineCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDiscoveryBusy(true);
    setDiscoveryError("");
    setScanStatus("");

    try {
      const response = await fetch("/api/strategies/discovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "import-pine",
          title: candidateTitle,
          pineCode: candidatePineCode,
          assets: candidateAssets.split(",").map((item) => item.trim()).filter(Boolean),
          tags: ["Pine Script", "import", "Codex"],
        }),
      });
      const payload = await response.json() as StrategyDiscoveryPayload;
      if (!payload.ok || !payload.state) throw new Error(payload.error || "pine_import_failed");
      setDiscovery(payload.state);
      setCandidatePineCode("");
      setCandidateTitle("");
      setScanStatus("Pine Script importé. Audit Codex puis backtest déterministe requis.");
    } catch {
      setDiscoveryError("Import Pine non ajouté.");
    } finally {
      setDiscoveryBusy(false);
    }
  }

  async function updateDiscoveryStage(id: string, stage: StrategyDiscoveryStage, successMessage = stageActionMessage(stage)) {
    const previousDiscovery = discovery;
    setDiscoveryBusy(true);
    setDiscoveryError("");
    setScanStatus("Mise à jour de l'étape...");
    setDiscovery((current) => applyCandidateStage(current, id, stage));
    try {
      const response = await fetch("/api/strategies/discovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "stage", id, stage }),
      });
      const payload = await response.json() as StrategyDiscoveryPayload;
      if (!payload.ok || !payload.state) throw new Error(payload.error || "stage_update_failed");
      setDiscovery(payload.state);
      setScanStatus(successMessage);
    } catch {
      setDiscovery(previousDiscovery);
      setDiscoveryError("Étape non mise à jour.");
      setScanStatus("");
    } finally {
      setDiscoveryBusy(false);
    }
  }

  async function runDiscoveryScan() {
    setDiscoveryBusy(true);
    setDiscoveryError("");
    setScanStatus("");
    try {
      const response = await fetch("/api/strategies/discovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "scan-public" }),
      });
      const payload = await response.json() as StrategyDiscoveryPayload;
      if (!payload.ok || !payload.state) throw new Error(payload.error || "scan_failed");
      setDiscovery(payload.state);
      if (payload.failed) setDiscoveryError(`${payload.failed} source(s) non lisible(s).`);
      if (!payload.discovered && !payload.scanned && !payload.failed) {
        setScanStatus(payload.state.candidates.length ? "Scan terminé : aucune source nouvelle à enrichir." : "Aucune source publique trouvée. Tu peux coller une URL TradingView puis relancer.");
      } else {
        setScanStatus(`Scan terminé : ${payload.discovered ?? 0} découverte(s), ${payload.scanned ?? 0} source(s) enrichie(s).`);
      }
    } catch {
      setDiscoveryError("Scan non enregistré.");
    } finally {
      setDiscoveryBusy(false);
    }
  }

  function strategyFromCandidate(candidate: StrategyDiscoveryCandidate, status: StrategyDefinition["status"]): StrategyDefinition {
    const pineImported = Boolean(candidate.pineSummary);
    return {
      id: `discovery-${candidate.id}`,
      name: candidate.title,
      status,
      timeframe: candidate.timeframe || "15m",
      risk: candidate.risk,
      winRate: candidate.paper.winRate,
      performance: candidate.paper.pnlUsd,
      drawdown: 0,
      validationRate: Math.min(100, candidate.score),
      paperStats: {
        totalTrades: candidate.paper.trades,
        closedTrades: candidate.paper.closedTrades ?? 0,
        openTrades: candidate.paper.openTrades ?? 0,
        winningTrades: candidate.paper.winningTrades ?? 0,
        losingTrades: candidate.paper.losingTrades ?? 0,
      },
      assets: candidate.assets.length ? candidate.assets : ["BTC/USD"],
      entryRules: pineImported ? ["Croisement MA rapide/lente", "Retest support/résistance via pivots", "Entrée drawdown pullback"] : ["Règles à formaliser depuis la source", "Signal confirmé sans repainting", "Volume et volatilité vérifiés"],
      exitRules: pineImported ? ["TP1/TP2/TP3 basés ATR", "Stop-loss en pourcentage", "Trailing stop ATR", "Run-up protect"] : ["Stop-loss obligatoire", "Take-profit ou invalidation explicite", "Sortie si conditions source invalidées"],
      filters: pineImported ? ["Limiter pyramiding/exposition", "Reset état après flat", "Backtest avec frais/slippage", "Paper trading avant live"] : ["Backtest déterministe", "Frais et slippage inclus", "Paper trading avant live"],
      recommendation: status === "inactive" ? `Paper préparé depuis la veille. ${candidate.nextAction}` : candidate.nextAction,
    };
  }

  function upsertCandidateStrategy(candidate: StrategyDiscoveryCandidate, status: StrategyDefinition["status"]) {
    const existing = localDrafts.find((draft) => slug(draft.name) === slug(candidate.title));
    const strategy = {
      ...strategyFromCandidate(candidate, status),
      id: existing?.id ?? `discovery-${candidate.id}`,
    };
    const nextDrafts = writeLocalStrategyDraft(strategy);
    setLocalDrafts(nextDrafts);
    setStatusOverrides((current) => ({ ...current, [strategy.id]: status }));
    setSelectedId(strategy.id);
    setActionsOpen(true);
    return strategy;
  }

  function promoteCandidateToDraft(candidate: StrategyDiscoveryCandidate) {
    const draft = upsertCandidateStrategy(candidate, "draft");
    void updateDiscoveryStage(candidate.id, "backtest_queue", `Brouillon prêt : ${draft.name}. Étape suivante : backtest.`);
  }

  function promoteCandidateToPaper(candidate: StrategyDiscoveryCandidate) {
    const paperStrategy = upsertCandidateStrategy(candidate, "active");
    void updateDiscoveryStage(candidate.id, "paper_incubation", `Paper actif : ${paperStrategy.name}. La boucle runtime peut le tester automatiquement.`);
  }

  async function testCandidateInPaper(candidate: StrategyDiscoveryCandidate) {
    setDiscoveryBusy(true);
    setDiscoveryError("");
    setScanStatus(`Test paper ciblé en cours : ${candidate.title}`);
    try {
      const response = await fetch("/api/paper-trading/cycle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetAgentId: discoveryPaperAgentId(candidate.id),
        }),
      });
      const payload = await response.json() as { ok?: boolean; eventsCreated?: number; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "paper_test_failed");
      const discoveryResponse = await fetch("/api/strategies/discovery", { cache: "no-store" });
      const discoveryPayload = await discoveryResponse.json() as StrategyDiscoveryPayload;
      if (discoveryPayload.ok && discoveryPayload.state) setDiscovery(discoveryPayload.state);
      setScanStatus(`Test paper terminé : ${payload.eventsCreated ?? 0} événement(s) runtime.`);
    } catch {
      setDiscoveryError("Test paper non lancé.");
      setScanStatus("");
    } finally {
      setDiscoveryBusy(false);
    }
  }

  if (!selected) {
    return <GlassCard className="mt-4"><div className="text-sm text-slate-400">Aucune stratégie configurée.</div></GlassCard>;
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 size-4 text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 rounded-xl border border-[#16314a] bg-slate-950/60 pl-10 pr-4 text-sm text-slate-100 outline-none placeholder:text-slate-600"
            placeholder="Rechercher une stratégie..."
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StrategyStatusFilter)}
          className="h-10 rounded-xl border border-[#16314a] bg-slate-950/60 px-3 text-sm text-slate-100 outline-none"
        >
          <option value="all">Tous statuts</option>
          <option value="active">Actives</option>
          <option value="inactive">Inactives</option>
          <option value="draft">Brouillons</option>
        </select>
        <Link href="/ai-architect"><Button variant="ghost"><Sparkles className="size-4" /> Architecte IA</Button></Link>
        <Link href="/backtests"><Button variant="ghost"><LineChart className="size-4" /> Backtests</Button></Link>
        <Link href="/markets"><Button variant="ghost">Marchés</Button></Link>
        <Link href="/strategies/new"><Button><Plus className="size-4" /> Nouvelle stratégie</Button></Link>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <KpiCard label="Stratégie active" value={selected.name} delta={`${selected.assets.join(", ")} · ${selected.timeframe}`} tone={selected.status === "active" ? "success" : "warning"}><Sparkline data={priceSeries.slice(-18)} color="#22c55e" /></KpiCard>
        <KpiCard label="Rendement moyen" value={signed(metrics.strategy.averagePerformance, "%")} delta={`${allStrategies.length} stratégies`} tone={metrics.strategy.averagePerformance >= 0 ? "success" : "danger"} />
        <KpiCard label="Drawdown moyen" value={signed(metrics.strategy.averageDrawdown, "%")} delta="30 derniers jours" tone="danger" />
        <KpiCard label="Taux de validation" value={formatPercent(metrics.strategy.averageValidationRate, 1)} delta={`win rate ${formatPercent(metrics.strategy.averageWinRate, 1)}`} tone="info"><Donut value={metrics.strategy.averageValidationRate} /></KpiCard>
        <KpiCard label="Veille" value={`${discovery.candidates.length}`} delta={`${draftCount} brouillons · ${activeCount} actives`} tone={discovery.candidates.length ? "ai" : "warning"} />
      </div>

      <StrategyDiscoveryPanel
        assetsValue={candidateAssets}
        busy={discoveryBusy}
        discovery={discovery}
        candidateDraftKeys={candidateDraftKeys}
        error={discoveryError}
        pineCodeValue={candidatePineCode}
        scanStatus={scanStatus}
        titleValue={candidateTitle}
        urlValue={candidateUrl}
        visibilityValue={candidateVisibility}
        onAddCandidate={addDiscoveryCandidate}
        onAssetsChange={setCandidateAssets}
        onImportPine={importPineCandidate}
        onScan={() => void runDiscoveryScan()}
        onPromote={promoteCandidateToDraft}
        onPaper={promoteCandidateToPaper}
        onRefresh={() => void loadDiscovery()}
        onStage={(id, stage) => void updateDiscoveryStage(id, stage)}
        onTestPaper={(candidate) => void testCandidateInPaper(candidate)}
        onTitleChange={setCandidateTitle}
        onUrlChange={setCandidateUrl}
        onPineCodeChange={setCandidatePineCode}
        onVisibilityChange={setCandidateVisibility}
      />

      <div className="mt-4 grid grid-cols-5 gap-3">
        {visibleStrategies.length ? visibleStrategies.map((strategy) => (
          <GlassCard key={strategy.id} data-strategy-card-id={strategy.id} data-strategy-card-name={slug(strategy.name)} className={strategy.id === selected.id ? "border-sky-400/60" : ""}>
            <div className="flex items-start justify-between gap-3">
              <button type="button" onClick={() => setSelectedId(strategy.id)} className="min-w-0 flex-1 text-left">
                <div className="truncate text-lg font-bold text-white">{strategy.name}</div>
                <div className="mt-1 text-xs text-slate-400">{strategy.timeframe} · Risque <span className={strategy.risk === "Élevé" ? "text-red-300" : "text-amber-300"}>{strategy.risk}</span></div>
                <div className="mt-2"><StatusBadge tone={statusTone(strategy.status)}>{strategy.status}</StatusBadge></div>
              </button>
              <TogglePill active={strategy.status === "active"} onClick={() => void toggleStrategyStatus(strategy.id)} title="Activation enregistrée dans le runtime local" />
            </div>
            <div className="mt-4 text-sm text-slate-400">Win rate</div>
            <div className="font-mono text-xl text-emerald-300">{strategyWinRateLabel(strategy)}</div>
            <div className="mt-1 min-h-4 truncate text-xs text-slate-500">{strategyWinRateEvidence(strategy)}</div>
            <Sparkline data={priceSeries.slice(-18)} color={strategy.id.includes("scalp") ? "#f59e0b" : strategy.id.includes("mean") ? "#a855f7" : "#22c55e"} />
          </GlassCard>
        )) : (
          <GlassCard className="col-span-5"><div className="text-sm text-slate-400">Aucune stratégie ne correspond aux filtres.</div></GlassCard>
        )}
      </div>

      <div className="mt-4 grid grid-cols-[1.2fr_0.8fr_300px] gap-4">
        <GlassCard>
          <CardTitle
            title={`${selected.name} · éditeur`}
            action={
              <div className="flex flex-wrap gap-2">
                <Button onClick={duplicateSelected} size="sm" variant="ghost">Dupliquer</Button>
                <Button onClick={exportSelected} size="sm" variant="ghost"><Download className="size-4" /> Exporter</Button>
                <Button onClick={() => setActionsOpen((open) => !open)} size="sm" variant={actionsOpen ? "ai" : "ghost"}>Plus d'actions</Button>
              </div>
            }
          />
          {actionsOpen ? (
            <div className="mb-4 rounded-2xl border border-sky-400/20 bg-sky-500/8 p-3 text-sm text-slate-300">
              Activations enregistrées côté runtime local. Les stratégies paper découvertes reprennent aussi les métriques du journal.
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-4">
            <div><CardTitle title="Règles d'entrée" /> <Tags items={selected.entryRules} tone="success" /></div>
            <div><CardTitle title="Règles de sortie" /> <Tags items={selected.exitRules} tone="danger" /></div>
            <div><CardTitle title="Gestion du risque" /> <FieldRows rows={[["Stop-loss", "ATR x 1,8"], ["Take-profit", "ATR x 3,0"], ["Risque/trade", "1,0 %"], ["Trailing stop", "ATR x 1,2"]]} /></div>
            <div><CardTitle title="Filtres & actifs" /><Tags items={[...selected.filters, ...selected.assets]} /></div>
          </div>
        </GlassCard>
        <GlassCard>
          <CardTitle title="Comparaison des stratégies" />
          <div className="h-72"><Sparkline data={strategyComparison} dataKey={comparisonKey} color="#22c55e" /></div>
          <FieldRows rows={allStrategies.map((strategy) => [strategy.name, <span key={strategy.id} className={strategy.performance >= 0 ? "text-emerald-300" : "text-red-300"}>{signed(strategy.performance, "%")}</span>])} />
        </GlassCard>
        <GlassCard>
          <CardTitle title="Recommandations IA" />
          <Timeline items={[
            { title: selected.recommendation, tone: selected.performance >= 0 ? "success" : "warning" },
            { title: `Validation ${formatPercent(selected.validationRate, 1)}`, detail: `Win rate ${strategyWinRateLabel(selected)} · ${strategyWinRateEvidence(selected)} · drawdown ${signed(selected.drawdown, "%")}`, tone: selected.validationRate >= 65 ? "success" : "warning" },
            { title: "Backtest conseillé", detail: "Comparer avant activation persistante.", tone: "info" },
          ]} />
          <div className="mt-4"><CardTitle title="Notes" /><div className="flex items-center gap-2 text-sm text-slate-300">Résumé compact<InfoHint content={`${selected.name} · ${selected.assets.join(", ")} · ${selected.timeframe}.`} /></div></div>
        </GlassCard>
      </div>
    </>
  );
}

function StrategyDiscoveryPanel({
  assetsValue,
  busy,
  candidateDraftKeys,
  discovery,
  error,
  pineCodeValue,
  scanStatus,
  titleValue,
  urlValue,
  visibilityValue,
  onAddCandidate,
  onAssetsChange,
  onImportPine,
  onPaper,
  onScan,
  onPromote,
  onRefresh,
  onStage,
  onTestPaper,
  onTitleChange,
  onUrlChange,
  onPineCodeChange,
  onVisibilityChange,
}: {
  assetsValue: string;
  busy: boolean;
  candidateDraftKeys: Set<string>;
  discovery: StrategyDiscoveryState;
  error: string;
  pineCodeValue: string;
  scanStatus: string;
  titleValue: string;
  urlValue: string;
  visibilityValue: StrategyDiscoveryVisibility;
  onAddCandidate: (event: FormEvent<HTMLFormElement>) => void;
  onAssetsChange: (value: string) => void;
  onImportPine: (event: FormEvent<HTMLFormElement>) => void;
  onPaper: (candidate: StrategyDiscoveryCandidate) => void;
  onScan: () => void;
  onPromote: (candidate: StrategyDiscoveryCandidate) => void;
  onRefresh: () => void;
  onStage: (id: string, stage: StrategyDiscoveryStage) => void;
  onTestPaper: (candidate: StrategyDiscoveryCandidate) => void;
  onTitleChange: (value: string) => void;
  onUrlChange: (value: string) => void;
  onPineCodeChange: (value: string) => void;
  onVisibilityChange: (value: StrategyDiscoveryVisibility) => void;
}) {
  const candidates = discovery.candidates.slice(0, 6);

  return (
    <GlassCard className="mt-4 border-violet-400/25">
      <CardTitle
        title="Veille stratégique"
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={onRefresh} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
              Rafraîchir
            </Button>
            <Button size="sm" variant="ai" onClick={onScan} disabled={busy}>
              <Telescope className="size-4" />
              Scan contrôlé
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-[1fr_340px] gap-4">
        <div className="space-y-3">
          <form onSubmit={onAddCandidate} className="grid grid-cols-[1.1fr_0.8fr_150px_120px] gap-3">
            <label className="text-xs text-slate-400">
              Source
              <input
                value={urlValue}
                onChange={(event) => onUrlChange(event.target.value)}
                className="mt-1 h-10 w-full rounded-xl border border-[#16314a] bg-slate-950/60 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
                placeholder="https://www.tradingview.com/script/..."
                required
              />
            </label>
            <label className="text-xs text-slate-400">
              Nom
              <input
                value={titleValue}
                onChange={(event) => onTitleChange(event.target.value)}
                className="mt-1 h-10 w-full rounded-xl border border-[#16314a] bg-slate-950/60 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
                placeholder="Nom auto si vide"
              />
            </label>
            <label className="text-xs text-slate-400">
              Visibilité
              <select
                value={visibilityValue}
                onChange={(event) => onVisibilityChange(event.target.value as StrategyDiscoveryVisibility)}
                className="mt-1 h-10 w-full rounded-xl border border-[#16314a] bg-slate-950/60 px-3 text-sm text-slate-100 outline-none"
              >
                <option value="open-source">open-source</option>
                <option value="public-idea">idée publique</option>
                <option value="unknown">à confirmer</option>
                <option value="protected">protected</option>
                <option value="invite-only">invite-only</option>
              </select>
            </label>
            <label className="text-xs text-slate-400">
              Actifs
              <input
                value={assetsValue}
                onChange={(event) => onAssetsChange(event.target.value)}
                className="mt-1 h-10 w-full rounded-xl border border-[#16314a] bg-slate-950/60 px-3 text-sm text-slate-100 outline-none"
              />
            </label>
            <div className="col-span-4 flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={busy} variant="success">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Ajouter source
              </Button>
              <StatusBadge tone="ai">daily · {discovery.maxCandidatesPerDay}/jour</StatusBadge>
              <StatusBadge tone="neutral">dernier scan · {dateLabel(discovery.lastScanAt)}</StatusBadge>
              <StatusBadge tone="info">prochain · {dateLabel(discovery.nextScanAt)}</StatusBadge>
              {scanStatus ? <StatusBadge tone="warning">{scanStatus}</StatusBadge> : null}
              {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
            </div>
          </form>

          <form onSubmit={onImportPine} className="rounded-xl border border-violet-400/20 bg-violet-500/[0.05] p-3">
            <label className="text-xs text-slate-400">
              Import Pine Script
              <textarea
                value={pineCodeValue}
                onChange={(event) => onPineCodeChange(event.target.value)}
                className="mt-1 min-h-24 w-full resize-y rounded-xl border border-[#16314a] bg-slate-950/70 px-3 py-2 font-mono text-xs leading-relaxed text-slate-100 outline-none placeholder:text-slate-600"
                placeholder={'//@version=5\nstrategy("Ma stratégie", overlay=true)\n...'}
                required
              />
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={busy || !pineCodeValue.trim()} variant="ai">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Importer Pine
              </Button>
              <StatusBadge tone="neutral">audit local · backtest ensuite</StatusBadge>
            </div>
          </form>
        </div>

        <div className="space-y-2 rounded-xl border border-[#16314a] bg-slate-950/45 p-3">
          {discovery.sources.map((source) => (
            <div key={source.id} className="flex items-start justify-between gap-3 text-xs">
              <div>
                <div className="font-semibold text-white">{source.label}</div>
                <div className="mt-1 line-clamp-2 text-slate-500">{source.policy}</div>
              </div>
              <StatusBadge tone={source.enabled ? "success" : "neutral"}>{source.enabled ? "ON" : "OFF"}</StatusBadge>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {candidates.length ? candidates.map((candidate) => {
          const hasDraft = candidateDraftKeys.has(slug(candidate.title));
          const inAudit = candidate.stage === "codex_review";
          const inPaper = candidate.stage === "paper_incubation";

          return (
          <div key={candidate.id} data-strategy-candidate-id={candidate.id} className="rounded-xl border border-[#16314a] bg-white/[0.025] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-white">{candidate.title}</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  <StatusBadge tone={stageTone(candidate.stage)}>{stageLabel(candidate.stage)}</StatusBadge>
                  <StatusBadge tone={visibilityTone(candidate.visibility)}>{visibilityLabel(candidate.visibility)}</StatusBadge>
                  {candidate.pineSummary ? <StatusBadge tone="ai">Pine v{candidate.pineSummary.version}</StatusBadge> : null}
                </div>
              </div>
              {candidate.sourceUrl ? (
                <a href={candidate.sourceUrl} target="_blank" rel="noreferrer" className="grid size-8 shrink-0 place-items-center rounded-lg border border-sky-400/30 bg-sky-500/10 text-sky-300">
                  <ExternalLink className="size-4" />
                </a>
              ) : null}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <MetricChip label="Score" value={`${candidate.score}/100`} />
              <MetricChip label="Paper" value={`${candidate.paper.trades} · ${paperStatusLabel(candidate.paper.status)}`} />
              <MetricChip label={candidate.pineSummary ? "Pyramiding" : "Risque"} value={candidate.pineSummary ? `x${candidate.pineSummary.pyramiding}` : candidate.risk} />
            </div>
            {candidate.pineSummary ? (
              <div className="mt-2 text-xs text-slate-400">
                Pine · {candidate.pineSummary.entries} entrée(s) · {candidate.pineSummary.exits} sortie(s) · {candidate.pineSummary.hasStopLoss ? "SL OK" : "SL ?"}
              </div>
            ) : null}
            <div className="mt-3 text-xs leading-relaxed text-slate-400">{candidate.nextAction}</div>
            {candidate.blockers.length ? <div className="mt-2 text-xs text-amber-300">{candidate.blockers.join(" · ")}</div> : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant={inAudit ? "warning" : "ai"} data-strategy-candidate-action="audit" onClick={() => onStage(candidate.id, "codex_review")} disabled={busy || candidate.stage === "blocked"}>
                <Sparkles className="size-4" />
                {inAudit ? "En audit" : "Audit"}
              </Button>
              <Button size="sm" variant={hasDraft ? "success" : "ghost"} data-strategy-candidate-action="draft" onClick={() => onPromote(candidate)} disabled={busy || candidate.stage === "blocked"}>{hasDraft ? "Brouillon prêt" : "Brouillon"}</Button>
              <Button size="sm" variant={inPaper ? "success" : "ghost"} data-strategy-candidate-action="paper" onClick={() => onPaper(candidate)} disabled={busy || candidate.stage === "blocked"}>{inPaper ? "En paper" : "Paper"}</Button>
              {inPaper ? <Button size="sm" variant="warning" data-strategy-candidate-action="test-paper" onClick={() => onTestPaper(candidate)} disabled={busy}>Tester</Button> : null}
            </div>

            <div className="mt-3">
              <LocalAnalysisButton
                surface="strategy-discovery"
                task="Auditer cette stratégie découverte avant backtest ou paper trading."
                context={{ candidate, discoveryPolicy: candidate.licenseNotes }}
                label="Codex"
              />
            </div>
          </div>
          );
        }) : (
          <div className="col-span-3 rounded-xl border border-dashed border-[#16314a] bg-slate-950/35 p-4 text-sm text-slate-400">
            Aucune source en veille. Colle une URL TradingView publique dans le champ Source, ajoute-la, puis lance le scan contrôlé.
          </div>
        )}
      </div>
    </GlassCard>
  );
}

function statusTone(status: StrategyDefinition["status"]) {
  if (status === "active") return "success";
  if (status === "draft") return "warning";
  return "neutral";
}

function stageTone(stage: StrategyDiscoveryStage) {
  if (stage === "live_candidate") return "success";
  if (stage === "paper_incubation") return "info";
  if (stage === "backtest_queue") return "ai";
  if (stage === "blocked") return "danger";
  if (stage === "codex_review") return "warning";
  return "neutral";
}

function stageLabel(stage: StrategyDiscoveryStage) {
  const labels: Record<StrategyDiscoveryStage, string> = {
    source_watch: "source",
    codex_review: "audit Codex",
    backtest_queue: "backtest",
    paper_incubation: "paper",
    live_candidate: "candidat live",
    blocked: "bloqué",
  };
  return labels[stage];
}

function stageActionMessage(stage: StrategyDiscoveryStage) {
  const messages: Record<StrategyDiscoveryStage, string> = {
    source_watch: "Source replacée en veille.",
    codex_review: "Audit marqué. Lance Codex dans Analyse locale pour obtenir le rapport détaillé.",
    backtest_queue: "Brouillon prêt. Étape suivante : backtest déterministe.",
    paper_incubation: "Paper prêt. La stratégie est disponible dans la bibliothèque locale.",
    live_candidate: "Candidat live marqué. Validation humaine requise avant réel.",
    blocked: "Stratégie bloquée.",
  };
  return messages[stage];
}

function paperStatusLabel(status: StrategyDiscoveryCandidate["paper"]["status"]) {
  const labels: Record<StrategyDiscoveryCandidate["paper"]["status"], string> = {
    not_started: "non lancé",
    queued: "en file",
    watching: "veille",
    running: "test",
    passed: "validé",
    failed: "rejeté",
  };
  return labels[status];
}

function stageNextAction(stage: StrategyDiscoveryStage, fallback: string) {
  if (stage === "codex_review") return "Audit Codex à lancer, puis backtest déterministe.";
  if (stage === "backtest_queue") return "Lancer un backtest déterministe.";
  if (stage === "paper_incubation") return "Incuber en paper avec faible risque.";
  if (stage === "live_candidate") return "Préparer un dossier de validation humaine avant live.";
  if (stage === "blocked") return "Clarifier les droits ou les règles avant analyse.";
  return fallback;
}

function applyCandidateStage(state: StrategyDiscoveryState, id: string, stage: StrategyDiscoveryStage): StrategyDiscoveryState {
  const now = new Date().toISOString();
  return {
    ...state,
    updatedAt: now,
    candidates: state.candidates.map((candidate) => candidate.id === id ? {
      ...candidate,
      stage,
      paper: stage === "paper_incubation" && candidate.paper.status === "not_started" ? { ...candidate.paper, status: "watching" } : candidate.paper,
      updatedAt: now,
      lastReviewAt: stage === "codex_review" ? now : candidate.lastReviewAt,
      nextAction: stageNextAction(stage, candidate.nextAction),
    } : candidate),
  };
}

function visibilityTone(visibility: StrategyDiscoveryVisibility) {
  if (visibility === "open-source" || visibility === "public-idea") return "success";
  if (visibility === "protected" || visibility === "invite-only") return "danger";
  return "warning";
}

function visibilityLabel(visibility: StrategyDiscoveryVisibility) {
  const labels: Record<StrategyDiscoveryVisibility, string> = {
    "open-source": "open-source",
    "public-idea": "idée publique",
    unknown: "à confirmer",
    protected: "protected",
    "invite-only": "invite-only",
  };
  return labels[visibility];
}

function dateLabel(iso?: string) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "-";
  }
}

function slug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42) || "strategie";
}

function discoveryPaperAgentId(candidateId: string) {
  return `strategy-${candidateId}`;
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/50 px-2 py-1">
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      <div className="truncate font-mono text-xs text-slate-100">{value}</div>
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

function CardTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="text-base font-bold text-white">{title}</div>
      {action}
    </div>
  );
}

function FieldRows({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <div className="divide-y divide-[#16314a] text-sm">
      {rows.map(([label, value], index) => (
        <div key={`${label}-${index}`} className="flex items-center justify-between gap-4 py-2">
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
