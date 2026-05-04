import { execFile as execFileCallback, spawn } from "node:child_process";
import type { ExecFileOptions } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export type LocalAnalysisProviderId = "openclaw" | "codex";
export type LocalAnalysisProviderSelection = LocalAnalysisProviderId | "none";

export type LocalAnalysisProviderConfig = {
  version: 1;
  updatedAt: string;
  selection: LocalAnalysisProviderSelection;
  providerId: LocalAnalysisProviderId | null;
  source: "file" | "env" | "defaults";
};

export type LocalAnalysisRunResult = {
  enabled: boolean;
  providerId?: LocalAnalysisProviderId;
  ok: boolean;
  latencyMs: number;
  text: string;
  error?: string;
};

const DEFAULT_TIMEOUT_MS = 90_000;
const CODEX_APP_COMMAND = "/Applications/Codex.app/Contents/Resources/codex";
const RUNTIME_DIR = path.join(process.cwd(), ".agent-trader-runtime");
const PROVIDER_FILE = path.join(RUNTIME_DIR, "local-analysis-provider.json");

function normalizeProviderSelection(value: unknown): LocalAnalysisProviderSelection | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "openclaw" || normalized === "codex") return normalized;
  if (normalized === "none" || normalized === "off" || normalized === "disabled") return "none";
  return null;
}

function selectionToProviderId(selection: LocalAnalysisProviderSelection): LocalAnalysisProviderId | null {
  return selection === "none" ? null : selection;
}

function readPersistedProviderSelection(): LocalAnalysisProviderSelection | null {
  try {
    const parsed = JSON.parse(readFileSync(PROVIDER_FILE, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Partial<LocalAnalysisProviderConfig>;
    return normalizeProviderSelection(candidate.selection ?? candidate.providerId);
  } catch {
    return null;
  }
}

function envProviderSelection(): LocalAnalysisProviderSelection | null {
  return normalizeProviderSelection(process.env.TRADERAI_ANALYSIS_PROVIDER || process.env.PAPER_TRADING_ANALYSIS_PROVIDER || "");
}

function effectiveProviderSelection() {
  const fileSelection = readPersistedProviderSelection();
  if (fileSelection) return { selection: fileSelection, source: "file" as const };

  const envSelection = envProviderSelection();
  if (envSelection) return { selection: envSelection, source: "env" as const };

  return { selection: "codex" as const, source: "defaults" as const };
}

export function configuredLocalAnalysisProvider(): LocalAnalysisProviderId | null {
  const { selection } = effectiveProviderSelection();
  return selectionToProviderId(selection);
}

export async function readLocalAnalysisProviderConfig(): Promise<LocalAnalysisProviderConfig> {
  const { selection, source } = effectiveProviderSelection();

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    selection,
    providerId: selectionToProviderId(selection),
    source,
  };
}

export async function writeLocalAnalysisProviderConfig(selection: LocalAnalysisProviderSelection): Promise<LocalAnalysisProviderConfig> {
  await mkdir(RUNTIME_DIR, { recursive: true });
  const normalized = normalizeProviderSelection(selection) ?? "codex";
  const persisted = {
    version: 1 as const,
    updatedAt: new Date().toISOString(),
    selection: normalized,
  };
  await writeFile(PROVIDER_FILE, `${JSON.stringify(persisted, null, 2)}\n`, "utf8");

  return {
    ...persisted,
    providerId: selectionToProviderId(normalized),
    source: "file",
  };
}

export function getLocalAnalysisProviderFilePath() {
  return PROVIDER_FILE;
}

export function isKnownLocalAnalysisProvider(value: string) {
  const normalized = normalizeProviderSelection(value);
  return normalized === "codex" || normalized === "openclaw" || normalized === "none";
}

export function providerIdFromSelection(value: string): LocalAnalysisProviderSelection {
  return normalizeProviderSelection(value) ?? "codex";
}

export function configuredProviderLabel() {
  const providerId = configuredLocalAnalysisProvider();
  return providerId ?? "none";
}

export function configuredLocalProviderFromEnvOnly(): LocalAnalysisProviderId | null {
  const value = envProviderSelection();
  if (value === "openclaw" || value === "codex") return value;
  return null;
}

function configuredCodexCommand() {
  const command = process.env.TRADERAI_CODEX_COMMAND?.trim();
  if (command) return command;
  return existsSync(CODEX_APP_COMMAND) ? CODEX_APP_COMMAND : "codex";
}

export function localAnalysisProviderConfiguredByDefault() {
  return !(process.env.TRADERAI_ANALYSIS_PROVIDER || process.env.PAPER_TRADING_ANALYSIS_PROVIDER);
}

export function localAnalysisProviderDisabled() {
  const value = (process.env.TRADERAI_ANALYSIS_PROVIDER || process.env.PAPER_TRADING_ANALYSIS_PROVIDER || "").trim().toLowerCase();
  if (!value) return false;
  return value === "none" || value === "off" || value === "disabled";
}

export function localAnalysisTimeoutMs() {
  const parsed = Number(process.env.TRADERAI_ANALYSIS_TIMEOUT_MS || process.env.PAPER_TRADING_ANALYSIS_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

export function extractJsonObject(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) return null;

    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }
}

function textFromOpenClawPayload(stdout: string) {
  const parsed = extractJsonObject(stdout);
  if (!parsed) return stdout;

  for (const key of ["reply", "message", "content", "text", "output", "result"]) {
    const value = parsed[key];
    if (typeof value === "string" && value.trim()) return value;
  }

  return JSON.stringify(parsed);
}

function execFileWithInput(file: string, args: string[], input: string, options: Pick<ExecFileOptions, "cwd" | "env" | "maxBuffer" | "timeout">) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const maxBuffer = options.maxBuffer ?? 1024 * 1024;
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = options.timeout
      ? setTimeout(() => {
          child.kill("SIGTERM");
          fail(new Error(`Command timed out after ${options.timeout}ms`));
        }, options.timeout)
      : null;

    function clearTimer() {
      if (timer) clearTimeout(timer);
    }

    function fail(error: Error) {
      if (settled) return;
      settled = true;
      clearTimer();
      reject(Object.assign(error, { stdout, stderr }));
    }

    function append(kind: "stdout" | "stderr", chunk: unknown) {
      const text = String(chunk);
      if (kind === "stdout") stdout += text;
      else stderr += text;

      if (stdout.length + stderr.length > maxBuffer) {
        child.kill("SIGTERM");
        fail(new Error(`Command output exceeded maxBuffer of ${maxBuffer} bytes`));
      }
    }

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => append("stdout", chunk));
    child.stderr?.on("data", (chunk) => append("stderr", chunk));
    child.on("error", fail);
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimer();

      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(Object.assign(new Error(`Command failed with code ${code ?? signal ?? "unknown"}`), { stdout, stderr, code, signal }));
    });

    child.stdin?.end(input);
  });
}

