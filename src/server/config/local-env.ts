import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getMarketProviderConfig, type MarketProviderId } from "@/server/adapters/market-data";

const LOCAL_ENV_FILE = path.join(process.cwd(), ".env.local");

export type ExchangeEnvConfig = {
  providerId: MarketProviderId;
  providerLabel: string;
  walletProvider: string;
  walletConfigured: boolean;
  apiKeyConfigured: boolean;
  secretConfigured: boolean;
  passphraseConfigured: boolean;
  tradingEnabled: boolean;
  withdrawalsEnabled: boolean;
};

export type ExchangeEnvUpdate = {
  providerId?: MarketProviderId;
  walletProvider?: string;
  apiKey?: string;
  secretKey?: string;
  passphrase?: string;
  liveTradingEnabled?: boolean;
  withdrawalsEnabled?: boolean;
};

const providerIds = new Set<MarketProviderId>(["dydx", "binance", "kraken", "coinbase"]);

function readProviderId(value: string | undefined): MarketProviderId | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized && providerIds.has(normalized as MarketProviderId) ? normalized as MarketProviderId : undefined;
}

async function readLocalEnvFile() {
  try {
    return await readFile(LOCAL_ENV_FILE, "utf8");
  } catch {
    return "# Local secrets. This file is ignored by git.\n";
  }
}

function encodeEnvValue(value: string) {
  if (!value) return "";
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

async function updateLocalEnv(values: Record<string, string | null>) {
  const raw = await readLocalEnvFile();
  const lines = raw.split(/\r?\n/);
  const remaining = new Map(Object.entries(values));
  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match) return line;

    const key = match[1];
    if (!remaining.has(key)) return line;

    const value = remaining.get(key) ?? null;
    remaining.delete(key);
    return value === null ? null : `${key}=${encodeEnvValue(value)}`;
  }).filter((line): line is string => line !== null);

  for (const [key, value] of remaining) {
    if (value !== null) nextLines.push(`${key}=${encodeEnvValue(value)}`);
  }

  const output = `${nextLines.filter((line, index, array) => line || index < array.length - 1).join("\n")}\n`;
  await writeFile(LOCAL_ENV_FILE, output, "utf8");
}

function applyRuntimeEnv(values: Record<string, string | null>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

export function readExchangeEnvConfig(): ExchangeEnvConfig {
  const provider = getMarketProviderConfig();
  const walletProvider = (process.env.EXCHANGE_WALLET_PROVIDER || process.env.DYDX_WALLET_PROVIDER || "").trim();

  return {
    providerId: provider.id,
    providerLabel: provider.label,
    walletProvider,
    walletConfigured: Boolean(walletProvider),
    apiKeyConfigured: Boolean(process.env.EXCHANGE_API_KEY || process.env.BINANCE_API_KEY),
    secretConfigured: Boolean(process.env.EXCHANGE_SECRET_KEY || process.env.EXCHANGE_API_SECRET || process.env.BINANCE_API_SECRET),
    passphraseConfigured: Boolean(process.env.EXCHANGE_PASSPHRASE || process.env.EXCHANGE_API_PASSPHRASE),
    tradingEnabled: process.env.LIVE_TRADING_ENABLED === "true",
    withdrawalsEnabled: process.env.WITHDRAWALS_ENABLED === "true" || process.env.EXCHANGE_WITHDRAWALS_ENABLED === "true",
  };
}

export async function connectExchangeEnv(update: ExchangeEnvUpdate) {
  const providerId = update.providerId ?? readProviderId(process.env.EXCHANGE_PROVIDER) ?? "dydx";
  const values: Record<string, string | null> = {
    NEXT_PUBLIC_DEFAULT_TRADING_MODE: "paper",
    EXCHANGE_PROVIDER: providerId,
    MARKET_DATA_PROVIDER: providerId,
    MARKET_INSTRUMENT_TYPE: providerId === "dydx" ? "perp" : "spot",
    EXCHANGE_WALLET_PROVIDER: update.walletProvider?.trim() || null,
    LIVE_TRADING_ENABLED: update.liveTradingEnabled ? "true" : "false",
    WITHDRAWALS_ENABLED: update.withdrawalsEnabled ? "true" : "false",
  };

  if (typeof update.apiKey === "string" && update.apiKey.trim()) values.EXCHANGE_API_KEY = update.apiKey.trim();
  if (typeof update.secretKey === "string" && update.secretKey.trim()) values.EXCHANGE_SECRET_KEY = update.secretKey.trim();
  if (typeof update.passphrase === "string" && update.passphrase.trim()) values.EXCHANGE_PASSPHRASE = update.passphrase.trim();

  await updateLocalEnv(values);
  applyRuntimeEnv(values);
  return readExchangeEnvConfig();
}

export async function disconnectExchangeEnv() {
  const values: Record<string, string | null> = {
    EXCHANGE_API_KEY: null,
    EXCHANGE_SECRET_KEY: null,
    EXCHANGE_PASSPHRASE: null,
    EXCHANGE_WALLET_PROVIDER: null,
    LIVE_TRADING_ENABLED: "false",
    WITHDRAWALS_ENABLED: "false",
  };

  await updateLocalEnv(values);
  applyRuntimeEnv(values);
  return readExchangeEnvConfig();
}

export async function setLiveTradingEnv(enabled: boolean) {
  const values: Record<string, string | null> = {
    LIVE_TRADING_ENABLED: enabled ? "true" : "false",
    NEXT_PUBLIC_DEFAULT_TRADING_MODE: enabled ? "live" : "paper",
    WITHDRAWALS_ENABLED: "false",
  };

  await updateLocalEnv(values);
  applyRuntimeEnv(values);
  return readExchangeEnvConfig();
}
