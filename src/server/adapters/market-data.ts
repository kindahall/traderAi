import type { MarketAsset, MarketCandle } from "@/types/trading";
import { DYDX_NON_CRYPTO_BASES, DYDX_TOP_CRYPTO_MARKETS } from "@/lib/trading-universe";
import { marketAssets as fallbackMarketAssets, priceSeries as fallbackPriceSeries } from "@/data/legacy/markets-reference";

export type MarketProviderId = "dydx" | "binance" | "kraken" | "coinbase";
export type MarketInstrumentType = "spot" | "perp";

export type PricePoint = {
  label: string;
  price: number;
  equity: number;
  benchmark: number;
  volume: number;
  pnl: number;
};

type MarketProviderConfig = {
  id: MarketProviderId;
  label: string;
  source: string;
  instrumentType: MarketInstrumentType;
  restBaseUrl: string;
};

type AssetDraft = Omit<MarketAsset, "authorized" | "correlationBtc"> & {
  baseAsset?: string;
  quoteAsset?: string;
  exchangeSymbol?: string;
  exchangeName?: string;
  exchange?: MarketProviderId;
  marketType?: MarketInstrumentType;
  status?: string;
  quoteVolumeValue?: number;
};

type BinanceTicker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  quoteVolume: string;
};

type BinanceKline = [number, string, string, string, string, string, number, string, number, string, string, string];

type DydxMarket = {
  ticker: string;
  status: string;
  oraclePrice: string;
  priceChange24H: string;
  volume24H: string;
  trades24H?: number;
};

type DydxCandle = {
  startedAt: string;
  low: string;
  high: string;
  open: string;
  close: string;
  baseTokenVolume: string;
};

type CoinbaseProduct = {
  id: string;
  base_currency: string;
  quote_currency: string;
  display_name?: string;
  status?: string;
  trading_disabled?: boolean;
};

type CoinbaseStats = {
  open: string;
  high: string;
  low: string;
  last: string;
  volume: string;
};

type KrakenAssetPair = {
  altname?: string;
  wsname?: string;
  status?: string;
};

type KrakenTicker = {
  c?: string[];
  v?: string[];
  h?: string[];
  l?: string[];
  o?: string;
};

const COMMON_ASSET_NAMES: Record<string, string> = {
  AAVE: "Aave",
  ADA: "Cardano",
  ATOM: "Cosmos",
  AVAX: "Avalanche",
  BCH: "Bitcoin Cash",
  BTC: "Bitcoin",
  CRV: "Curve",
  DOGE: "Dogecoin",
  DOT: "Polkadot",
  ETH: "Ethereum",
  FIL: "Filecoin",
  LINK: "Chainlink",
  LTC: "Litecoin",
  NEAR: "NEAR",
  OP: "Optimism",
  PEPE: "Pepe",
  SOL: "Solana",
  UNI: "Uniswap",
  WIF: "dogwifhat",
  XBT: "Bitcoin",
  XRP: "XRP",
};

const PROVIDERS: Record<MarketProviderId, Omit<MarketProviderConfig, "source">> = {
  dydx: { id: "dydx", label: "dYdX", instrumentType: "perp", restBaseUrl: "https://indexer.dydx.trade" },
  binance: { id: "binance", label: "Binance", instrumentType: "spot", restBaseUrl: "https://api.binance.com" },
  kraken: { id: "kraken", label: "Kraken", instrumentType: "spot", restBaseUrl: "https://api.kraken.com" },
  coinbase: { id: "coinbase", label: "Coinbase", instrumentType: "spot", restBaseUrl: "https://api.exchange.coinbase.com" },
};

const PROVIDER_DEFAULT_SYMBOLS: Record<MarketProviderId, string[]> = {
  dydx: [...DYDX_TOP_CRYPTO_MARKETS],
  binance: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "AVAXUSDT", "DOGEUSDT", "DOTUSDT", "LINKUSDT", "LTCUSDT"],
  kraken: ["XBTUSD", "ETHUSD", "SOLUSD", "XRPUSD", "ADAUSD", "AVAXUSD", "DOGEUSD", "DOTUSD", "LINKUSD", "LTCUSD"],
  coinbase: ["BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD", "ADA-USD", "AVAX-USD", "DOGE-USD", "LINK-USD", "LTC-USD"],
};

