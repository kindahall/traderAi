import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type StrategyDiscoverySource = "tradingview" | "user-url" | "pine-import" | "image-import" | "manual";
export type StrategyDiscoveryVisibility = "open-source" | "public-idea" | "unknown" | "protected" | "invite-only";
export type StrategyDiscoveryStage = "source_watch" | "codex_review" | "backtest_queue" | "paper_incubation" | "live_candidate" | "blocked";
export type StrategyDiscoveryRisk = "Faible" | "Modéré" | "Élevé";

export type StrategyDiscoveryPineSummary = {
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

export type StrategyDiscoveryCandidate = {
  id: string;
  title: string;
  source: StrategyDiscoverySource;
  sourceUrl?: string;
  pineCode?: string;
  pineSummary?: StrategyDiscoveryPineSummary;
  visibility: StrategyDiscoveryVisibility;
  stage: StrategyDiscoveryStage;
  score: number;
  risk: StrategyDiscoveryRisk;
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
    closedTrades: number;
    openTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    pnlUsd: number;
  };
};

export type StrategyDiscoveryState = {
  version: 1;
  enabled: boolean;
  cadence: "daily";
  maxCandidatesPerDay: number;
  lastScanAt?: string;
  nextScanAt?: string;
  updatedAt: string;
  sources: Array<{
    id: StrategyDiscoverySource;
    label: string;
    enabled: boolean;
    policy: string;
  }>;
  candidates: StrategyDiscoveryCandidate[];
};

export type StrategyDiscoveryCandidateInput = {
  title?: string;
  sourceUrl?: string;
  visibility?: StrategyDiscoveryVisibility;
  timeframe?: string;
  assets?: string[];
  tags?: string[];
  notes?: string;
  pineCode?: string;
};

export type StrategyDiscoveryPaperMetricInput = {
  id: string;
  status: StrategyDiscoveryCandidate["paper"]["status"];
  trades: number;
  closedTrades: number;
  openTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  pnlUsd: number;
};

const RUNTIME_DIR = path.join(process.cwd(), ".agent-trader-runtime");
const DISCOVERY_FILE = path.join(RUNTIME_DIR, "strategy-discovery.json");
const MAX_CANDIDATES = 80;
const SCAN_TIMEOUT_MS = Number(process.env.STRATEGY_DISCOVERY_SCAN_TIMEOUT_MS || 8_000);
const SCAN_MAX_BYTES = Number(process.env.STRATEGY_DISCOVERY_SCAN_MAX_BYTES || 600_000);
const TRADINGVIEW_OPEN_STRATEGY_FEEDS = [
  "https://www.tradingview.com/scripts/crypto/?script_access=open&script_type=strategies",
  "https://www.tradingview.com/scripts/bitcoin/?script_access=open&script_type=strategies",
  "https://www.tradingview.com/scripts/ethereum/?script_access=open&script_type=strategies",
  "https://www.tradingview.com/scripts/trending/?script_access=open&script_type=strategies",
  "https://www.tradingview.com/scripts/?script_access=open&script_type=strategies",
];
const DEFAULT_CRYPTO_STRATEGY_ASSETS = ["BTC/USD", "ETH/USD", "SOL/USD"];
const CRYPTO_ASSET_HINTS: Array<[RegExp, string]> = [
  [/\b(btc|bitcoin)\b/i, "BTC/USD"],
  [/\b(eth|ethereum)\b/i, "ETH/USD"],
  [/\b(sol|solana)\b/i, "SOL/USD"],
  [/\b(xrp|ripple)\b/i, "XRP/USD"],
  [/\b(doge|dogecoin)\b/i, "DOGE/USD"],
  [/\b(pepe)\b/i, "PEPE/USD"],
  [/\b(wif|dogwifhat)\b/i, "WIF/USD"],
  [/\b(link|chainlink)\b/i, "LINK/USD"],
  [/\b(ltc|litecoin)\b/i, "LTC/USD"],
  [/\b(op|optimism)\b/i, "OP/USD"],
  [/\b(ada|cardano)\b/i, "ADA/USD"],
  [/\b(avax|avalanche)\b/i, "AVAX/USD"],
];

