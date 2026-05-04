"use client";

type Point = Record<string, string | number>;

function EmptyChart({ label = "Données indisponibles" }: { label?: string }) {
  return (
    <div className="grid size-full min-h-28 place-items-center rounded-xl border border-dashed border-[#1b3a55] bg-slate-950/30 text-center text-sm text-slate-500">
      {label}
    </div>
  );
}

function getSvgPoints(data: Point[], dataKey: string, height = 42) {
  const values = data.map((item) => Number(item[dataKey])).filter(Number.isFinite);
  if (!values.length) return { line: "", area: "", values };

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const line = values
    .map((value, index) => {
      const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
      const y = height - 6 - ((value - min) / range) * (height - 12);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return { line, area: line ? `0,${height} ${line} 100,${height}` : "", values };
}

export function Sparkline({ data = [], dataKey = "price", color = "#22c55e" }: { data?: Point[]; dataKey?: string; color?: string }) {
  const values = data.map((item) => Number(item[dataKey])).filter(Number.isFinite);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
      const y = 34 - ((value - min) / range) * 28;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const fillPath = points ? `0,40 ${points} 100,40` : "";

  return (
    <div className="h-12 w-full min-w-24 overflow-hidden rounded-xl">
      <svg className="size-full" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Tendance">
        <defs>
          <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {fillPath ? <polygon points={fillPath} fill={`url(#spark-${color.replace("#", "")})`} /> : null}
        {points ? <polyline points={points} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" vectorEffect="non-scaling-stroke" /> : null}
      </svg>
    </div>
  );
}

export function MarketChart({ compact = false, data = [] }: { compact?: boolean; data?: Point[] }) {
  if (!data.length) {
    return <div className={compact ? "h-56" : "h-[360px]"}><EmptyChart label="Flux marché indisponible" /></div>;
  }

  const { line, area } = getSvgPoints(data, "price", 42);

  return (
    <div className={`${compact ? "h-56" : "h-[360px]"} w-full overflow-hidden rounded-2xl border border-[#16314a] bg-slate-950/25 p-3`}>
      <svg className="size-full" viewBox="0 0 100 42" preserveAspectRatio="none" role="img" aria-label="Graphique marché">
        <defs>
          <linearGradient id="marketFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.03" />
          </linearGradient>
        </defs>
        {[8, 18, 28, 38].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="#143047" strokeWidth="0.35" vectorEffect="non-scaling-stroke" />)}
        <polygon points={area} fill="url(#marketFill)" />
        <polyline points={line} fill="none" stroke="#22c55e" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

export function EquityCurve({ data = [] }: { data?: Point[] }) {
  if (!data.length) {
    return <div className="h-72"><EmptyChart label="Courbe disponible après connexion des données" /></div>;
  }

  const equity = getSvgPoints(data, "equity", 42);
  const benchmark = getSvgPoints(data, "benchmark", 42);

  return (
    <div className="h-72 w-full overflow-hidden rounded-2xl border border-[#16314a] bg-slate-950/25 p-3">
      <svg className="size-full" viewBox="0 0 100 42" preserveAspectRatio="none" role="img" aria-label="Courbe d'équité indexée">
        <defs>
          <linearGradient id="equitySvgFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        {[8, 18, 28, 38].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="#143047" strokeWidth="0.35" vectorEffect="non-scaling-stroke" />)}
        <polygon points={equity.area} fill="url(#equitySvgFill)" />
        <polyline points={benchmark.line} fill="none" stroke="#94a3b8" strokeDasharray="2 2" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        <polyline points={equity.line} fill="none" stroke="#38bdf8" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

export function PerformanceBars({ data }: { data: Array<{ day: string; pnl: number }> }) {
  const values = data.map((item) => item.pnl);
  const maxAbs = Math.max(1, ...values.map((value) => Math.abs(value)));

  return (
    <div className="flex h-56 items-end gap-2 rounded-2xl border border-[#16314a] bg-slate-950/25 p-4">
      {data.map((entry) => {
        const height = Math.max(8, (Math.abs(entry.pnl) / maxAbs) * 92);
        return (
          <div key={entry.day} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex h-40 w-full items-end justify-center">
              <div
                className={entry.pnl >= 0 ? "w-full rounded-t-lg bg-emerald-400/80 shadow-[0_0_18px_rgba(34,197,94,0.25)]" : "w-full rounded-t-lg bg-red-400/80 shadow-[0_0_18px_rgba(239,68,68,0.25)]"}
                style={{ height: `${height}%` }}
                title={`${entry.day}: ${entry.pnl}`}
              />
            </div>
            <span className="truncate text-[10px] text-slate-500">{entry.day}</span>
          </div>
        );
      })}
    </div>
  );
}

export function RadarScore({ data = [] }: { data?: Point[] }) {
  if (!data.length) {
    return <div className="h-80"><EmptyChart label="Scores indisponibles" /></div>;
  }

  const center = 50;
  const maxRadius = 39;
  const axis = data.map((item, index) => {
    const angle = (Math.PI * 2 * index) / data.length - Math.PI / 2;
    return {
      label: String(item.subject),
      score: Number(item.score),
      weight: Number(item.weight),
      x: center + Math.cos(angle) * maxRadius,
      y: center + Math.sin(angle) * maxRadius,
      angle,
    };
  });
  const scorePolygon = axis.map((point) => {
    const radius = (point.score / 100) * maxRadius;
    return `${(center + Math.cos(point.angle) * radius).toFixed(2)},${(center + Math.sin(point.angle) * radius).toFixed(2)}`;
  }).join(" ");
  const weightPolygon = axis.map((point) => {
    const radius = (point.weight / 30) * maxRadius;
    return `${(center + Math.cos(point.angle) * radius).toFixed(2)},${(center + Math.sin(point.angle) * radius).toFixed(2)}`;
  }).join(" ");

  return (
    <div className="h-80 rounded-2xl border border-[#16314a] bg-slate-950/25 p-3">
      <svg className="size-full" viewBox="0 0 100 100" role="img" aria-label="Radar maturité">
        {[0.25, 0.5, 0.75, 1].map((ratio) => (
          <circle key={ratio} cx={center} cy={center} r={maxRadius * ratio} fill="none" stroke="#1d3a55" strokeWidth="0.5" />
        ))}
        {axis.map((point) => (
          <g key={point.label}>
            <line x1={center} y1={center} x2={point.x} y2={point.y} stroke="#1d3a55" strokeWidth="0.5" />
            <text x={center + Math.cos(point.angle) * 46} y={center + Math.sin(point.angle) * 46} fill="#cbd5e1" fontSize="3.5" textAnchor="middle" dominantBaseline="middle">{point.label}</text>
          </g>
        ))}
        <polygon points={weightPolygon} fill="#a855f7" fillOpacity="0.10" stroke="#a855f7" strokeWidth="0.9" />
        <polygon points={scorePolygon} fill="#22c55e" fillOpacity="0.18" stroke="#22c55e" strokeWidth="1" />
      </svg>
    </div>
  );
}

export function MultiLineScores({ data }: { data: Point[] }) {
  const series = [
    ["discipline", "#22c55e"],
    ["risk", "#84cc16"],
    ["decisions", "#a855f7"],
    ["patience", "#f59e0b"],
    ["global", "#0ea5e9"],
  ] as const;

  return (
    <div className="h-64 rounded-2xl border border-[#16314a] bg-slate-950/25 p-3">
      <svg className="size-full" viewBox="0 0 100 42" preserveAspectRatio="none" role="img" aria-label="Évolution scores">
        {[8, 18, 28, 38].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="#143047" strokeWidth="0.35" vectorEffect="non-scaling-stroke" />)}
        {series.map(([key, color]) => (
          <polyline key={key} points={getSvgPoints(data, key, 42).line} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-400">{series.map(([key, color]) => <span key={key} className="flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: color }} />{key}</span>)}</div>
    </div>
  );
}

export function Donut({ value, colors = ["#22c55e", "#0ea5e9", "#8b5cf6"] }: { value: number; colors?: string[] }) {
  const safeValue = Math.max(0, Math.min(100, value));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dash = (safeValue / 100) * circumference;

  return (
    <div className="relative h-28 w-full">
      <svg className="size-full" viewBox="0 0 112 112" role="img" aria-label={`Score ${safeValue}%`}>
        <circle cx="56" cy="56" r={radius} fill="none" stroke="#1e293b" strokeWidth="10" />
        <circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke={colors[0]}
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
          strokeWidth="10"
          style={{ transform: "rotate(-90deg)", transformOrigin: "56px 56px" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center font-mono text-xl font-bold text-white">{safeValue}%</div>
    </div>
  );
}

export function ResultDistribution({ data = [] }: { data?: Array<{ bucket: string; trades: number }> }) {
  if (!data.length) {
    return <div className="h-52"><EmptyChart label="Distribution disponible après backtest réel" /></div>;
  }

  const max = Math.max(1, ...data.map((item) => item.trades));

  return (
    <div className="flex h-52 items-end gap-2 rounded-2xl border border-[#16314a] bg-slate-950/25 p-4">
      {data.map((item) => (
        <div key={item.bucket} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div className="flex h-32 w-full items-end">
            <div className="w-full rounded-t-lg bg-violet-400/80 shadow-[0_0_18px_rgba(168,85,247,0.24)]" style={{ height: `${Math.max(6, (item.trades / max) * 100)}%` }} title={`${item.bucket}: ${item.trades}`} />
          </div>
          <span className="truncate text-[10px] text-slate-500">{item.bucket}</span>
        </div>
      ))}
    </div>
  );
}

export function HeatmapGrid({ values = [] }: { values?: number[][] }) {
  if (!values.length) {
    return <EmptyChart label="Heatmap disponible après historique réel" />;
  }

  const months = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];
  return (
    <div className="grid grid-cols-12 gap-1 text-center text-[10px]">
      {months.map((month) => <div key={month} className="text-slate-500">{month}</div>)}
      {values.flat().map((value, index) => (
        <div key={index} className="rounded-md px-1 py-2 font-mono" style={{ background: value >= 0 ? `rgba(34,197,94,${Math.min(0.75, 0.15 + Math.abs(value) / 12)})` : `rgba(239,68,68,${Math.min(0.75, 0.15 + Math.abs(value) / 12)})`, color: "white" }}>
          {value > 0 ? "+" : ""}{value}
        </div>
      ))}
    </div>
  );
}
