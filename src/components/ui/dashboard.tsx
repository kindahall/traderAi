import type { ComponentProps, ReactNode } from "react";
import { CheckCircle2, Info, Lock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "success" | "danger" | "warning" | "info" | "ai" | "neutral";

const toneClasses: Record<Tone, string> = {
  success: "text-emerald-300 border-emerald-400/30 bg-emerald-500/10",
  danger: "text-red-300 border-red-400/30 bg-red-500/10",
  warning: "text-amber-300 border-amber-400/30 bg-amber-500/10",
  info: "text-sky-300 border-sky-400/30 bg-sky-500/10",
  ai: "text-violet-300 border-violet-400/30 bg-violet-500/10",
  neutral: "text-slate-300 border-white/10 bg-white/[0.04]",
};

type GlassCardProps = ComponentProps<"section"> & {
  glow?: boolean;
};

export function GlassCard({ children, className, glow = false, ...props }: GlassCardProps) {
  return (
    <section
      {...props}
      data-layout-card="true"
      className={cn(
        "rounded-2xl border border-[#16314a] bg-[linear-gradient(145deg,rgba(8,24,43,0.92),rgba(4,14,26,0.78))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl",
        glow && "shadow-[0_0_40px_rgba(14,165,233,0.14)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function InfoHint({ content, className }: { content: ReactNode; className?: string }) {
  return (
    <span className={cn("group/hint relative inline-flex shrink-0 items-center", className)}>
      <Info className="size-4 cursor-help text-slate-500 transition group-hover/hint:text-sky-300" />
      <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden w-72 -translate-x-1/2 rounded-xl border border-[#1b3a55] bg-[#020817]/95 p-3 text-xs font-normal leading-relaxed text-slate-200 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl group-hover/hint:block">
        {content}
      </span>
    </span>
  );
}

export function SectionTitle({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      {icon ? <div className="grid size-11 place-items-center rounded-2xl border border-sky-400/40 bg-sky-500/10 text-sky-300">{icon}</div> : null}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-white">{title}</h1>
          {subtitle ? <InfoHint content={subtitle} /> : null}
        </div>
      </div>
    </div>
  );
}

export function KpiCard({ label, value, delta, tone = "neutral", icon, children }: { label: string; value: string; delta?: string; tone?: Tone; icon?: ReactNode; children?: ReactNode }) {
  return (
    <GlassCard className={cn("min-h-[112px] overflow-hidden", tone === "danger" && "border-red-500/25", tone === "success" && "border-emerald-500/25", tone === "ai" && "border-violet-500/25") }>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-slate-300">{label}</div>
          <div className={cn("mt-2 font-mono text-3xl font-bold", tone === "success" && "text-emerald-300", tone === "danger" && "text-red-300", tone === "warning" && "text-amber-300", tone === "info" && "text-sky-300", tone === "ai" && "text-violet-300", tone === "neutral" && "text-white")}>{value}</div>
          {delta ? <div className={cn("mt-1 text-xs", toneClasses[tone])}>{delta}</div> : null}
        </div>
        {icon ? <div className={cn("rounded-2xl border p-3", toneClasses[tone])}>{icon}</div> : null}
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </GlassCard>
  );
}

export function StatusBadge({ children, tone = "neutral", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold", toneClasses[tone], className)}>{children}</span>;
}

export function ProgressBar({ value, max = 100, tone = "info" }: { value: number; max?: number; tone?: Tone }) {
  const width = Math.min(100, Math.max(0, (value / max) * 100));
  const colors: Record<Tone, string> = {
    success: "from-emerald-400 to-lime-300",
    danger: "from-red-500 to-rose-300",
    warning: "from-amber-400 to-orange-300",
    info: "from-sky-400 to-blue-500",
    ai: "from-violet-400 to-fuchsia-500",
    neutral: "from-slate-300 to-slate-500",
  };
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-800/90">
      <div className={cn("h-full rounded-full bg-gradient-to-r", colors[tone])} style={{ width: `${width}%` }} />
    </div>
  );
}

export function MetricGauge({ value, label, tone = "info" }: { value: number; label?: string; tone?: Tone }) {
  const color = tone === "success" ? "#34d399" : tone === "danger" ? "#f87171" : tone === "warning" ? "#f59e0b" : tone === "ai" ? "#a855f7" : "#0ea5e9";
  return (
    <div className="relative grid size-24 place-items-center rounded-full" style={{ background: `conic-gradient(${color} ${value * 3.6}deg, rgba(30,41,59,.8) 0deg)` }}>
      <div className="grid size-18 place-items-center rounded-full bg-[#06111f] text-center">
        <div className="font-mono text-xl font-bold text-white">{value}%</div>
        {label ? <div className="text-[10px] text-slate-400">{label}</div> : null}
      </div>
    </div>
  );
}

export function TogglePill({ active = true, disabled = false, onClick, title }: { active?: boolean; disabled?: boolean; onClick?: () => void; title?: string }) {
  const content = (
    <>
      <span className={cn("size-5 rounded-full bg-white shadow transition", active ? "translate-x-5" : "translate-x-0.5")} />
      {disabled ? <Lock className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 text-slate-300" /> : null}
    </>
  );
  const className = cn("relative inline-flex h-6 w-11 items-center rounded-full border transition", active ? "border-sky-400/70 bg-sky-500/40" : "border-slate-600 bg-slate-800", disabled && "opacity-45", onClick && !disabled && "hover:border-sky-200");

  if (onClick) {
    return <button aria-pressed={active} className={className} disabled={disabled} onClick={onClick} title={title} type="button">{content}</button>;
  }

  return <span className={className} title={title}>{content}</span>;
}

export function DataTable({ headers, rows, className }: { headers: string[]; rows: Array<Array<ReactNode>>; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-[#16314a]", className)}>
      <table className="w-full text-left text-sm">
        <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-slate-400">
          <tr>{headers.map((header) => <th key={header} className="px-4 py-3 font-medium">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-[#16314a] text-slate-300">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="hover:bg-sky-500/[0.04]">
              {row.map((cell, cellIndex) => <td key={cellIndex} className="px-4 py-3">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Timeline({ items }: { items: Array<{ time?: string; title: string; detail?: string; tone?: Tone }> }) {
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={`${item.title}-${index}`} className="group/timeline flex gap-3">
          <div className="flex flex-col items-center">
            <span className={cn("grid size-7 place-items-center rounded-full border", toneClasses[item.tone ?? "info"])}>{index + 1}</span>
            {index < items.length - 1 ? <span className="mt-1 h-full w-px bg-[#1b3a55]" /> : null}
          </div>
          <div className="min-w-0 pb-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <span className="truncate">{item.title}</span>
              {item.detail ? <InfoHint content={item.detail} /> : null}
              {item.time ? <span className="ml-auto shrink-0 font-mono text-xs text-slate-500">{item.time}</span> : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Stepper({ steps, active = 0 }: { steps: string[]; active?: number }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-[#16314a] bg-white/[0.03] p-3">
      {steps.map((step, index) => (
        <div key={step} className="flex min-w-fit items-center gap-2">
          <span className={cn("grid size-7 place-items-center rounded-full border text-xs font-bold", index <= active ? "border-sky-400 bg-sky-500/30 text-sky-100" : "border-slate-700 bg-slate-900 text-slate-500")}>{index + 1}</span>
          <span className={cn("text-sm", index <= active ? "text-white" : "text-slate-500")}>{step}</span>
          {index < steps.length - 1 ? <span className="h-px w-10 bg-[#1b3a55]" /> : null}
        </div>
      ))}
    </div>
  );
}

export function Checklist({ items }: { items: Array<{ label: string; status: "ok" | "warning" | "danger" | "pending" }> }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
          <span className="text-slate-300">{item.label}</span>
          <span className={cn("flex items-center gap-1 font-semibold", item.status === "ok" && "text-emerald-300", item.status === "warning" && "text-amber-300", item.status === "danger" && "text-red-300", item.status === "pending" && "text-sky-300")}>{item.status === "danger" ? <XCircle className="size-4" /> : <CheckCircle2 className="size-4" />}{item.status === "ok" ? "OK" : item.status === "warning" ? "Attention" : item.status === "danger" ? "Bloqué" : "En cours"}</span>
        </div>
      ))}
    </div>
  );
}

export function FilterBar({ filters }: { filters: string[] }) {
  const groupName = `filter-${filters.join("-").replace(/[^a-zA-Z0-9]/g, "").slice(0, 28)}`;
  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border border-[#16314a] bg-white/[0.03] p-3">
      {filters.map((filter, index) => (
        <label key={filter} className="cursor-pointer">
          <input className="peer sr-only" defaultChecked={index === 0} name={groupName} type="radio" />
          <span className="block rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300 transition hover:border-sky-400/60 hover:text-sky-200 peer-checked:border-sky-400/60 peer-checked:bg-sky-500/15 peer-checked:text-sky-100">{filter}</span>
        </label>
      ))}
    </div>
  );
}

export function DisclaimerBar({ items }: { items: string[] }) {
  return <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-amber-100/80">{items.join(" ")}</div>;
}
