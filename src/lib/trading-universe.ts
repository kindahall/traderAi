export const DYDX_TOP_CRYPTO_MARKETS = [
  "BTC-USD",
  "ETH-USD",
  "SOL-USD",
  "XRP-USD",
  "DOGE-USD",
  "LINK-USD",
  "OP-USD",
  "PEPE-USD",
  "WIF-USD",
  "LTC-USD",
] as const;

export const DYDX_TOP_CRYPTO_SYMBOLS = DYDX_TOP_CRYPTO_MARKETS.map((symbol) => symbol.replace("-", ""));

export const DYDX_NON_CRYPTO_BASES = new Set(["XAG", "XAU", "WTI", "BRENT", "NATGAS"]);