function nowIso() {
  return new Date().toISOString();
}

function nextDailyScan(from = new Date()) {
  const next = new Date(from);
  next.setDate(next.getDate() + 1);
  next.setHours(8, 0, 0, 0);
  return next.toISOString();
}

function defaultState(): StrategyDiscoveryState {
  const now = new Date();
  return {
    version: 1,
    enabled: true,
    cadence: "daily",
    maxCandidatesPerDay: 3,
    lastScanAt: undefined,
    nextScanAt: nextDailyScan(now),
    updatedAt: now.toISOString(),
    sources: [
      {
        id: "tradingview",
        label: "TradingView public/open-source",
        enabled: true,
        policy: "Analyser les publications publiques; copier seulement le code open-source avec attribution/licence.",
      },
      {
        id: "pine-import",
        label: "Pine Script importé",
        enabled: true,
        policy: "Convertir en brouillon, puis backtest déterministe avec frais et slippage.",
      },
      {
        id: "image-import",
        label: "Capture de stratégie",
        enabled: true,
        policy: "Extraire des hypothèses testables; aucune exécution sans règles formalisées.",
      },
    ],
    candidates: [],
  };
}

function isVisibility(value: unknown): value is StrategyDiscoveryVisibility {
  return value === "open-source" || value === "public-idea" || value === "unknown" || value === "protected" || value === "invite-only";
}

function isStage(value: unknown): value is StrategyDiscoveryStage {
  return value === "source_watch" || value === "codex_review" || value === "backtest_queue" || value === "paper_incubation" || value === "live_candidate" || value === "blocked";
}

function stringList(value: unknown, fallback: string[] = []) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, 12) : fallback;
}

function numberValue(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  const safe = Number.isFinite(numeric) ? numeric : fallback;
  return Number(Math.min(max, Math.max(min, safe)).toFixed(2));
}

function safeText(value: unknown, fallback: string, maxLength = 240) {
  return typeof value === "string" && value.trim() ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : fallback;
}

function safeCode(value: unknown, maxLength = 80_000) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : "";
}

function safeUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function sourceFromUrl(url?: string): StrategyDiscoverySource {
  if (!url) return "manual";
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.includes("tradingview.com") ? "tradingview" : "user-url";
  } catch {
    return "user-url";
  }
}

function titleFromUrl(url?: string) {
  if (!url) return "Stratégie découverte";
  try {
    const parsed = new URL(url);
    const chunks = parsed.pathname.split("/").filter(Boolean);
    const last = chunks.at(-1) || chunks.at(-2);
    if (!last) return "Stratégie découverte";
    return decodeURIComponent(last).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Stratégie découverte";
  } catch {
    return "Stratégie découverte";
  }
}

function cryptoAssetsFromText(...values: Array<string | undefined>) {
  const text = values.filter(Boolean).join(" ");
  const assets = CRYPTO_ASSET_HINTS.flatMap(([pattern, asset]) => pattern.test(text) ? [asset] : []);
  return uniqueList(assets.length ? assets : DEFAULT_CRYPTO_STRATEGY_ASSETS).slice(0, 4);
}

