import Link from "next/link";
import { ArrowRight, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checklist, GlassCard, InfoHint, SectionTitle, StatusBadge } from "@/components/ui/dashboard";

type V1LockedPageProps = {
  title: string;
  focus: string;
  unlocks: string[];
};

const CORE_LINKS = [
  { label: "Vue d'ensemble", href: "/" },
  { label: "Marchés", href: "/markets" },
  { label: "Agents", href: "/agents" },
  { label: "Journal", href: "/journal" },
  { label: "Risque", href: "/risk" },
  { label: "OpenClaw", href: "/openclaw" },
  { label: "LLM", href: "/llm-providers" },
  { label: "Paramètres", href: "/settings" },
];

export function V1LockedPage({ title, focus, unlocks }: V1LockedPageProps) {
  return (
    <>
      <SectionTitle title={title} subtitle="Page verrouillée volontairement pour stabiliser la V1 fonctionnelle." icon={<Lock />} />
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <GlassCard glow>
          <div className="mb-4 flex items-center gap-2">
            <StatusBadge tone="warning"><Lock className="size-3" /> Roadmap</StatusBadge>
            <span className="text-sm text-slate-400">{focus}</span>
          </div>
          <Checklist
            items={unlocks.map((label) => ({
              label,
              status: "pending" as const,
            }))}
          />
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/markets"><Button><ArrowRight className="size-4" /> Retour au cockpit V1</Button></Link>
            <Link href="/settings"><Button variant="ghost">État système</Button></Link>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="mb-4 flex items-center gap-2 font-bold text-white">
            <ShieldCheck className="size-5 text-emerald-300" />
            Pages V1 actives
            <InfoHint content="Ces pages restent les seules considérées fonctionnelles pour le socle actuel." />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {CORE_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="rounded-xl border border-[#16314a] bg-white/[0.03] px-3 py-2 text-sm text-slate-200 transition hover:border-sky-400/50 hover:bg-sky-500/10">
                {link.label}
              </Link>
            ))}
          </div>
        </GlassCard>
      </div>
    </>
  );
}
