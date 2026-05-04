"use client";

import { Children, isValidElement, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { StatusBadge } from "@/components/ui/dashboard";
import { cn } from "@/lib/utils";

type Tone = "success" | "danger" | "warning" | "info" | "ai" | "neutral";

export type TabbedContentTab = {
  id: string;
  label: string;
  badge?: string;
  tone?: Tone;
  icon?: ReactNode;
};

type TabbedContentProps = {
  children: ReactNode;
  className?: string;
  defaultTab?: string;
  tabs: TabbedContentTab[];
};

type TabbedPanelProps = {
  children: ReactNode;
  id: string;
};

export function TabbedContent({ children, className, defaultTab, tabs }: TabbedContentProps) {
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.id ?? "");
  const panels = useMemo(
    () => Children.toArray(children).filter((child): child is ReactElement<TabbedPanelProps> => isValidElement<TabbedPanelProps>(child)),
    [children],
  );
  const activePanel = panels.find((panel) => panel.props.id === activeTab) ?? panels[0];

  return (
    <div className={cn("space-y-4", className)}>
      <div className="rounded-2xl border border-[#16314a] bg-slate-950/60 p-2 shadow-[0_18px_48px_rgba(0,0,0,0.22)] backdrop-blur-xl">
        <div className="flex gap-2 overflow-x-auto" role="tablist">
          {tabs.map((tab) => {
            const selected = tab.id === activeTab;

            return (
              <button
                aria-controls={`panel-${tab.id}`}
                aria-selected={selected}
                className={cn(
                  "inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition",
                  selected ? "border-sky-400/70 bg-sky-500/18 text-white shadow-[0_0_22px_rgba(14,165,233,0.16)]" : "border-transparent bg-white/[0.025] text-slate-300 hover:border-sky-400/40 hover:text-sky-100",
                )}
                id={`tab-${tab.id}`}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                title={tab.label}
                type="button"
              >
                {tab.icon ? <span className="shrink-0 text-sky-300">{tab.icon}</span> : null}
                <span>{tab.label}</span>
                {tab.badge ? <StatusBadge className="px-1.5 py-0.5" tone={tab.tone ?? "neutral"}>{tab.badge}</StatusBadge> : null}
              </button>
            );
          })}
        </div>
      </div>

      {activePanel ? (
        <div aria-labelledby={`tab-${activePanel.props.id}`} id={`panel-${activePanel.props.id}`} role="tabpanel">
          {activePanel}
        </div>
      ) : null}
    </div>
  );
}

export function TabbedPanel({ children }: TabbedPanelProps) {
  return <>{children}</>;
}
