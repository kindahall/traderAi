"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type KillSwitchState = {
  active: boolean;
  reason: string;
};

type Props = {
  className?: string;
  size?: "sm" | "md" | "lg";
};

export function KillSwitchButton({ className, size = "sm" }: Props) {
  const router = useRouter();
  const [state, setState] = useState<KillSwitchState | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/safety/kill-switch", { cache: "no-store" });
    if (!response.ok) return;
    setState(await response.json() as KillSwitchState);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function toggle() {
    const nextActive = !state?.active;
    if (!nextActive && !window.confirm("Lever l'arrêt d'urgence ? Les cycles paper pourront rouvrir de nouvelles positions.")) {
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/safety/kill-switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          active: nextActive,
          reason: nextActive ? "activation manuelle interface" : "désactivation manuelle interface",
        }),
      });
      if (response.ok) {
        setState(await response.json() as KillSwitchState);
        window.dispatchEvent(new Event("system-integrity-refresh"));
        router.refresh();
      } else {
        setError(`kill-switch ${response.status}`);
      }
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "kill-switch impossible");
    } finally {
      setPending(false);
    }
  }

  const active = Boolean(state?.active);

  return (
    <div className={className}>
      <Button className="w-full" disabled={pending} onClick={toggle} size={size} variant={active ? "warning" : "danger"}>
        {active ? <ShieldCheck className="size-4" /> : <AlertTriangle className="size-4" />}
        {active ? "Lever l'arrêt" : "Arrêt d'urgence"}
      </Button>
      {error ? <span className="mt-2 block text-xs text-red-300">{error}</span> : null}
    </div>
  );
}
