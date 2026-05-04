import { Loader2 } from "lucide-react";

const metricCards = ["w-28", "w-20", "w-24", "w-16"];

export default function Loading() {
  return (
    <div aria-live="polite" className="min-h-[calc(100vh-190px)] rounded-2xl border border-[#16314a] bg-slate-950/45 p-5">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-3">
          <div className="h-5 w-44 rounded-lg bg-slate-800/80" />
          <div className="h-3 w-full max-w-[360px] rounded bg-slate-900" />
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-200">
          <Loader2 className="size-4 animate-spin" />
          Chargement
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((width, index) => (
          <div key={index} className="h-32 rounded-2xl border border-[#16314a] bg-white/[0.03] p-4">
            <div className={`h-3 ${width} rounded bg-slate-800`} />
            <div className="mt-5 h-7 w-24 rounded bg-slate-700/70" />
            <div className="mt-4 h-2 w-full rounded bg-slate-900" />
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_0.8fr]">
        <div className="h-80 rounded-2xl border border-[#16314a] bg-white/[0.03] p-4">
          <div className="h-4 w-36 rounded bg-slate-800" />
          <div className="mt-6 flex h-56 items-end gap-3">
            {[42, 64, 55, 78, 48, 72, 60, 86, 66, 76, 58, 80].map((height, index) => (
              <div key={index} className="flex-1 rounded-t-lg bg-sky-500/20" style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>

        <div className="h-80 rounded-2xl border border-[#16314a] bg-white/[0.03] p-4">
          <div className="h-4 w-40 rounded bg-slate-800" />
          <div className="mt-6 space-y-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <div className="size-9 rounded-xl bg-slate-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-3/4 rounded bg-slate-800" />
                  <div className="h-2 w-full rounded bg-slate-900" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
