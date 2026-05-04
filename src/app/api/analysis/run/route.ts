import { NextResponse } from "next/server";
import { getAppData, type AppDataSnapshot } from "@/server/app-data";
import { runConfiguredLocalAnalysis } from "@/server/analysis/local-provider";
import { guardSensitiveMutation } from "@/server/security/sensitive-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AnalysisSurface =
  | "backtest"
  | "strategy-discovery"
  | "strategy-architect"
  | "decision-replay"
  | "weekly-postmortem"
  | "crisis-simulator"
  | "general";

type AnalysisRunRequest = {
  surface?: AnalysisSurface;
  task?: string;
  instruction?: string;
  context?: unknown;
};

function limitText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function safeSurface(value: unknown): AnalysisSurface {
  if (
    value === "backtest" ||
    value === "strategy-discovery" ||
    value === "strategy-architect" ||
    value === "decision-replay" ||
    value === "weekly-postmortem" ||
    value === "crisis-simulator" ||
    value === "general"
  ) {
    return value;
  }

  return "general";
}

function compactAppContext(data: AppDataSnapshot) {
  return {
    sourceStatus: data.sourceStatus,
    metrics: {
      market: data.metrics.market,
      trade: data.metrics.trade,
      risk: data.metrics.risk,
      strategy: data.metrics.strategy,
      crisis: data.metrics.crisis,
      runtime: data.metrics.runtime,
    },
    marketAssets: data.marketAssets.slice(0, 8).map((asset) => ({
      symbol: asset.symbol,
      price: asset.price,
      change24h: asset.change24h,
      volatility: asset.volatility,
      confidence: asset.confidence,
      authorized: asset.authorized,
      signal: asset.signal,
    })),
    strategies: data.strategies.slice(0, 6).map((strategy) => ({
      id: strategy.id,
      name: strategy.name,
      status: strategy.status,
      timeframe: strategy.timeframe,
      performance: strategy.performance,
      drawdown: strategy.drawdown,
      winRate: strategy.winRate,
      validationRate: strategy.validationRate,
      recommendation: strategy.recommendation,
    })),
    trades: data.trades.slice(0, 12).map((trade) => ({
      id: trade.id,
      source: trade.source,
      date: trade.date,
      time: trade.time,
      agentId: trade.agentId,
      asset: trade.asset,
      side: trade.side,
      riskPercent: trade.riskPercent,
      confidence: trade.confidence,
      pnl: trade.pnl,
      status: trade.status,
      initialReason: trade.initialReason,
      exitReason: trade.exitReason,
      lesson: trade.lesson,
    })),
    alerts: data.alerts.slice(0, 8).map((alert) => ({
      severity: alert.severity,
      type: alert.type,
      title: alert.title,
      rootCause: alert.rootCause,
      recommendedAction: alert.recommendedAction,
    })),
    riskLimits: data.riskLimits,
    activeRiskRules: data.riskRules.filter((rule) => rule.status === "active").slice(0, 10).map((rule) => ({
      id: rule.id,
      name: rule.name,
      severity: rule.severity,
      conditions: rule.conditions,
      actions: rule.actions,
    })),
    replaySteps: data.replaySteps.slice(0, 8),
  };
}

function surfaceInstruction(surface: AnalysisSurface) {
  const instructions: Record<AnalysisSurface, string> = {
    backtest: "Analyse les résultats de backtest/simulation. Identifie robustesse, biais possibles, drawdown, qualité des trades, tests complémentaires, et critères de blocage avant paper trading.",
    "strategy-discovery": "Analyse une source de stratégie découverte. Vérifie si elle est testable sans copier de code fermé, repère les règles exploitables, les risques de repainting/sur-optimisation, les hypothèses de backtest, et les critères avant paper trading.",
    "strategy-architect": "Analyse une idée, un Pine Script ou une image de stratégie pour en faire un brouillon testable. Repère les règles manquantes, risques, repainting, stop-loss, sizing, et prochaines étapes. Si un chemin local d'image est fourni, utilise-le comme référence visuelle si le provider local sait lire les images; sinon signale clairement la limite.",
    "decision-replay": "Analyse une décision passée. Reconstitue les points forts/faibles du raisonnement et les conditions qui auraient dû bloquer ou valider l'analyse.",
    "weekly-postmortem": "Analyse le post-mortem hebdomadaire. Priorise les erreurs répétées, ajustements de règles, et actions d'amélioration non exécutantes.",
    "crisis-simulator": "Analyse les scénarios de crise. Repère les faiblesses de réaction, garde-fous manquants, seuils à durcir, et tests à rejouer.",
    general: "Analyse le contexte fourni pour produire un diagnostic opérationnel prudent et actionnable, sans exécution.",
  };

  return instructions[surface];
}

function buildPrompt(surface: AnalysisSurface, task: string, instruction: string, context: unknown, data: AppDataSnapshot) {
  return [
    "Tu es Codex/OpenClaw utilisé comme moteur d'analyse local dans TraderAI.",
    "Tu peux analyser, critiquer, synthétiser et proposer des étapes de validation.",
    "Interdictions strictes: ne déclenche aucun ordre, ne modifie aucun fichier, ne donne pas de conseil financier personnalisé, ne demande pas d'appeler un exchange.",
    "Réponds en français, de façon structurée et concise.",
    "",
    `Surface: ${surface}`,
    `Mission: ${task || surfaceInstruction(surface)}`,
    instruction ? `Instruction utilisateur: ${instruction}` : "",
    "",
    "Contexte runtime compact JSON:",
    JSON.stringify(compactAppContext(data)),
    "",
    context ? "Contexte spécifique JSON:" : "",
    context ? JSON.stringify(context).slice(0, 24_000) : "",
    "",
    "Format de réponse attendu:",
    "- Verdict court",
    "- Points de robustesse",
    "- Risques / biais",
    "- Prochaines vérifications sans exécution",
  ].filter(Boolean).join("\n");
}

export async function POST(request: Request) {
  const blocked = guardSensitiveMutation(request, "local-analysis-run");
  if (blocked) return blocked;

  const body = (await request.json().catch(() => ({}))) as AnalysisRunRequest;
  const surface = safeSurface(body.surface);
  const task = limitText(body.task, 500);
  const instruction = limitText(body.instruction, 1000);
  const data = await getAppData({ bypassCache: true });
  const result = await runConfiguredLocalAnalysis(buildPrompt(surface, task, instruction, body.context, data));

  return NextResponse.json({
    ok: result.ok,
    enabled: result.enabled,
    providerId: result.providerId,
    latencyMs: result.latencyMs,
    text: result.text,
    error: result.error,
    surface,
    generatedAt: new Date().toISOString(),
  }, { status: result.enabled ? 200 : 409 });
}
