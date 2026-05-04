import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type TradingSizingMode = "equity_percent" | "fixed_usd";

export type PaperTradingAllocationSettings = {
  enabled: boolean;
  capitalUsd: number;
  sizingMode: TradingSizingMode;
  tradeAmountPercent: number;
  tradeAmountUsd: number;
  riskPerTradePercent: number;
  leverage: number;
  maxOpenPositions: number;
  maxPortfolioExposurePercent: number;
  dailyLossLimitPercent: number;
  weeklyLossLimitPercent: number;
};

export type LiveTradingAllocationSettings = {
  enabled: boolean;
  sizingMode: TradingSizingMode;
  tradeAmountPercent: number;
  tradeAmountUsd: number;
  riskPerTradePercent: number;
  leverage: number;
  maxPortfolioExposurePercent: number;
  maxDailyLossPercent: number;
  requireHumanValidation: boolean;
};

export type TradingAllocationConfig = {
  version: 1;
  updatedAt: string;
  paper: PaperTradingAllocationSettings;
  live: LiveTradingAllocationSettings;
  source: "file" | "env" | "defaults";
};

export type TradingAllocationPatch = {
  paper?: Partial<PaperTradingAllocationSettings>;
  live?: Partial<LiveTradingAllocationSettings>;
};

const RUNTIME_DIR = path.join(process.cwd(), ".agent-trader-runtime");
const ALLOCATION_FILE = path.join(RUNTIME_DIR, "trading-allocation.json");

function envNumber(key: string, fallback: number) {
  const value = Number(process.env[key]);
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: unknown, fallback: number, min: number, max: number, digits = 2) {
  const numeric = typeof value === "number" ? value : Number(value);
  const safe = Number.isFinite(numeric) ? numeric : fallback;
  return Number(Math.min(max, Math.max(min, safe)).toFixed(digits));
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  return Math.round(clamp(value, fallback, min, max, 0));
}

function sizingMode(value: unknown, fallback: TradingSizingMode): TradingSizingMode {
  return value === "fixed_usd" || value === "equity_percent" ? value : fallback;
}

function defaultPaperSettings(): PaperTradingAllocationSettings {
  return {
    enabled: true,
    capitalUsd: envNumber("PAPER_TRADING_INITIAL_CAPITAL_USD", 10_000),
    sizingMode: "equity_percent",
    tradeAmountPercent: 2,
    tradeAmountUsd: 250,
    riskPerTradePercent: envNumber("PAPER_TRADE_RISK_LIMIT_PERCENT", 1),
    leverage: 1,
    maxOpenPositions: envNumber("PAPER_TRADING_MAX_OPEN_POSITIONS", 4),
    maxPortfolioExposurePercent: envNumber("PAPER_EXPOSURE_LIMIT_PERCENT", 15),
    dailyLossLimitPercent: envNumber("PAPER_DAILY_RISK_LIMIT_PERCENT", 3),
    weeklyLossLimitPercent: envNumber("PAPER_WEEKLY_RISK_LIMIT_PERCENT", 5),
  };
}

function defaultLiveSettings(): LiveTradingAllocationSettings {
  return {
    enabled: false,
    sizingMode: "fixed_usd",
    tradeAmountPercent: 1,
    tradeAmountUsd: 100,
    riskPerTradePercent: 0.25,
    leverage: 1,
    maxPortfolioExposurePercent: 5,
    maxDailyLossPercent: 1,
    requireHumanValidation: true,
  };
}

