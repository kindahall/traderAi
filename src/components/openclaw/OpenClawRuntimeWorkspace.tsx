"use client";

import { useMemo, useRef, useState } from "react";
import {
  Bot,
  CheckCircle2,
  DatabaseZap,
  KeyRound,
  Link2,
  RefreshCcw,
  Save,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  TerminalSquare,
  Unplug,
  Workflow,
} from "lucide-react";
import type { OpenClawAuthMode, OpenClawRolePolicy, OpenClawRuntimeSnapshot } from "@/types/openclaw";
import { Button } from "@/components/ui/button";
import { Checklist, DataTable, GlassCard, InfoHint, KpiCard, ProgressBar, SectionTitle, StatusBadge, Stepper, TogglePill } from "@/components/ui/dashboard";
import { cn } from "@/lib/utils";

type Props = {
  initialSnapshot: OpenClawRuntimeSnapshot;
};

type ConnectionForm = {
  gatewayUrl: string;
  authMode: OpenClawAuthMode;
  token: string;
  password: string;
  defaultAgentId: string;
};

const inputClass = "h-10 w-full rounded-xl border border-[#1b3a55] bg-slate-950/60 px-3 text-sm text-slate-100 outline-none transition focus:border-sky-400/70";

export function OpenClawRuntimeWorkspace({ initialSnapshot }: Props) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [rolePolicy, setRolePolicy] = useState<OpenClawRolePolicy[]>(initialSnapshot.rolePolicy);
  const [form, setForm] = useState<ConnectionForm>({
    gatewayUrl: initialSnapshot.config.gatewayUrl,
    authMode: initialSnapshot.config.authMode,
    token: "",
    password: "",
    defaultAgentId: initialSnapshot.config.defaultAgentId,
  });
  const [busyAction, setBusyAction] = useState<"test" | "sync" | "save" | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [configNudge, setConfigNudge] = useState(false);
  const configPanelRef = useRef<HTMLDivElement>(null);
  const gatewayInputRef = useRef<HTMLInputElement>(null);
  const tokenInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const activeRoles = rolePolicy.filter((role) => role.enabled).length;
  const directExecutionLocked = rolePolicy.find((role) => role.id === "executor")?.locked ?? true;
  const connected = snapshot.status.state === "connected";
  const configReady = snapshot.status.configured;
  const statusHint = [snapshot.status.message, snapshot.status.details].filter(Boolean).join(" ");

  const roleReadiness = useMemo(() => {
    const enabledSafeRoles = rolePolicy.filter((role) => role.enabled && role.id !== "executor").length;
    return Math.min(100, enabledSafeRoles * 28 + (directExecutionLocked ? 16 : 0));
  }, [directExecutionLocked, rolePolicy]);

  const updateField = <K extends keyof ConnectionForm>(key: K, value: ConnectionForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const focusConnectionConfig = () => {
    configPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setConfigNudge(true);
    window.setTimeout(() => setConfigNudge(false), 1400);
    window.setTimeout(() => {
      const target = form.authMode === "token" ? tokenInputRef.current : form.authMode === "password" ? passwordInputRef.current : gatewayInputRef.current;
      target?.focus();
      target?.select();
    }, 320);
  };

  const requestPayload = () => ({
    gatewayUrl: form.gatewayUrl,
    authMode: form.authMode,
    token: form.token || undefined,
    password: form.password || undefined,
    defaultAgentId: form.defaultAgentId,
  });

  const testConnection = async () => {
    setBusyAction("test");
    setActionError(null);
    try {
      const response = await fetch("/api/openclaw/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload()),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? `OpenClaw ${response.status}`);
      setSnapshot(data);
      if (Array.isArray(data.rolePolicy)) setRolePolicy(data.rolePolicy);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Connexion OpenClaw impossible");
    } finally {
      setBusyAction(null);
    }
  };

  const syncAgents = async () => {
    setBusyAction("sync");
    setActionError(null);
    try {
      const response = await fetch("/api/openclaw/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload()),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? `OpenClaw ${response.status}`);
      setSnapshot((current) => ({ ...current, ...data }));
      if (Array.isArray(data.rolePolicy)) setRolePolicy(data.rolePolicy);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Synchronisation OpenClaw impossible");
    } finally {
      setBusyAction(null);
    }
  };

  const toggleRole = (roleId: OpenClawRolePolicy["id"]) => {
    setRolePolicy((current) =>
      current.map((role) => {
        if (role.id !== roleId || role.locked) return role;
        return { ...role, enabled: !role.enabled };
      }),
    );
  };

  const saveRolePolicy = async () => {
    setBusyAction("save");
    setActionError(null);
    try {
      const response = await fetch("/api/openclaw/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rolePolicy }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? `OpenClaw ${response.status}`);
      if (Array.isArray(data.rolePolicy)) setRolePolicy(data.rolePolicy);
      setSavedAt(new Date(data.updatedAt ?? Date.now()).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Sauvegarde OpenClaw impossible");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <>
      <SectionTitle title="OpenClaw Runtime" subtitle="Connexion Gateway, rôles agentiques et synchronisation des agents OpenClaw." icon={<Bot />} />

      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={testConnection} disabled={busyAction !== null}>
          {busyAction === "test" ? <RefreshCcw className="size-4 animate-spin" /> : <Link2 className="size-4" />}
          Tester
        </Button>
        <Button variant="ai" onClick={syncAgents} disabled={busyAction !== null || !configReady}>
          {busyAction === "sync" ? <RefreshCcw className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
          Synchroniser
        </Button>
        <Button variant="success" onClick={saveRolePolicy} disabled={busyAction !== null}>
          {busyAction === "save" ? <RefreshCcw className="size-4 animate-spin" /> : <Save className="size-4" />}
          Enregistrer rôle
        </Button>
      </div>
      {actionError ? <div className="mb-4 rounded-2xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">{actionError}</div> : null}

      <div className="grid grid-cols-4 gap-4">
        <RuntimeStatusCard
          connected={connected}
          configReady={configReady}
          status={snapshot.status.state}
          hint={statusHint}
          onClick={focusConnectionConfig}
        />
        <KpiCard label="Latence" value={snapshot.status.latencyMs ? `${snapshot.status.latencyMs} ms` : "-"} delta={snapshot.status.protocol ? `P${snapshot.status.protocol}` : "RPC"} tone="info" />
        <KpiCard label="Agents" value={`${snapshot.agents.length}`} delta={`${activeRoles} rôles · ${form.defaultAgentId || "-"}`} tone="ai" icon={<Bot className="size-5" />} />
        <KpiCard label="Autorité" value="App" delta={directExecutionLocked ? "Verrouillé" : "À revoir"} tone={directExecutionLocked ? "success" : "danger"} icon={<ShieldCheck className="size-5" />} />
      </div>

      <div className="mt-4 grid grid-cols-[390px_1fr] gap-4">
        <div ref={configPanelRef}>
          <GlassCard className={cn(configNudge && "border-sky-400/80 shadow-[0_0_0_1px_rgba(56,189,248,0.65),0_0_42px_rgba(14,165,233,0.2)]")}>
            <PanelTitle icon={<KeyRound className="size-5" />} title="Connexion Gateway" hint="Les secrets restent côté serveur. Le frontend ne reçoit que les états masqués." />
            <div className="space-y-3">
              <FormField label="Gateway URL">
                <input ref={gatewayInputRef} className={inputClass} value={form.gatewayUrl} onChange={(event) => updateField("gatewayUrl", event.target.value)} placeholder="ws://127.0.0.1:18789" />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Auth">
                  <select className={inputClass} value={form.authMode} onChange={(event) => updateField("authMode", event.target.value as OpenClawAuthMode)}>
                    <option value="token">Token</option>
                    <option value="password">Password</option>
                    <option value="none">None local</option>
                  </select>
                </FormField>
                <FormField label="Agent par défaut">
                  <input className={inputClass} value={form.defaultAgentId} onChange={(event) => updateField("defaultAgentId", event.target.value)} />
                </FormField>
              </div>
              {form.authMode === "token" ? (
                <FormField label="Token Gateway">
                  <input ref={tokenInputRef} className={inputClass} type="password" value={form.token} onChange={(event) => updateField("token", event.target.value)} placeholder={snapshot.config.tokenConfigured ? "Token .env déjà configuré" : "OPENCLAW_GATEWAY_TOKEN"} />
                </FormField>
              ) : null}
              {form.authMode === "password" ? (
                <FormField label="Password Gateway">
                  <input ref={passwordInputRef} className={inputClass} type="password" value={form.password} onChange={(event) => updateField("password", event.target.value)} placeholder={snapshot.config.passwordConfigured ? "Password .env déjà configuré" : "OPENCLAW_GATEWAY_PASSWORD"} />
                </FormField>
              ) : null}
            </div>
            <div className="mt-4 rounded-xl border border-[#16314a] bg-white/[0.025] px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400">Statut</span>
                <StatusBadge tone={connected ? "success" : configReady ? "warning" : "danger"}>{snapshot.status.state}</StatusBadge>
              </div>
              {snapshot.status.details ? <div className="mt-2 flex justify-end"><InfoHint content={snapshot.status.details} /></div> : null}
            </div>
          </GlassCard>
        </div>

        <div className="space-y-4">
          <GlassCard>
            <PanelTitle icon={<SlidersHorizontal className="size-5" />} title="Rôles OpenClaw" hint="OpenClaw peut aider l'app à lire, analyser et auditer. L'exécution directe reste bloquée." action={savedAt ? <StatusBadge tone="success">Sauvé {savedAt}</StatusBadge> : <StatusBadge tone="neutral">Local</StatusBadge>} />
            <div className="grid grid-cols-4 gap-3">
              {rolePolicy.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => toggleRole(role.id)}
                  className={cn(
                    "min-h-[112px] rounded-2xl border p-4 text-left transition",
                    role.enabled ? "border-sky-400/50 bg-sky-500/10" : "border-[#16314a] bg-white/[0.025]",
                    role.locked && "border-red-500/30 bg-red-500/5 opacity-85",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 font-bold text-white">
                      {role.label}
                      <InfoHint content={role.description} />
                    </div>
                    <TogglePill active={role.enabled} disabled={role.locked} />
                  </div>
                  <div className="mt-5 flex items-center justify-between gap-2">
                    <StatusBadge tone={role.enabled ? "success" : "neutral"}>{role.enabled ? "Actif" : "Off"}</StatusBadge>
                    <StatusBadge tone={role.riskAuthority === "none" ? "neutral" : role.riskAuthority === "proposal_only" ? "info" : "warning"}>{riskAuthorityLabel(role.riskAuthority)}</StatusBadge>
                  </div>
                </button>
              ))}
            </div>
          </GlassCard>

          <div className="grid grid-cols-[1fr_320px] gap-4">
            <GlassCard>
              <PanelTitle icon={<Workflow className="size-5" />} title="Décision" hint="La proposition OpenClaw passe par le moteur de risque avant toute action." />
              <Stepper active={2} steps={["Scan", "Proposition", "Risque", "Validation", "Paper", "Journal"]} />
              <div className="mt-4">
                <ProgressBar value={roleReadiness} tone={roleReadiness >= 80 ? "success" : "warning"} />
              </div>
            </GlassCard>
            <GlassCard>
              <PanelTitle icon={<Shield className="size-5" />} title="Garde-fous" hint="Ces verrous empêchent OpenClaw de devenir l'autorité financière finale." />
              <Checklist
                items={[
                  { label: "Secrets", status: "ok" },
                  { label: "Risk Engine", status: "ok" },
                  { label: "Exécution", status: directExecutionLocked ? "ok" : "danger" },
                  { label: "Live", status: "pending" },
                ]}
              />
            </GlassCard>
          </div>
        </div>
      </div>

      <GlassCard className="mt-4">
        <PanelTitle icon={<DatabaseZap className="size-5" />} title="Sources" hint="Ce tableau définit où chaque rôle OpenClaw va chercher son contexte. Les sources sensibles passent par le backend de l'application." />
        <DataTable
          headers={["Source", "Rôles", "Accès", "Cadence", "Endpoint", "Statut"]}
          rows={snapshot.dataSources.map((source) => [
            <span key={`${source.id}-label`} className="inline-flex items-center gap-2 font-semibold text-white">
              {source.label}
              <InfoHint content={source.hint} />
            </span>,
            source.roles.map(roleLabel).join(", "),
            <StatusBadge key={`${source.id}-access`} tone={source.access === "blocked" ? "danger" : source.access === "guarded" ? "warning" : "success"}>{source.access === "blocked" ? "Bloqué" : source.access === "guarded" ? "Guarded" : "Read"}</StatusBadge>,
            source.cadence,
            <code key={`${source.id}-endpoint`} className="font-mono text-xs text-sky-200">{source.endpoint}</code>,
            <StatusBadge key={`${source.id}-status`} tone={source.status === "active" ? "success" : source.status === "blocked" ? "danger" : "neutral"}>{source.status}</StatusBadge>,
          ])}
        />
      </GlassCard>

      <div className="mt-4 grid grid-cols-[1fr_360px] gap-4">
        <GlassCard>
          <PanelTitle icon={<Bot className="size-5" />} title="Agents" hint="Liste renvoyée par le Gateway OpenClaw après synchronisation." />
          {snapshot.agents.length ? (
            <DataTable
              headers={["Agent", "Runtime", "Statut", "Rôle", "Modèle", "Workspace"]}
              rows={snapshot.agents.map((agent) => [
                <span key={`${agent.id}-name`} className="font-semibold text-white">{agent.name}</span>,
                agent.runtime,
                <StatusBadge key={`${agent.id}-status`} tone={agent.status === "active" ? "success" : agent.status === "paused" ? "warning" : "neutral"}>{agent.status}</StatusBadge>,
                agent.role,
                agent.model ?? "-",
                agent.workspace ?? "-",
              ])}
            />
          ) : (
            <div className="grid min-h-[190px] place-items-center rounded-2xl border border-[#16314a] bg-white/[0.025] text-center">
              <div>
                <Bot className="mx-auto size-10 text-slate-500" />
                <div className="mt-3 font-semibold text-white">Aucun agent</div>
                <div className="mt-1 text-sm text-slate-500">Gateway {snapshot.status.state}</div>
              </div>
            </div>
          )}
        </GlassCard>

        <GlassCard>
          <PanelTitle icon={<TerminalSquare className="size-5" />} title="Journal" />
          <div className="space-y-3">
            {snapshot.logs.length ? snapshot.logs.map((log, index) => (
              <div key={`${log.time}-${index}`} className="rounded-xl border border-[#16314a] bg-white/[0.025] p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <StatusBadge tone={log.level === "danger" ? "danger" : log.level}>{log.level}</StatusBadge>
                  <span className="font-mono text-xs text-slate-500">{new Date(log.time).toLocaleTimeString("fr-FR")}</span>
                </div>
                <div className="mt-2 leading-relaxed text-slate-300">{log.message}</div>
              </div>
            )) : (
              <div className="rounded-xl border border-[#16314a] bg-white/[0.025] p-3 text-sm text-slate-400">En attente.</div>
            )}
          </div>
        </GlassCard>
      </div>
    </>
  );
}

function RuntimeStatusCard({ connected, configReady, status, hint, onClick }: { connected: boolean; configReady: boolean; status: string; hint?: string; onClick: () => void }) {
  const tone = connected ? "success" : configReady ? "warning" : "danger";
  const icon = connected ? <CheckCircle2 className="size-5" /> : <Unplug className="size-5" />;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-[112px] w-full rounded-2xl border bg-[linear-gradient(145deg,rgba(8,24,43,0.92),rgba(4,14,26,0.78))] p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_60px_rgba(0,0,0,0.28)] transition focus:border-sky-300 focus:outline-none hover:border-sky-400/70 hover:bg-sky-500/10",
        tone === "danger" && "border-red-500/25",
        tone === "success" && "border-emerald-500/25",
        tone === "warning" && "border-amber-500/25",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-slate-300">Runtime</div>
          <div className={cn("mt-2 font-mono text-3xl font-bold", connected ? "text-emerald-300" : configReady ? "text-amber-300" : "text-red-300")}>{connected ? "Connecté" : configReady ? "Prêt" : "À configurer"}</div>
          <div className={cn("mt-1 inline-flex rounded-lg border px-2 py-1 text-xs font-semibold", connected ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : configReady ? "border-amber-400/30 bg-amber-500/10 text-amber-300" : "border-red-400/30 bg-red-500/10 text-red-300")}>{status}</div>
          {hint ? <div className="mt-2"><InfoHint content={hint} /></div> : null}
        </div>
        <div className={cn("rounded-2xl border p-3", connected ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : configReady ? "border-amber-400/30 bg-amber-500/10 text-amber-300" : "border-red-400/30 bg-red-500/10 text-red-300")}>{icon}</div>
      </div>
    </button>
  );
}

function riskAuthorityLabel(value: OpenClawRolePolicy["riskAuthority"]) {
  if (value === "none") return "Audit";
  if (value === "proposal_only") return "Signal";
  return "Risque";
}

function roleLabel(role: OpenClawRolePolicy["id"]) {
  if (role === "scanner") return "Scanner";
  if (role === "analyst") return "Analyste";
  if (role === "auditor") return "Auditeur";
  return "Exécuteur";
}

function PanelTitle({ icon, title, action, hint }: { icon?: React.ReactNode; title: string; action?: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-base font-bold text-white">
        {icon ? <span className="text-sky-300">{icon}</span> : null}
        {title}
        {hint ? <InfoHint content={hint} /> : null}
      </div>
      {action}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs text-slate-400">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
