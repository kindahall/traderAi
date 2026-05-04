import { mkdir, readFile, unlink, writeFile, open } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const command = process.argv[2] || "status";
const rootDir = process.cwd();
const runtimeDir = path.join(rootDir, ".agent-trader-runtime");
const pidFile = path.join(runtimeDir, "paper-runtime.pid");
const logFile = path.join(runtimeDir, "paper-runtime.log");
const healthFile = path.join(runtimeDir, "paper-runtime-health.json");

function stamp() {
  return new Date().toISOString();
}

async function ensureRuntimeDir() {
  await mkdir(runtimeDir, { recursive: true });
}

async function readPid() {
  try {
    const raw = await readFile(pidFile, "utf8");
    const pid = Number(raw.trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readHealth() {
  try {
    return JSON.parse(await readFile(healthFile, "utf8"));
  } catch {
    return null;
  }
}

async function writeBootstrapLog(message) {
  await ensureRuntimeDir();
  const handle = await open(logFile, constants.O_CREAT | constants.O_WRONLY | constants.O_APPEND, 0o644);
  await handle.write(`${message}\n`);
  await handle.close();
}

async function status() {
  const pid = await readPid();
  return {
    pid,
    alive: isAlive(pid),
    pidFile,
    logFile,
    health: await readHealth(),
  };
}

async function start() {
  await ensureRuntimeDir();
  const current = await status();
  if (current.alive) return { ...current, started: false, message: "paper-runtime already running" };

  if (current.pid && !current.alive) {
    await unlink(pidFile).catch(() => {});
  }

  await writeBootstrapLog(`${stamp()} paper-runtime-control starting daemon`);
  const out = await open(logFile, constants.O_CREAT | constants.O_WRONLY | constants.O_APPEND, 0o644);
  const child = spawn(process.execPath, [path.join(rootDir, "scripts/paper-runtime.mjs")], {
    cwd: rootDir,
    detached: true,
    env: {
      ...process.env,
      PAPER_RUNTIME_BASE_URL: process.env.PAPER_RUNTIME_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || "3000"}`,
    },
    stdio: ["ignore", out.fd, out.fd],
  });

  child.unref();
  await writeFile(pidFile, `${child.pid}\n`, "utf8");
  await out.close();
  await new Promise((resolve) => setTimeout(resolve, 800));

  return { ...(await status()), started: true, message: "paper-runtime daemon started" };
}

async function stop() {
  const current = await status();
  if (!current.pid || !current.alive) {
    await unlink(pidFile).catch(() => {});
    return { ...current, stopped: false, message: "paper-runtime not running" };
  }

  process.kill(current.pid, "SIGTERM");
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (!isAlive(current.pid)) {
      await unlink(pidFile).catch(() => {});
      return { ...(await status()), stopped: true, message: "paper-runtime stopped" };
    }
  }

  return { ...(await status()), stopped: false, message: "paper-runtime still running after SIGTERM" };
}

const result = command === "start" ? await start() : command === "stop" ? await stop() : await status();
console.log(JSON.stringify(result, null, 2));