function normalizePaperSettings(value: unknown, fallback = defaultPaperSettings()): PaperTradingAllocationSettings {
  const input = value && typeof value === "object" ? value as Partial<PaperTradingAllocationSettings> : {};
  return {
    enabled: input.enabled !== false,
    capitalUsd: clamp(input.capitalUsd, fallback.capitalUsd, 100, 100_000_000, 2),
    sizingMode: sizingMode(input.sizingMode, fallback.sizingMode),
    tradeAmountPercent: clamp(input.tradeAmountPercent, fallback.tradeAmountPercent, 0.01, 100, 2),
    tradeAmountUsd: clamp(input.tradeAmountUsd, fallback.tradeAmountUsd, 1, 100_000_000, 2),
    riskPerTradePercent: clamp(input.riskPerTradePercent, fallback.riskPerTradePercent, 0.01, 25, 2),
    leverage: clamp(input.leverage, fallback.leverage, 1, 125, 2),
    maxOpenPositions: clampInteger(input.maxOpenPositions, fallback.maxOpenPositions, 1, 200),
    maxPortfolioExposurePercent: clamp(input.maxPortfolioExposurePercent, fallback.maxPortfolioExposurePercent, 1, 500, 2),
    dailyLossLimitPercent: clamp(input.dailyLossLimitPercent, fallback.dailyLossLimitPercent, 0.01, 100, 2),
    weeklyLossLimitPercent: clamp(input.weeklyLossLimitPercent, fallback.weeklyLossLimitPercent, 0.01, 100, 2),
  };
}

function normalizeLiveSettings(value: unknown, fallback = defaultLiveSettings()): LiveTradingAllocationSettings {
  const input = value && typeof value === "object" ? value as Partial<LiveTradingAllocationSettings> : {};
  return {
    enabled: input.enabled === true,
    sizingMode: sizingMode(input.sizingMode, fallback.sizingMode),
    tradeAmountPercent: clamp(input.tradeAmountPercent, fallback.tradeAmountPercent, 0.01, 100, 2),
    tradeAmountUsd: clamp(input.tradeAmountUsd, fallback.tradeAmountUsd, 1, 100_000_000, 2),
    riskPerTradePercent: clamp(input.riskPerTradePercent, fallback.riskPerTradePercent, 0.01, 25, 2),
    leverage: clamp(input.leverage, fallback.leverage, 1, 125, 2),
    maxPortfolioExposurePercent: clamp(input.maxPortfolioExposurePercent, fallback.maxPortfolioExposurePercent, 0.01, 500, 2),
    maxDailyLossPercent: clamp(input.maxDailyLossPercent, fallback.maxDailyLossPercent, 0.01, 100, 2),
    requireHumanValidation: input.requireHumanValidation !== false,
  };
}

function normalizeConfig(value: unknown, source: TradingAllocationConfig["source"]): TradingAllocationConfig {
  const input = value && typeof value === "object" ? value as Partial<TradingAllocationConfig> : {};
  const paper = normalizePaperSettings(input.paper);
  const live = normalizeLiveSettings(input.live);

  return {
    version: 1,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : new Date().toISOString(),
    paper,
    live,
    source,
  };
}

function hasAllocationEnv() {
  return [
    "PAPER_TRADING_INITIAL_CAPITAL_USD",
    "PAPER_TRADING_MAX_OPEN_POSITIONS",
    "PAPER_EXPOSURE_LIMIT_PERCENT",
    "PAPER_DAILY_RISK_LIMIT_PERCENT",
    "PAPER_TRADE_RISK_LIMIT_PERCENT",
    "PAPER_WEEKLY_RISK_LIMIT_PERCENT",
  ].some((key) => Boolean(process.env[key]));
}

async function ensureRuntimeDir() {
  await mkdir(RUNTIME_DIR, { recursive: true });
}

export async function readTradingAllocationConfig(): Promise<TradingAllocationConfig> {
  try {
    const raw = await readFile(ALLOCATION_FILE, "utf8");
    return normalizeConfig(JSON.parse(raw) as unknown, "file");
  } catch {
    return normalizeConfig(null, hasAllocationEnv() ? "env" : "defaults");
  }
}

export async function writeTradingAllocationConfig(patch: TradingAllocationPatch) {
  const current = await readTradingAllocationConfig();
  const next = normalizeConfig({
    version: 1,
    updatedAt: new Date().toISOString(),
    paper: { ...current.paper, ...patch.paper },
    live: { ...current.live, ...patch.live },
  }, "file");
  const persisted = {
    version: next.version,
    updatedAt: next.updatedAt,
    paper: next.paper,
    live: next.live,
  };

  await ensureRuntimeDir();
  await writeFile(ALLOCATION_FILE, `${JSON.stringify(persisted, null, 2)}\n`, "utf8");
  return next;
}

export function getTradingAllocationFilePath() {
  return ALLOCATION_FILE;
}