const DEFAULT_MARKET_FETCH_TIMEOUT_MS = 2_500;

type NextFetchInit = RequestInit & { next?: { revalidate: number } };

function refreshSecondsFromEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

function liveMarketFetchInit(providerId: MarketProviderId): NextFetchInit {
  const fallback = providerId === "dydx" ? 1 : 5;
  const revalidate = refreshSecondsFromEnv(process.env.MARKET_REVALIDATE_SECONDS, fallback);
  return revalidate === 0 ? { cache: "no-store" } : { next: { revalidate } };
}

function liveCandleFetchInit(providerId: MarketProviderId): NextFetchInit {
  const fallback = providerId === "dydx" ? 2 : 5;
  const revalidate = refreshSecondsFromEnv(process.env.MARKET_CANDLE_REVALIDATE_SECONDS, fallback);
  return revalidate === 0 ? { cache: "no-store" } : { next: { revalidate } };
}

function marketFetchTimeoutMs() {
  const configured = Number(process.env.MARKET_FETCH_TIMEOUT_MS ?? DEFAULT_MARKET_FETCH_TIMEOUT_MS);
  return Math.max(500, Math.min(15_000, Number.isFinite(configured) ? Math.round(configured) : DEFAULT_MARKET_FETCH_TIMEOUT_MS));
}

async function fetchWithTimeout(url: string, init: NextFetchInit, label: string) {
  const timeoutMs = marketFetchTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${label} timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeProvider(value?: string): MarketProviderId {
  const provider = (value || "").trim().toLowerCase();
  if (provider === "dydx" || provider === "dydx-v4") return "dydx";
  if (provider === "kraken") return "kraken";
  if (provider === "coinbase" || provider === "coinbase-exchange") return "coinbase";
  if (provider === "binance") return "binance";
  return "dydx";
}

function normalizeInstrument(value: string | undefined, fallback: MarketInstrumentType): MarketInstrumentType {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "perp" || normalized === "perpetual" || normalized === "perpetuals") return "perp";
  if (normalized === "spot") return "spot";
  return fallback;
}

export function getMarketProviderConfig(): MarketProviderConfig {
  const id = normalizeProvider(process.env.MARKET_DATA_PROVIDER || process.env.EXCHANGE_PROVIDER);
  const defaults = PROVIDERS[id];
  const restBaseUrl = (process.env.MARKET_REST_BASE_URL || defaults.restBaseUrl).replace(/\/$/, "");
  const instrumentType = normalizeInstrument(process.env.MARKET_INSTRUMENT_TYPE, defaults.instrumentType);

  return {
    ...defaults,
    instrumentType,
    restBaseUrl,
    source: `${id}-${instrumentType}-public`,
  };
}

