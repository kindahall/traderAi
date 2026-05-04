import { agents } from "@/data/runtime/agents";
import type { Agent } from "@/types/agent";
import type { PaperPosition, PaperTradingState, StrategyRuntimeProfile } from "@/server/paper-trading/types";

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function defaultMinVolume(agent: Agent) {
  const strategy = agent.strategy.toLowerCase();
  if (strategy.includes("scalp")) return 0.25;
  if (strategy.includes("mean")) return 0.15;
  return 0.2;
}

export function defaultStrategyProfile(agent: Agent): StrategyRuntimeProfile {
  return {
    agentId: agent.id,
    strategy: agent.strategy,
    minConfidence: 50,
    minVolumeRatio: defaultMinVolume(agent),
    cooldownMinutes: 20,
    advisoryExecutorMinConfidence: 50,
    riskMultiplier: 0.42,
    reviewCount: 0,
    updatedAt: new Date().toISOString(),
    rationale: "Profil initial de collecte paper : petits risques, seuils ouverts et live verrouillé.",
  };
}

function closedCountForAgent(positions: PaperPosition[], agentId: string) {
  return positions.filter((position) => position.agentId === agentId && position.status === "closed").length;
}

function repairedLegacyProfile(agent: Agent, current: StrategyRuntimeProfile, closedCount: number) {
  if (current.reviewCount <= Math.max(12, closedCount * 3)) return null;
  const baseline = defaultStrategyProfile(agent);

  return {
    ...baseline,
    minConfidence: Math.min(58, baseline.minConfidence + 6),
    minVolumeRatio: round(clamp(defaultMinVolume(agent) + 0.16, defaultMinVolume(agent), 0.55), 2),
    riskMultiplier: 0.34,
    cooldownMinutes: 30,
    reviewCount: closedCount,
    updatedAt: new Date().toISOString(),
    rationale: "Profil réparé : l'ancien ajustement augmentait les seuils à chaque cycle sans nouveau trade clôturé.",
  };
}

export function normalizeStrategyProfiles(state: PaperTradingState): StrategyRuntimeProfile[] {
  const existing = new Map((state.strategyProfiles ?? []).map((profile) => [profile.agentId, profile]));

  return agents
    .filter((agent) => agent.mode === "paper")
    .map((agent) => {
      const baseline = defaultStrategyProfile(agent);
      const current = { ...baseline, ...existing.get(agent.id), strategy: agent.strategy };
      const closedCount = closedCountForAgent(state.positions, agent.id);
      const repaired = repairedLegacyProfile(agent, current, closedCount);
      if (repaired) return repaired;
      const closedForProfile = closedCount > 0;

      if (!closedForProfile && current.reviewCount === 0) {
        return {
          ...current,
          minConfidence: Math.min(current.minConfidence, baseline.minConfidence),
          minVolumeRatio: Math.min(current.minVolumeRatio, baseline.minVolumeRatio),
          advisoryExecutorMinConfidence: Math.min(current.advisoryExecutorMinConfidence, baseline.advisoryExecutorMinConfidence),
          riskMultiplier: Math.min(current.riskMultiplier, baseline.riskMultiplier),
          rationale: baseline.rationale,
        };
      }

      return current;
    });
}

export function getStrategyProfile(state: PaperTradingState, agent: Agent): StrategyRuntimeProfile {
  return normalizeStrategyProfiles(state).find((profile) => profile.agentId === agent.id) ?? defaultStrategyProfile(agent);
}

function closedForAgent(positions: PaperPosition[], agentId: string) {
  return positions
    .filter((position) => position.agentId === agentId && position.status === "closed")
    .toSorted((a, b) => new Date(b.closedAt ?? b.openedAt).getTime() - new Date(a.closedAt ?? a.openedAt).getTime())
    .slice(0, 20);
}

function closedStats(positions: PaperPosition[]) {
  const wins = positions.filter((position) => (position.realizedPnlUsd ?? 0) > 0);
  const realized = positions.reduce((total, position) => total + (position.realizedPnlUsd ?? 0), 0);

  return {
    count: positions.length,
    winRate: positions.length ? round((wins.length / positions.length) * 100, 1) : 0,
    realized: round(realized, 2),
  };
}

export function evolveStrategyProfiles(state: PaperTradingState) {
  const profiles = normalizeStrategyProfiles(state);
  const updated: StrategyRuntimeProfile[] = [];
  const changes: Array<{ before: StrategyRuntimeProfile; after: StrategyRuntimeProfile; reason: string }> = [];

  for (const profile of profiles) {
    const agent = agents.find((candidate) => candidate.id === profile.agentId);
    if (!agent) {
      updated.push(profile);
      continue;
    }

    const recentClosed = closedForAgent(state.positions, profile.agentId);
    const stats = closedStats(recentClosed);
    let next = { ...profile };
    let reason = "";

    if (stats.count < 8) {
      next = { ...next, reviewCount: stats.count, rationale: `Collecte en cours : ${stats.count}/8 trades clôturés avant adaptation plus agressive.` };
      updated.push(next);
      continue;
    }

    if (profile.reviewCount >= stats.count) {
      next.rationale = `Attente d'un nouveau trade clôturé : ${stats.count} trade(s) déjà pris en compte.`;
      updated.push(next);
      continue;
    }

    if (stats.winRate < 45 || state.metrics.disciplineScore < 70) {
      next = {
        ...next,
        minConfidence: clamp(next.minConfidence + 2, 50, 72),
        minVolumeRatio: round(clamp(next.minVolumeRatio + 0.08, defaultMinVolume(agent), 1.2), 2),
        riskMultiplier: round(clamp(next.riskMultiplier - 0.08, 0.25, 0.75), 2),
        cooldownMinutes: clamp(next.cooldownMinutes + 5, 20, 45),
      };
      reason = `Défensif : win rate ${stats.winRate}% / discipline ${state.metrics.disciplineScore}/100.`;
    } else if (stats.winRate > 58 && stats.realized > 0 && state.metrics.disciplineScore >= 80) {
      next = {
        ...next,
        minConfidence: clamp(next.minConfidence - 1, 50, 72),
        minVolumeRatio: round(clamp(next.minVolumeRatio - 0.03, defaultMinVolume(agent), 1.2), 2),
        riskMultiplier: round(clamp(next.riskMultiplier + 0.03, 0.25, 0.75), 2),
      };
      reason = `Assouplissement prudent : win rate ${stats.winRate}% et P&L réalisé ${stats.realized} $.`;
    } else {
      next.rationale = `Maintien : win rate ${stats.winRate}%, P&L ${stats.realized} $, discipline ${state.metrics.disciplineScore}/100.`;
      updated.push(next);
      continue;
    }

    next.reviewCount = stats.count;
    next.updatedAt = new Date().toISOString();
    next.rationale = reason;
    updated.push(next);

    if (
      next.minConfidence !== profile.minConfidence ||
      next.minVolumeRatio !== profile.minVolumeRatio ||
      next.riskMultiplier !== profile.riskMultiplier ||
      next.cooldownMinutes !== profile.cooldownMinutes
    ) {
      changes.push({ before: profile, after: next, reason });
    }
  }

  return { profiles: updated, changes };
}
