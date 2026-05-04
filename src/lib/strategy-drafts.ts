import type { StrategyDefinition } from "@/data/runtime/strategies";

export const LOCAL_STRATEGY_DRAFTS_STORAGE_KEY = "traderai.strategyDrafts.v1";

function normalizedDraftName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function draftIdentity(draft: Pick<StrategyDefinition, "id" | "name">) {
  return normalizedDraftName(draft.name) || draft.id;
}

function isStrategyStatus(value: unknown): value is StrategyDefinition["status"] {
  return value === "active" || value === "inactive" || value === "draft";
}

function isStrategyRisk(value: unknown): value is StrategyDefinition["risk"] {
  return value === "Faible" || value === "Modéré" || value === "Élevé";
}

function stringList(value: unknown, fallback: string[] = []) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : fallback;
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function sanitizeStrategyDrafts(value: unknown): StrategyDefinition[] {
  if (!Array.isArray(value)) return [];

  const drafts = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const draft = item as Partial<StrategyDefinition>;
    if (typeof draft.id !== "string" || typeof draft.name !== "string") return [];

    return [{
      id: draft.id,
      name: draft.name,
      status: isStrategyStatus(draft.status) ? draft.status : "draft",
      timeframe: typeof draft.timeframe === "string" ? draft.timeframe : "5m",
      risk: isStrategyRisk(draft.risk) ? draft.risk : "Modéré",
      winRate: numberValue(draft.winRate, 0),
      performance: numberValue(draft.performance, 0),
      drawdown: numberValue(draft.drawdown, 0),
      validationRate: numberValue(draft.validationRate, 0),
      assets: stringList(draft.assets, ["BTC/USD"]),
      entryRules: stringList(draft.entryRules),
      exitRules: stringList(draft.exitRules),
      filters: stringList(draft.filters),
      recommendation: typeof draft.recommendation === "string" ? draft.recommendation : "Brouillon local à auditer avant backtest.",
    }];
  });

  const seen = new Set<string>();
  return drafts.filter((draft) => {
    const key = draftIdentity(draft);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function readLocalStrategyDrafts() {
  if (typeof window === "undefined") return [];

  try {
    return sanitizeStrategyDrafts(JSON.parse(window.localStorage.getItem(LOCAL_STRATEGY_DRAFTS_STORAGE_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function writeLocalStrategyDraft(draft: StrategyDefinition) {
  const current = readLocalStrategyDrafts();
  const draftKey = draftIdentity(draft);
  const next = [draft, ...current.filter((item) => item.id !== draft.id && draftIdentity(item) !== draftKey)].slice(0, 25);
  window.localStorage.setItem(LOCAL_STRATEGY_DRAFTS_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function deleteLocalStrategyDraft(id: string) {
  const next = readLocalStrategyDrafts().filter((draft) => draft.id !== id);
  window.localStorage.setItem(LOCAL_STRATEGY_DRAFTS_STORAGE_KEY, JSON.stringify(next));
  return next;
}
