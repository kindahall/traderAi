import { NextResponse } from "next/server";
import { getAppData } from "@/server/app-data";
import { runConfiguredLlmRole, runSpecificLlmProvider } from "@/server/adapters/llm";
import { guardSensitiveMutation } from "@/server/security/sensitive-api";
import type { LLMRole } from "@/types/llm";

export async function POST(request: Request) {
  const blocked = guardSensitiveMutation(request, "llm-insight");
  if (blocked) return blocked;

  const body = (await request.json().catch(() => ({}))) as { role?: LLMRole; page?: string; providerId?: string; modelId?: string };
  const role: LLMRole = body.role || "auditeur";
  const snapshot = await getAppData();

  const prompt = [
    `Page demandée: ${body.page || "llm-providers"}`,
    `Marché: ${snapshot.metrics.market.primarySymbol}, tendance ${snapshot.metrics.market.trendLabel}, prix ${snapshot.metrics.market.primaryPrice}, volatilité moyenne ${snapshot.metrics.market.avgVolatility}%.`,
    `Risque: exposition ${snapshot.metrics.risk.exposurePercent}/${snapshot.metrics.risk.exposureLimit}%, risque journalier ${snapshot.metrics.risk.dailyRiskPercent}/${snapshot.metrics.risk.dailyRiskLimit}%, alertes actives ${snapshot.metrics.risk.activeAlerts}.`,
    `Trades: total ${snapshot.metrics.trade.total}, win rate ${snapshot.metrics.trade.winRate}%, PnL ${snapshot.metrics.trade.pnlTotal} USD, refus ${snapshot.metrics.trade.refused}.`,
    `Contraintes: aucun conseil financier, ne recommande jamais l'exécution directe; si risque élevé, demande validation humaine.`,
    `Donne 3 constats, 3 actions sûres et un verdict court pour le mode paper/live.`,
  ].join("\n");

  const result = body.providerId && body.modelId
    ? await runSpecificLlmProvider(body.providerId, body.modelId, role, prompt)
    : await runConfiguredLlmRole(role, prompt);
  return NextResponse.json({ ...result, role, generatedAt: new Date().toISOString() });
}