function titleFromPineCode(code: string) {
  return code.match(/\bstrategy\s*\(\s*["']([^"']+)/i)?.[1]?.trim()
    || code.match(/\bindicator\s*\(\s*["']([^"']+)/i)?.[1]?.trim()
    || "Stratégie Pine importée";
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

function defaultLicenseNotes(source: StrategyDiscoverySource, visibility: StrategyDiscoveryVisibility) {
  if (source === "pine-import") {
    return "Import Pine fourni par l'utilisateur: usage local autorisé dans l'app, droits à vérifier avant toute republication.";
  }
  if (source === "tradingview" && visibility === "open-source") {
    return "Source TradingView open-source: conserver attribution, licence et règles de réutilisation.";
  }
  if (source === "tradingview" && visibility === "public-idea") {
    return "Idée publique: analyser le concept, sans recopier un code non visible.";
  }
  if (visibility === "protected" || visibility === "invite-only") {
    return "Code fermé: analyse d'usage seulement, aucune copie ni contournement.";
  }
  return "Visibilité à confirmer avant réutilisation.";
}

function blockersFor(visibility: StrategyDiscoveryVisibility) {
  if (visibility === "protected") return ["Source protégée: code non réutilisable."];
  if (visibility === "invite-only") return ["Invite-only: accès et code fermés."];
  if (visibility === "unknown") return ["Visibilité non confirmée."];
  return [];
}

function uniqueList(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value: string) {
  return stripHtml(value);
}

function extractTag(html: string, pattern: RegExp) {
  const match = html.match(pattern)?.[1];
  return match ? stripHtml(match).slice(0, 220) : "";
}

function extractMeta(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patternA = new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i");
  const patternB = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`, "i");
  return extractTag(html, patternA) || extractTag(html, patternB);
}

function detectedVisibility(html: string): StrategyDiscoveryVisibility {
  const text = stripHtml(html).toLowerCase();
  if (text.includes("invite-only") || text.includes("invite only") || text.includes("sur invitation")) return "invite-only";
  if (text.includes("protected source") || text.includes("protected script") || text.includes("source protég")) return "protected";
  if (text.includes("open-source") || text.includes("open source") || text.includes("code source ouvert")) return "open-source";
  return "public-idea";
}

function candidateScoreFromScan(visibility: StrategyDiscoveryVisibility, description: string) {
  const hasRules = /\b(entry|entries|exit|stop|take profit|risk|strategy|backtest|signal|rsi|ema|atr|breakout|support|resistance)\b/i.test(description);
  const base = visibility === "open-source" ? 36 : visibility === "public-idea" ? 22 : 5;
  return Math.min(65, base + (hasRules ? 12 : 0));
}

function countMatches(value: string, pattern: RegExp) {
  return value.match(pattern)?.length ?? 0;
}

function numberFromMatch(value: string, pattern: RegExp, fallback: number) {
  const match = value.match(pattern)?.[1];
  const numeric = Number(match);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function analyzePineCode(code: string): StrategyDiscoveryPineSummary {
  const normalized = code.trim();
  const entries = countMatches(normalized, /\bstrategy\.entry\s*\(/gi);
  const exits = countMatches(normalized, /\bstrategy\.exit\s*\(/gi);
  const closes = countMatches(normalized, /\bstrategy\.close\s*\(/gi);
  const warnings: string[] = [];
  const pyramiding = numberFromMatch(normalized, /\bpyramiding\s*=\s*(\d+)/i, 0);
  const defaultQtyPercent = numberFromMatch(normalized, /\bdefault_qty_value\s*=\s*([\d.]+)/i, 0);
  const hasStopLoss = /\bstop\s*=|\bstopLoss|Stop Loss/i.test(normalized);
  const hasTrailingStop = /Trailing Stop|atrStop|trail/i.test(normalized);
  const hasMultiTakeProfit = /TP1|TP2|TP3|qty_percent/i.test(normalized) && exits >= 3;
  const hasRunUpProtection = /Run-Up Protect|runUpProtect|highestPriceSinceEntry|lowestPriceSinceEntry/i.test(normalized);
  const canLong = /strategy\.long|allowLong|Long/i.test(normalized);
  const canShort = /strategy\.short|allowShort|Short/i.test(normalized);

  if (pyramiding > 1) warnings.push(`Pyramiding ${pyramiding}: exposition cumulable à plafonner avant paper.`);
  if (defaultQtyPercent >= 10) warnings.push(`Sizing ${defaultQtyPercent}% equity: trop agressif sans limite de portefeuille.`);
  if (!hasStopLoss) warnings.push("Stop-loss non confirmé.");
  if (!hasMultiTakeProfit) warnings.push("Take-profit partiel non confirmé.");
  if (/longEntryPrice\s*:=\s*na/i.test(normalized) && !/strategy\.position_size\s*==\s*0[\s\S]{0,240}longEntryPrice\s*:=\s*na/i.test(normalized)) {
    warnings.push("longEntryPrice peut rester ancien après TP/SL: reset flat à vérifier.");
  }
  if (/shortEntryPrice\s*:=\s*na/i.test(normalized) && !/strategy\.position_size\s*==\s*0[\s\S]{0,240}shortEntryPrice\s*:=\s*na/i.test(normalized)) {
    warnings.push("shortEntryPrice peut rester ancien après TP/SL: reset flat à vérifier.");
  }
  if (/ta\.pivot(?:low|high)/i.test(normalized)) warnings.push("Pivots confirmés avec délai rightBars: vérifier latence et absence de biais visuel.");

  return {
    version: normalized.match(/\/\/@version\s*=\s*(\d+)/i)?.[1] ?? "non détectée",
    entries,
    exits,
    closes,
    hasStopLoss,
    hasTrailingStop,
    hasMultiTakeProfit,
    hasRunUpProtection,
    canLong,
    canShort,
    pyramiding,
    defaultQtyPercent,
    warnings,
  };
}

function scoreFromPineSummary(summary: StrategyDiscoveryPineSummary) {
  const score =
    18 +
    Math.min(20, summary.entries * 5) +
    Math.min(24, summary.exits * 3) +
    (summary.hasStopLoss ? 10 : 0) +
    (summary.hasTrailingStop ? 8 : 0) +
    (summary.hasMultiTakeProfit ? 8 : 0) +
    (summary.hasRunUpProtection ? 6 : 0) -
    (summary.pyramiding > 1 ? 8 : 0) -
    (summary.defaultQtyPercent >= 10 ? 6 : 0);

  return Math.max(0, Math.min(86, score));
}

function notesFromPineSummary(summary: StrategyDiscoveryPineSummary) {
  return [
    `Pine v${summary.version}: ${summary.entries} entrée(s), ${summary.exits} sortie(s), ${summary.closes} fermeture(s).`,
    summary.canLong && summary.canShort ? "Long/Short détectés." : summary.canLong ? "Long uniquement détecté." : summary.canShort ? "Short uniquement détecté." : "Direction non claire.",
    summary.hasMultiTakeProfit ? "TP partiels détectés." : "TP partiels à confirmer.",
    summary.hasStopLoss ? "Stop-loss détecté." : "Stop-loss manquant.",
    summary.hasTrailingStop ? "Trailing ATR détecté." : "Trailing non détecté.",
    summary.hasRunUpProtection ? "Run-up protect détecté." : "",
    summary.warnings.length ? `Points à corriger: ${summary.warnings.join(" ")}` : "",
  ].filter(Boolean).join(" ");
}

async function fetchSourceHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "TraderAI strategy-discovery/1.0 (+local controlled public-source scanner)",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(SCAN_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const text = await response.text();
  return text.slice(0, SCAN_MAX_BYTES);
}

function tradingViewScriptUrl(value: string) {
  const raw = value.trim();
  const absolute = raw.startsWith("/script/") ? `https://www.tradingview.com${raw}` : raw;
  const url = safeUrl(absolute);
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.toLowerCase().endsWith("tradingview.com")) return undefined;
    if (!parsed.pathname.startsWith("/script/")) return undefined;
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function extractTradingViewScriptLinks(html: string) {
  const matches = [...html.matchAll(/<a\b[^>]*href=["']([^"']*\/script\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const byUrl = new Map<string, string>();

  for (const match of matches) {
    const url = tradingViewScriptUrl(match[1]);
    if (!url) continue;
    byUrl.set(url, decodeHtml(match[2] || titleFromUrl(url)));
  }

  return [...byUrl.entries()].map(([url, title]) => ({ url, title }));
}

async function discoverTradingViewOpenStrategyCandidates(limit: number, excludedUrls = new Set<string>()) {
  const discovered = new Map<string, string>();

  for (const feedUrl of TRADINGVIEW_OPEN_STRATEGY_FEEDS) {
    if (discovered.size >= limit) break;
    try {
      const html = await fetchSourceHtml(feedUrl);
      for (const item of extractTradingViewScriptLinks(html)) {
        if (discovered.size >= limit) break;
        if (excludedUrls.has(item.url) || discovered.has(item.url)) continue;
        discovered.set(item.url, item.title);
      }
    } catch {
      // Feed failures should not prevent scanning manually added sources.
    }
  }

  return [...discovered.entries()].map(([url, title]) => ({ url, title }));
}

function scannedCandidate(candidate: StrategyDiscoveryCandidate, html: string): StrategyDiscoveryCandidate {
  const title = extractMeta(html, "og:title") || extractTag(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || candidate.title;
  const description = extractMeta(html, "description") || extractMeta(html, "og:description") || candidate.notes;
  const visibility = detectedVisibility(html);
  const blockers = uniqueList([...candidate.blockers.filter((blocker) => !blocker.startsWith("Scan indisponible")), ...blockersFor(visibility)]);
  const blocked = visibility === "protected" || visibility === "invite-only";
  const nextAction = blocked
    ? "Source fermée: garder comme inspiration visuelle, ne pas copier le code."
    : visibility === "open-source"
      ? "Audit Codex puis conversion en règles backtestables."
      : "Formaliser les règles avant tout backtest.";
  const titleClean = safeText(title.replace(/\s+—\s+TradingView.*$/i, "").replace(/\s+-\s+TradingView.*$/i, ""), candidate.title, 120);

  return {
    ...candidate,
    title: titleClean,
    visibility,
    stage: blocked ? "blocked" : candidate.stage === "blocked" ? "source_watch" : candidate.stage,
    score: Math.max(candidate.score, candidateScoreFromScan(visibility, description)),
    notes: safeText(description, candidate.notes, 600),
    assets: cryptoAssetsFromText(titleClean, description, candidate.sourceUrl),
    tags: uniqueList([...candidate.tags, "crypto"]).slice(0, 12),
    blockers,
    licenseNotes: defaultLicenseNotes(candidate.source, visibility),
    nextAction,
    updatedAt: nowIso(),
  };
}

function normalizeRisk(value: unknown): StrategyDiscoveryRisk {
  return value === "Faible" || value === "Élevé" ? value : "Modéré";
}

function normalizePineSummary(value: unknown, pineCode: string) {
  if (pineCode) return analyzePineCode(pineCode);
  if (!value || typeof value !== "object") return undefined;
  const input = value as Partial<StrategyDiscoveryPineSummary>;
  return {
    version: safeText(input.version, "non détectée", 24),
    entries: numberValue(input.entries, 0, 0, 200),
    exits: numberValue(input.exits, 0, 0, 400),
    closes: numberValue(input.closes, 0, 0, 200),
    hasStopLoss: input.hasStopLoss === true,
    hasTrailingStop: input.hasTrailingStop === true,
    hasMultiTakeProfit: input.hasMultiTakeProfit === true,
    hasRunUpProtection: input.hasRunUpProtection === true,
    canLong: input.canLong === true,
    canShort: input.canShort === true,
    pyramiding: numberValue(input.pyramiding, 0, 0, 100),
    defaultQtyPercent: numberValue(input.defaultQtyPercent, 0, 0, 100),
    warnings: stringList(input.warnings),
  };
}

function normalizeCandidate(value: unknown): StrategyDiscoveryCandidate | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<StrategyDiscoveryCandidate>;
  if (typeof input.id !== "string" || typeof input.title !== "string") return null;
  const source = input.source === "tradingview" || input.source === "user-url" || input.source === "pine-import" || input.source === "image-import" || input.source === "manual" ? input.source : sourceFromUrl(input.sourceUrl);
  const visibility = isVisibility(input.visibility) ? input.visibility : "unknown";
  const blockers = stringList(input.blockers, blockersFor(visibility));
  const pineCode = safeCode(input.pineCode);
  const pineSummary = normalizePineSummary(input.pineSummary, pineCode);

  return {
    id: input.id,
    title: safeText(input.title, "Stratégie découverte", 120),
    source,
    sourceUrl: safeUrl(input.sourceUrl),
    pineCode: pineCode || undefined,
    pineSummary,
    visibility,
    stage: isStage(input.stage) ? input.stage : blockers.length ? "blocked" : "source_watch",
    score: numberValue(input.score, 0, 0, 100),
    risk: normalizeRisk(input.risk),
    timeframe: safeText(input.timeframe, "15m", 24),
    assets: stringList(input.assets, ["BTC/USD"]),
    tags: stringList(input.tags),
    notes: safeText(input.notes, "", 600),
    blockers,
    licenseNotes: safeText(input.licenseNotes, defaultLicenseNotes(source, visibility), 400),
    nextAction: safeText(input.nextAction, blockers.length ? "Clarifier les droits avant analyse." : "Audit Codex puis backtest déterministe.", 240),
    discoveredAt: typeof input.discoveredAt === "string" ? input.discoveredAt : nowIso(),
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : nowIso(),
    lastReviewAt: typeof input.lastReviewAt === "string" ? input.lastReviewAt : undefined,
    paper: {
      status: input.paper?.status === "queued" || input.paper?.status === "watching" || input.paper?.status === "running" || input.paper?.status === "passed" || input.paper?.status === "failed" ? input.paper.status : "not_started",
      trades: numberValue(input.paper?.trades, 0, 0, 1_000),
      closedTrades: numberValue(input.paper?.closedTrades, 0, 0, 1_000),
      openTrades: numberValue(input.paper?.openTrades, 0, 0, 1_000),
      winningTrades: numberValue(input.paper?.winningTrades, 0, 0, 1_000),
      losingTrades: numberValue(input.paper?.losingTrades, 0, 0, 1_000),
      winRate: numberValue(input.paper?.winRate, 0, 0, 100),
      pnlUsd: numberValue(input.paper?.pnlUsd, 0, -1_000_000, 1_000_000),
    },
  };
}

function normalizeState(value: unknown): StrategyDiscoveryState {
  const fallback = defaultState();
  if (!value || typeof value !== "object") return fallback;
  const input = value as Partial<StrategyDiscoveryState>;
  return {
    ...fallback,
    enabled: input.enabled !== false,
    maxCandidatesPerDay: numberValue(input.maxCandidatesPerDay, fallback.maxCandidatesPerDay, 1, 20),
    lastScanAt: typeof input.lastScanAt === "string" ? input.lastScanAt : undefined,
    nextScanAt: typeof input.nextScanAt === "string" ? input.nextScanAt : fallback.nextScanAt,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : fallback.updatedAt,
    candidates: Array.isArray(input.candidates) ? input.candidates.flatMap((item) => normalizeCandidate(item) ?? []).slice(0, MAX_CANDIDATES) : [],
  };
}

async function ensureRuntimeDir() {
  await mkdir(RUNTIME_DIR, { recursive: true });
}

async function writeState(state: StrategyDiscoveryState) {
  const next = normalizeState({ ...state, updatedAt: nowIso() });
  await ensureRuntimeDir();
  await writeFile(DISCOVERY_FILE, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export async function readStrategyDiscoveryState(): Promise<StrategyDiscoveryState> {
  try {
    const raw = await readFile(DISCOVERY_FILE, "utf8");
    return normalizeState(JSON.parse(raw) as unknown);
  } catch {
    return defaultState();
  }
}

export async function addStrategyDiscoveryCandidate(input: StrategyDiscoveryCandidateInput) {
  const current = await readStrategyDiscoveryState();
  const sourceUrl = safeUrl(input.sourceUrl);
  const pineCode = safeCode(input.pineCode);
  const pineSummary = pineCode ? analyzePineCode(pineCode) : undefined;
  const source: StrategyDiscoverySource = pineCode ? "pine-import" : sourceFromUrl(sourceUrl);
  const visibility = pineCode ? "public-idea" : isVisibility(input.visibility) ? input.visibility : "unknown";
  const blockers = pineCode ? pineSummary?.warnings ?? [] : blockersFor(visibility);
  const title = safeText(input.title, pineCode ? titleFromPineCode(pineCode) : titleFromUrl(sourceUrl), 120);
  const now = nowIso();
  const candidate: StrategyDiscoveryCandidate = {
    id: `${slug(title)}-${Date.now().toString(36)}`,
    title,
    source,
    sourceUrl,
    pineCode: pineCode || undefined,
    pineSummary,
    visibility,
    stage: pineCode ? "codex_review" : blockers.length ? "blocked" : "source_watch",
    score: pineSummary ? scoreFromPineSummary(pineSummary) : 0,
    risk: pineSummary && (pineSummary.pyramiding > 1 || pineSummary.canShort) ? "Élevé" : "Modéré",
    timeframe: safeText(input.timeframe, "15m", 24),
    assets: stringList(input.assets, ["BTC/USD"]),
    tags: stringList(input.tags, pineCode ? ["Pine Script", "import", "Codex"] : source === "tradingview" ? ["TradingView"] : []),
    notes: safeText(input.notes, pineSummary ? notesFromPineSummary(pineSummary) : "", 900),
    blockers,
    licenseNotes: defaultLicenseNotes(source, visibility),
    nextAction: pineCode
      ? "Corriger les points de robustesse, puis backtest déterministe avec frais/slippage avant paper."
      : blockers.length ? "Clarifier les droits avant analyse." : "Audit Codex puis backtest déterministe.",
    discoveredAt: now,
    updatedAt: now,
    paper: {
      status: "not_started",
      trades: 0,
      closedTrades: 0,
      openTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      pnlUsd: 0,
    },
  };
  const candidates = [candidate, ...current.candidates.filter((item) => item.sourceUrl !== sourceUrl || !sourceUrl)].slice(0, MAX_CANDIDATES);
  return writeState({ ...current, candidates });
}

export async function updateStrategyDiscoveryCandidateStage(id: string, stage: StrategyDiscoveryStage) {
  const current = await readStrategyDiscoveryState();
  const now = nowIso();
  return writeState({
    ...current,
    candidates: current.candidates.map((candidate) => candidate.id === id ? {
      ...candidate,
      stage,
      paper: stage === "paper_incubation" && candidate.paper.status === "not_started" ? { ...candidate.paper, status: "watching" } : candidate.paper,
      lastReviewAt: stage === "codex_review" ? now : candidate.lastReviewAt,
      updatedAt: now,
      nextAction: stage === "backtest_queue" ? "Lancer un backtest déterministe." : stage === "paper_incubation" ? "Incuber en paper avec faible risque." : candidate.nextAction,
    } : candidate),
  });
}

export async function updateStrategyDiscoveryPaperMetrics(metrics: StrategyDiscoveryPaperMetricInput[]) {
  const current = await readStrategyDiscoveryState();
  const metricsById = new Map(metrics.map((metric) => [metric.id, metric]));
  const now = nowIso();

  return writeState({
    ...current,
    candidates: current.candidates.map((candidate) => {
      const metric = metricsById.get(candidate.id);
      if (!metric) return candidate;

      return {
        ...candidate,
        updatedAt: now,
        paper: {
          status: metric.status,
          trades: numberValue(metric.trades, candidate.paper.trades, 0, 10_000),
          closedTrades: numberValue(metric.closedTrades, candidate.paper.closedTrades, 0, 10_000),
          openTrades: numberValue(metric.openTrades, candidate.paper.openTrades, 0, 10_000),
          winningTrades: numberValue(metric.winningTrades, candidate.paper.winningTrades, 0, 10_000),
          losingTrades: numberValue(metric.losingTrades, candidate.paper.losingTrades, 0, 10_000),
          winRate: numberValue(metric.winRate, candidate.paper.winRate, 0, 100),
          pnlUsd: numberValue(metric.pnlUsd, candidate.paper.pnlUsd, -10_000_000, 10_000_000),
        },
      };
    }),
  });
}

export async function recordStrategyDiscoveryScan() {
  const current = await readStrategyDiscoveryState();
  const now = new Date();
  return writeState({
    ...current,
    lastScanAt: now.toISOString(),
    nextScanAt: nextDailyScan(now),
  });
}

export async function runControlledStrategyDiscoveryScan() {
  const current = await readStrategyDiscoveryState();
  const now = new Date();
  const limit = Math.max(1, Math.min(20, current.maxCandidatesPerDay));
  const candidates = [...current.candidates];
  const existingUrls = new Set(candidates.flatMap((candidate) => candidate.sourceUrl ? [candidate.sourceUrl] : []));
  let discovered = 0;
  let scanned = 0;
  let failed = 0;

  const feedCandidates = candidates.length >= MAX_CANDIDATES ? [] : await discoverTradingViewOpenStrategyCandidates(limit, existingUrls);
  for (const item of feedCandidates) {
    if (existingUrls.has(item.url) || candidates.length >= MAX_CANDIDATES) continue;
    const candidateNow = nowIso();
    const assets = cryptoAssetsFromText(item.title, item.url);
    candidates.unshift({
      id: `${slug(item.title)}-${Date.now().toString(36)}-${discovered}`,
      title: safeText(item.title, titleFromUrl(item.url), 120),
      source: "tradingview",
      sourceUrl: item.url,
      visibility: "open-source",
      stage: "source_watch",
      score: 12,
      risk: "Modéré",
      timeframe: "15m",
      assets,
      tags: ["TradingView", "veille", "open-source", "crypto"],
      notes: `Découvert via la veille TradingView crypto/open-source. Actifs proposés: ${assets.join(", ")}.`,
      blockers: [],
      licenseNotes: defaultLicenseNotes("tradingview", "open-source"),
      nextAction: "Audit Codex puis backtest déterministe.",
      discoveredAt: candidateNow,
      updatedAt: candidateNow,
      paper: {
        status: "not_started",
        trades: 0,
        closedTrades: 0,
        openTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        pnlUsd: 0,
      },
    });
    existingUrls.add(item.url);
    discovered += 1;
    if (discovered >= limit) break;
  }

  const scanQueue = candidates
    .flatMap((candidate) => candidate.sourceUrl && candidate.stage !== "blocked" ? [{ candidate, sourceUrl: candidate.sourceUrl }] : [])
    .toSorted((a, b) => new Date(b.candidate.updatedAt).getTime() - new Date(a.candidate.updatedAt).getTime());

  for (const { candidate, sourceUrl } of scanQueue) {
    if (scanned >= limit) break;

    const index = candidates.findIndex((item) => item.id === candidate.id);
    if (index < 0) continue;

    try {
      const html = await fetchSourceHtml(sourceUrl);
      candidates[index] = scannedCandidate(candidate, html);
      scanned += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "source inaccessible";
      candidates[index] = {
        ...candidate,
        blockers: uniqueList([...candidate.blockers.filter((blocker) => !blocker.startsWith("Scan indisponible")), `Scan indisponible: ${message}`]),
        updatedAt: nowIso(),
      };
    }
  }

  const state = await writeState({
    ...current,
    candidates,
    lastScanAt: now.toISOString(),
    nextScanAt: nextDailyScan(now),
  });

  return { state, discovered, scanned, failed };
}

export function getStrategyDiscoveryFilePath() {
  return DISCOVERY_FILE;
}