async function runOpenClaw(prompt: string, timeoutMs: number) {
  const command = process.env.TRADERAI_OPENCLAW_COMMAND || "openclaw";
  const args = ["agent", "--json", "--message", prompt, "--timeout", String(Math.ceil(timeoutMs / 1000))];
  const agentId = process.env.TRADERAI_OPENCLAW_ANALYSIS_AGENT?.trim();
  const thinking = process.env.TRADERAI_OPENCLAW_THINKING?.trim();

  if (agentId) args.splice(1, 0, "--agent", agentId);
  if (thinking) args.push("--thinking", thinking);

  const { stdout, stderr } = await execFile(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, NO_COLOR: "1" },
    timeout: timeoutMs,
    maxBuffer: 2 * 1024 * 1024,
  });

  return textFromOpenClawPayload(`${stdout}\n${stderr}`.trim());
}

async function runCodex(prompt: string, timeoutMs: number) {
  const command = configuredCodexCommand();
  const tempDir = path.join(os.tmpdir(), "traderai-codex-analysis");
  await mkdir(tempDir, { recursive: true });

  const outputFile = path.join(tempDir, `analysis-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
  const args = [
    "exec",
    "--ephemeral",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--ignore-rules",
    "--cd",
    process.cwd(),
    "--output-last-message",
    outputFile,
  ];
  const model = process.env.TRADERAI_CODEX_MODEL?.trim();
  if (model) args.push("--model", model);
  args.push("-");

  try {
    const { stdout, stderr } = await execFileWithInput(command, args, prompt, {
      cwd: process.cwd(),
      env: { ...process.env, NO_COLOR: "1" },
      timeout: timeoutMs,
      maxBuffer: 2 * 1024 * 1024,
    });
    const lastMessage = await readFile(outputFile, "utf8").catch(() => "");
    return (lastMessage || stdout || stderr).trim();
  } finally {
    await rm(outputFile, { force: true }).catch(() => undefined);
  }
}

async function runProvider(providerId: LocalAnalysisProviderId, prompt: string, timeoutMs: number) {
  return providerId === "openclaw" ? runOpenClaw(prompt, timeoutMs) : runCodex(prompt, timeoutMs);
}

export async function runConfiguredLocalAnalysis(prompt: string, options: { providerId?: LocalAnalysisProviderId; timeoutMs?: number } = {}): Promise<LocalAnalysisRunResult> {
  const providerId = options.providerId ?? configuredLocalAnalysisProvider();
  if (!providerId) {
    return {
      enabled: false,
      ok: false,
      latencyMs: 0,
      text: "",
      error: "Analyse locale désactivée.",
    };
  }

  const startedAt = Date.now();
  try {
    const text = await runProvider(providerId, prompt, options.timeoutMs ?? localAnalysisTimeoutMs());
    return {
      enabled: true,
      providerId,
      ok: true,
      latencyMs: Date.now() - startedAt,
      text,
    };
  } catch (error) {
    return {
      enabled: true,
      providerId,
      ok: false,
      latencyMs: Date.now() - startedAt,
      text: "",
      error: error instanceof Error ? error.message : "Analyse locale impossible.",
    };
  }
}