function parseCsv(value: string | undefined) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function compactSymbol(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function getConfiguredSymbols() {
  const raw = (process.env.MARKET_SYMBOLS || "").trim();
  if (!raw || ["auto", "all", "*"].includes(raw.toLowerCase())) return null;
  return new Set(parseCsv(raw).map(compactSymbol));
}

function usesAutoDydxUniverse(providerId: MarketProviderId) {
  const raw = (process.env.MARKET_SYMBOLS || "").trim().toLowerCase();
  return providerId === "dydx" && (!raw || raw === "auto");
}

function getQuoteAssets(providerId: MarketProviderId) {
  const fallback = providerId === "dydx" ? "USD" : "USD,USDT,USDC,EUR";
  return parseCsv(process.env.MARKET_QUOTE_ASSETS || fallback).map((quote) => quote.toUpperCase());
}

function getMarketLimit(providerId: MarketProviderId) {
  const fallback = providerId === "dydx" ? 30 : 120;
  const limit = Number(process.env.MARKET_MAX_SYMBOLS || fallback);
  return Math.max(5, Math.min(1000, Number.isFinite(limit) ? limit : fallback));
}

function splitByQuote(symbol: string, quotes: string[]) {
  const compact = compactSymbol(symbol);
  const quote = quotes.toSorted((a, b) => b.length - a.length).find((item) => compact.endsWith(item));
  if (!quote) return null;
  const base = compact.slice(0, -quote.length);
  return base ? { base, quote } : null;
}

function displayPair(base: string, quote: string) {
  return `${base.toUpperCase()}/${quote.toUpperCase()}`;
}

function matchesConfiguredSymbols(configured: Set<string> | null, ...values: string[]) {
  if (!configured) return true;
  return values.some((value) => configured.has(compactSymbol(value)));
}

function getAuthorizedPairs() {
  const raw = (process.env.AUTHORIZED_PAIRS || "auto").trim();
  if (!raw || ["auto", "all", "*"].includes(raw.toLowerCase())) return null;
  return new Set(parseCsv(raw).flatMap((pair) => [pair.toUpperCase(), pair.toUpperCase().replace("-", "/"), pair.toUpperCase().replace("/", "-"), compactSymbol(pair)]));
}

function isAuthorized(pair: string, authorizedPairs: Set<string> | null) {
  if (!authorizedPairs) return true;
  const upper = pair.toUpperCase();
  return authorizedPairs.has(upper) || authorizedPairs.has(upper.replace("/", "-")) || authorizedPairs.has(compactSymbol(upper));
}

function formatUsdVolume(value: number, quote = "USD") {
  const suffix = quote === "USD" || quote === "USDT" || quote === "USDC" ? "$" : quote;
  if (!Number.isFinite(value) || value <= 0) return `0 ${suffix}`;
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B ${suffix}`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M ${suffix}`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K ${suffix}`;
  return `${value.toFixed(2)} ${suffix}`;
}

function classifySignal(change24h: number, volatility: number) {
  if (change24h > 4 && volatility > 4) return { signal: "Momentum fort", strength: "Très fort" as const };
  if (change24h > 1.5) return { signal: "Tendance positive", strength: "Fort" as const };
  if (change24h < -3) return { signal: "Pression vendeuse", strength: "Moyen" as const };
  if (volatility > 5) return { signal: "Volatilité élevée", strength: "Moyen" as const };
  return { signal: "Range / attente", strength: "Faible" as const };
}

function confidenceFromMarket(change24h: number, volatility: number, quoteVolume: number) {
  const volumeScore = Math.min(30, Math.log10(Math.max(quoteVolume, 1)) * 2.9);
  const trendScore = Math.min(28, Math.abs(change24h) * 4.4);
  const volatilityPenalty = volatility > 11 ? 18 : volatility > 7 ? 9 : 0;
  return Math.max(18, Math.min(94, Math.round(38 + volumeScore + trendScore - volatilityPenalty)));
}

function makeAsset(input: {
  symbol: string;
  name?: string;
  price: number;
  change24h: number;
  high?: number;
  low?: number;
  quoteVolume: number;
  baseAsset?: string;
  quoteAsset?: string;
  exchangeSymbol?: string;
  config: MarketProviderConfig;
  status?: string;
}): AssetDraft {
  const volatility = input.price && Number.isFinite(input.high) && Number.isFinite(input.low) ? ((Number(input.high) - Number(input.low)) / input.price) * 100 : Math.min(18, Math.max(0.25, Math.abs(input.change24h) * 1.35));
  const { signal, strength } = classifySignal(input.change24h, volatility);
  const baseName = input.baseAsset ? COMMON_ASSET_NAMES[input.baseAsset] : undefined;

  return {
    symbol: input.symbol,
    name: input.name || baseName || input.symbol,
    price: input.price,
    change24h: input.change24h,
    volume24h: formatUsdVolume(input.quoteVolume, input.quoteAsset),
    volatility,
    confidence: confidenceFromMarket(input.change24h, volatility, input.quoteVolume),
    signal,
    strength,
    baseAsset: input.baseAsset,
    quoteAsset: input.quoteAsset,
    exchangeSymbol: input.exchangeSymbol,
    exchangeName: input.config.label,
    exchange: input.config.id,
    marketType: input.config.instrumentType,
    status: input.status,
    quoteVolumeValue: input.quoteVolume,
  };
}

function finalizeAssets(assets: AssetDraft[]) {
  const authorizedPairs = getAuthorizedPairs();
  const primary = assets.find((asset) => asset.baseAsset === "BTC" || asset.baseAsset === "XBT") ?? assets[0];
  const primaryChange = Math.abs(primary?.change24h ?? 0);

  return assets
    .filter((asset) => Number.isFinite(asset.price) && asset.price > 0)
    .toSorted((a, b) => (b.quoteVolumeValue ?? 0) - (a.quoteVolumeValue ?? 0))
    .map((asset) => {
      const publicAsset = { ...asset };
      delete publicAsset.quoteVolumeValue;
      return {
        ...publicAsset,
        authorized: isAuthorized(asset.symbol, authorizedPairs),
        correlationBtc: asset.symbol === primary?.symbol ? 1 : Number((asset.change24h === 0 ? 0 : asset.change24h / Math.max(primaryChange, 1)).toFixed(2)),
      };
    });
}

function fallbackAssets(config: MarketProviderConfig): MarketAsset[] {
  return fallbackMarketAssets.map((asset) => {
    const [baseAsset = asset.baseAsset, quoteAsset = asset.quoteAsset || "USDT"] = asset.symbol.split("/");

    return {
      ...asset,
      exchange: asset.exchange ?? config.id,
      exchangeName: asset.exchangeName ?? `${config.label} (secours local)`,
      marketType: asset.marketType ?? config.instrumentType,
      exchangeSymbol: asset.exchangeSymbol ?? compactSymbol(asset.symbol),
      baseAsset: asset.baseAsset ?? baseAsset,
      quoteAsset: asset.quoteAsset ?? quoteAsset,
      status: asset.status ?? "fallback",
    };
  });
}

function fallbackSeries(): PricePoint[] {
  return fallbackPriceSeries.map((point) => ({ ...point }));
}

function intervalMs(interval: string) {
  const value = Number.parseInt(interval, 10);
  const amount = Number.isFinite(value) && value > 0 ? value : 1;
  if (interval.endsWith("d")) return amount * 24 * 60 * 60 * 1000;
  if (interval.endsWith("h")) return amount * 60 * 60 * 1000;
  return amount * 60 * 1000;
}

function fallbackCandles(interval: string, limit: number): MarketCandle[] {
  const points = fallbackSeries().slice(-Math.max(20, Math.min(limit, fallbackPriceSeries.length)));
  const stepMs = intervalMs(interval);
  const now = Date.now();

  return points.map((point, index) => {
    const previous = points[index - 1];
    const open = previous?.price ?? point.benchmark ?? point.price;
    const close = point.price;
    const spread = Math.max(close * 0.002, Math.abs(close - open));

    return {
      time: now - (points.length - 1 - index) * stepMs,
      open,
      high: Math.max(open, close) + spread * 0.35,
      low: Math.max(0, Math.min(open, close) - spread * 0.35),
      close,
      volume: point.volume,
      closed: true,
    };
  });
}

async function mapLimit<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      results.push(await mapper(current));
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function assertOk(response: Response, label: string) {
  if (!response.ok) throw new Error(`${label} error ${response.status}`);
}

async function fetchDydxAssets(config: MarketProviderConfig) {
  const configuredSymbols = getConfiguredSymbols();
  const quotes = getQuoteAssets(config.id);
  const topCryptoOnly = usesAutoDydxUniverse(config.id);
  const response = await fetchWithTimeout(`${config.restBaseUrl}/v4/perpetualMarkets`, liveMarketFetchInit(config.id), "dYdX perpetual markets");
  assertOk(response, "dYdX perpetual markets");
  const payload = (await response.json()) as { markets?: Record<string, DydxMarket> };
  const markets = Object.values(payload.markets || {});

  return finalizeAssets(
    markets
      .filter((market) => market.status === "ACTIVE")
      .filter((market) => matchesConfiguredSymbols(configuredSymbols, market.ticker))
      .filter((market) => {
        const [base = "", quote = "USD"] = market.ticker.split("-");
        return quotes.includes(quote.toUpperCase()) && (!topCryptoOnly || !DYDX_NON_CRYPTO_BASES.has(base.toUpperCase()));
      })
      .toSorted((a, b) => Number(b.volume24H || 0) - Number(a.volume24H || 0))
      .slice(0, getMarketLimit(config.id))
      .map((market) => {
        const [base = market.ticker, quote = "USD"] = market.ticker.split("-");
        const price = Number(market.oraclePrice);
        const priceChange = Number(market.priceChange24H);
        const open = price - priceChange;
        const change24h = open ? (priceChange / open) * 100 : 0;

        return makeAsset({
          symbol: displayPair(base, quote),
          price,
          change24h,
          quoteVolume: Number(market.volume24H),
          baseAsset: base,
          quoteAsset: quote,
          exchangeSymbol: market.ticker,
          config,
          status: market.status,
        });
      }),
  );
}

async function fetchBinanceAssets(config: MarketProviderConfig) {
  const configuredSymbols = getConfiguredSymbols();
  const quotes = getQuoteAssets(config.id);
  const configuredList = configuredSymbols ? parseCsv(process.env.MARKET_SYMBOLS).map((symbol) => compactSymbol(symbol)) : [];
  const query = configuredList.length ? `?symbols=${encodeURIComponent(JSON.stringify(configuredList))}` : "";
  const response = await fetchWithTimeout(`${config.restBaseUrl}/api/v3/ticker/24hr${query}`, liveMarketFetchInit(config.id), "Binance ticker");
  assertOk(response, "Binance ticker");
  const tickers = (await response.json()) as BinanceTicker[];

  return finalizeAssets(
    tickers
      .filter((ticker) => {
        const split = splitByQuote(ticker.symbol, quotes);
        return Boolean(split) && matchesConfiguredSymbols(configuredSymbols, ticker.symbol);
      })
      .slice(0, getMarketLimit(config.id))
      .map((ticker) => {
        const split = splitByQuote(ticker.symbol, quotes) ?? { base: ticker.symbol, quote: "USDT" };
        return makeAsset({
          symbol: displayPair(split.base, split.quote),
          name: COMMON_ASSET_NAMES[split.base],
          price: Number(ticker.lastPrice),
          change24h: Number(ticker.priceChangePercent),
          high: Number(ticker.highPrice),
          low: Number(ticker.lowPrice),
          quoteVolume: Number(ticker.quoteVolume),
          baseAsset: split.base,
          quoteAsset: split.quote,
          exchangeSymbol: ticker.symbol,
          config,
          status: "online",
        });
      }),
  );
}

async function fetchCoinbaseAssets(config: MarketProviderConfig) {
  const configuredSymbols = getConfiguredSymbols();
  const quotes = getQuoteAssets(config.id);
  const productsResponse = await fetchWithTimeout(`${config.restBaseUrl}/products`, { next: { revalidate: 60 } }, "Coinbase products");
  assertOk(productsResponse, "Coinbase products");
  const products = (await productsResponse.json()) as CoinbaseProduct[];
  const selectedProducts = products
    .filter((product) => product.status === "online" && !product.trading_disabled)
    .filter((product) => quotes.includes(product.quote_currency?.toUpperCase()))
    .filter((product) => matchesConfiguredSymbols(configuredSymbols, product.id, product.display_name || ""))
    .slice(0, getMarketLimit(config.id));

  const assets = await mapLimit(selectedProducts, 12, async (product) => {
    const statsResponse = await fetchWithTimeout(`${config.restBaseUrl}/products/${encodeURIComponent(product.id)}/stats`, liveMarketFetchInit(config.id), `Coinbase ${product.id} stats`);
    assertOk(statsResponse, `Coinbase ${product.id} stats`);
    const stats = (await statsResponse.json()) as CoinbaseStats;
    const price = Number(stats.last);
    const open = Number(stats.open) || price;
    const volume = Number(stats.volume);

    return makeAsset({
      symbol: displayPair(product.base_currency, product.quote_currency),
      name: COMMON_ASSET_NAMES[product.base_currency],
      price,
      change24h: open ? ((price - open) / open) * 100 : 0,
      high: Number(stats.high),
      low: Number(stats.low),
      quoteVolume: volume * price,
      baseAsset: product.base_currency,
      quoteAsset: product.quote_currency,
      exchangeSymbol: product.id,
      config,
      status: product.status,
    });
  });

  return finalizeAssets(assets);
}

async function fetchKrakenAssets(config: MarketProviderConfig) {
  const configuredSymbols = getConfiguredSymbols();
  const quotes = getQuoteAssets(config.id);
  const [pairsResponse, tickerResponse] = await Promise.all([
    fetchWithTimeout(`${config.restBaseUrl}/0/public/AssetPairs`, { next: { revalidate: 60 } }, "Kraken asset pairs"),
    fetchWithTimeout(`${config.restBaseUrl}/0/public/Ticker`, liveMarketFetchInit(config.id), "Kraken ticker"),
  ]);
  assertOk(pairsResponse, "Kraken asset pairs");
  assertOk(tickerResponse, "Kraken ticker");
  const pairPayload = (await pairsResponse.json()) as { error?: string[]; result?: Record<string, KrakenAssetPair> };
  const tickerPayload = (await tickerResponse.json()) as { error?: string[]; result?: Record<string, KrakenTicker> };
  if (pairPayload.error?.length) throw new Error(`Kraken asset pairs error ${pairPayload.error.join(", ")}`);
  if (tickerPayload.error?.length) throw new Error(`Kraken ticker error ${tickerPayload.error.join(", ")}`);

  const assets = Object.entries(pairPayload.result || {})
    .filter(([, pair]) => pair.status === "online" && Boolean(pair.wsname))
    .filter(([, pair]) => {
      const [, quote = ""] = (pair.wsname || "").split("/");
      return quotes.includes(quote.toUpperCase()) && matchesConfiguredSymbols(configuredSymbols, pair.altname || "", pair.wsname || "");
    })
    .slice(0, getMarketLimit(config.id))
    .map(([key, pair]) => {
      const ticker = tickerPayload.result?.[key];
      const [base = pair.altname || key, quote = "USD"] = (pair.wsname || pair.altname || key).split("/");
      const price = Number(ticker?.c?.[0]);
      const open = Number(ticker?.o) || price;
      const high = Number(ticker?.h?.[1] || ticker?.h?.[0]);
      const low = Number(ticker?.l?.[1] || ticker?.l?.[0]);
      const volume = Number(ticker?.v?.[1] || ticker?.v?.[0]);

      return makeAsset({
        symbol: displayPair(base, quote),
        name: COMMON_ASSET_NAMES[base],
        price,
        change24h: open ? ((price - open) / open) * 100 : 0,
        high,
        low,
        quoteVolume: volume * price,
        baseAsset: base,
        quoteAsset: quote,
        exchangeSymbol: pair.altname || key,
        config,
        status: pair.status,
      });
    });

  return finalizeAssets(assets);
}

export async function fetchMarketAssets(): Promise<MarketAsset[]> {
  const config = getMarketProviderConfig();
  try {
    if (config.id === "dydx") return fetchDydxAssets(config);
    if (config.id === "coinbase") return fetchCoinbaseAssets(config);
    if (config.id === "kraken") return fetchKrakenAssets(config);
    return fetchBinanceAssets(config);
  } catch {
    return fallbackAssets(config);
  }
}

function defaultPrimarySymbol(config: MarketProviderConfig) {
  return process.env.PRIMARY_MARKET_SYMBOL || PROVIDER_DEFAULT_SYMBOLS[config.id][0] || "BTC-USD";
}

function toDydxSymbol(symbol: string) {
  const upper = symbol.toUpperCase();
  if (upper.includes("-") || upper.includes("/")) {
    const [base = "BTC", rawQuote = "USD"] = upper.replace("/", "-").split("-");
    const quote = rawQuote === "USDT" || rawQuote === "USDC" ? "USD" : rawQuote;
    return `${base}-${quote}`;
  }
  const split = splitByQuote(upper, ["USD", "USDC", "USDT"]);
  if (!split) return "BTC-USD";
  const quote = split.quote === "USDT" || split.quote === "USDC" ? "USD" : split.quote;
  return `${split.base}-${quote}`;
}

function toCoinbaseSymbol(symbol: string) {
  const upper = symbol.toUpperCase();
  if (upper.includes("-")) return upper.replace("/", "-");
  if (upper.includes("/")) return upper.replace("/", "-");
  const split = splitByQuote(upper, ["USD", "USDT", "USDC", "EUR"]);
  return split ? `${split.base}-${split.quote}` : "BTC-USD";
}

function toBinanceSymbol(symbol: string) {
  const compact = compactSymbol(symbol);
  if (compact.endsWith("USD") && !compact.endsWith("USDT") && !compact.endsWith("USDC")) return `${compact}T`;
  return compact || "BTCUSDT";
}

function toKrakenSymbol(symbol: string) {
  const compact = compactSymbol(symbol).replace(/^BTC/, "XBT");
  return compact || "XBTUSD";
}

function dydxResolution(interval: string) {
  const map: Record<string, string> = {
    "1m": "1MIN",
    "3m": "1MIN",
    "5m": "5MINS",
    "15m": "15MINS",
    "30m": "30MINS",
    "1h": "1HOUR",
    "2h": "1HOUR",
    "4h": "4HOURS",
    "6h": "4HOURS",
    "8h": "4HOURS",
    "12h": "4HOURS",
    "1d": "1DAY",
  };
  return map[interval] || "1MIN";
}

function coinbaseGranularity(interval: string) {
  const map: Record<string, number> = {
    "1m": 60,
    "3m": 60,
    "5m": 300,
    "15m": 900,
    "30m": 900,
    "1h": 3600,
    "2h": 3600,
    "4h": 3600,
    "6h": 21600,
    "8h": 21600,
    "12h": 21600,
    "1d": 86400,
  };
  return map[interval] || 60;
}

function krakenInterval(interval: string) {
  const map: Record<string, number> = {
    "1m": 1,
    "3m": 1,
    "5m": 5,
    "15m": 15,
    "30m": 30,
    "1h": 60,
    "2h": 60,
    "4h": 240,
    "6h": 240,
    "8h": 240,
    "12h": 240,
    "1d": 1440,
  };
  return map[interval] || 1;
}

function normalizeInterval(interval: string) {
  return interval.replace(/[^0-9a-zA-Z]/g, "") || "1m";
}

async function fetchDydxCandles(config: MarketProviderConfig, symbol: string, interval: string, limit: number) {
  const ticker = toDydxSymbol(symbol);
  const response = await fetchWithTimeout(`${config.restBaseUrl}/v4/candles/perpetualMarkets/${encodeURIComponent(ticker)}?resolution=${encodeURIComponent(dydxResolution(interval))}&limit=${limit}`, liveCandleFetchInit(config.id), "dYdX candles");
  assertOk(response, "dYdX candles");
  const payload = (await response.json()) as { candles?: DydxCandle[] };

  return (payload.candles || [])
    .map((candle) => ({
      time: new Date(candle.startedAt).getTime(),
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
      volume: Number(candle.baseTokenVolume),
      closed: true,
    }))
    .toSorted((a, b) => a.time - b.time);
}

async function fetchBinanceCandles(config: MarketProviderConfig, symbol: string, interval: string, limit: number) {
  const ticker = toBinanceSymbol(symbol);
  const response = await fetchWithTimeout(`${config.restBaseUrl}/api/v3/klines?symbol=${encodeURIComponent(ticker)}&interval=${encodeURIComponent(normalizeInterval(interval))}&limit=${limit}`, liveCandleFetchInit(config.id), "Binance candles");
  assertOk(response, "Binance candles");
  const klines = (await response.json()) as BinanceKline[];

  return klines.map((kline) => ({
    time: Number(kline[0]),
    open: Number(kline[1]),
    high: Number(kline[2]),
    low: Number(kline[3]),
    close: Number(kline[4]),
    volume: Number(kline[5]),
    closed: true,
  }));
}

async function fetchCoinbaseCandles(config: MarketProviderConfig, symbol: string, interval: string, limit: number) {
  const productId = toCoinbaseSymbol(symbol);
  const granularity = coinbaseGranularity(interval);
  const response = await fetchWithTimeout(`${config.restBaseUrl}/products/${encodeURIComponent(productId)}/candles?granularity=${granularity}`, liveCandleFetchInit(config.id), "Coinbase candles");
  assertOk(response, "Coinbase candles");
  const rows = (await response.json()) as Array<[number, number, number, number, number, number]>;

  return rows
    .map((row) => ({
      time: Number(row[0]) * 1000,
      low: Number(row[1]),
      high: Number(row[2]),
      open: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      closed: true,
    }))
    .toSorted((a, b) => a.time - b.time)
    .slice(-limit);
}

async function fetchKrakenCandles(config: MarketProviderConfig, symbol: string, interval: string, limit: number) {
  const pair = toKrakenSymbol(symbol);
  const response = await fetchWithTimeout(`${config.restBaseUrl}/0/public/OHLC?pair=${encodeURIComponent(pair)}&interval=${krakenInterval(interval)}`, liveCandleFetchInit(config.id), "Kraken OHLC");
  assertOk(response, "Kraken OHLC");
  const payload = (await response.json()) as { error?: string[]; result?: Record<string, Array<[number, string, string, string, string, string, string, number]> | number> };
  if (payload.error?.length) throw new Error(`Kraken OHLC error ${payload.error.join(", ")}`);
  const rowEntry = Object.entries(payload.result || {}).find(([key, value]) => key !== "last" && Array.isArray(value));
  const rows = (rowEntry?.[1] || []) as Array<[number, string, string, string, string, string, string, number]>;

  return rows
    .slice(-limit)
    .map((row) => ({
      time: Number(row[0]) * 1000,
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[6]),
      closed: true,
    }))
    .toSorted((a, b) => a.time - b.time);
}

export async function fetchCandles(symbol?: string, interval = "1m", limit = 180): Promise<MarketCandle[]> {
  const config = getMarketProviderConfig();
  const safeSymbol = symbol || defaultPrimarySymbol(config);
  const safeInterval = normalizeInterval(interval);
  const safeLimit = Math.min(config.id === "coinbase" ? 300 : 1000, Math.max(20, limit));

  try {
    if (config.id === "dydx") return fetchDydxCandles(config, safeSymbol, safeInterval, safeLimit);
    if (config.id === "coinbase") return fetchCoinbaseCandles(config, safeSymbol, safeInterval, safeLimit);
    if (config.id === "kraken") return fetchKrakenCandles(config, safeSymbol, safeInterval, safeLimit);
    return fetchBinanceCandles(config, safeSymbol, safeInterval, safeLimit);
  } catch {
    return fallbackCandles(safeInterval, safeLimit);
  }
}

export async function fetchPriceSeries(symbol?: string): Promise<PricePoint[]> {
  const config = getMarketProviderConfig();
  const candles = await fetchCandles(symbol || defaultPrimarySymbol(config), "1h", 48);
  if (!candles.length) return fallbackSeries();
  const firstClose = Number(candles[0]?.close || 1);

  return candles.map((candle, index) => {
    const date = new Date(candle.time);
    const indexed = firstClose ? (candle.close / firstClose) * 10_000 : 10_000;

    return {
      label: index % 8 === 0 ? `${date.getHours().toString().padStart(2, "0")}h` : "",
      price: candle.close,
      equity: Number(indexed.toFixed(2)),
      benchmark: Number((((candle.open || candle.close) / firstClose) * 10_000).toFixed(2)),
      volume: Number(candle.volume.toFixed(2)),
      pnl: Number((((candle.close - candle.open) / Math.max(candle.open, 1)) * 100).toFixed(2)),
    };
  });
}
