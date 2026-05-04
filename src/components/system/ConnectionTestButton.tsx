"use client";

import { useState } from "react";
import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

type IntegrityPayload = {
  paperRuntime: {
    status: "fresh" | "stale" | "empty";
  };
  market: {
    label: string;
  };
  dataMode: {
    demoTradesIncluded: boolean;
  };
};

export function ConnectionTestButton({ className }: { className?: string }) {
  const [label, setLabel] = useState("Tester la connexion");
  const [pending, setPending] = useState(false);

  async function testConnection() {
    setPending(true);
    try {
      const response = await fetch("/api/system/integrity", { cache: "no-store" });
      if (!response.ok) {
        setLabel(`Erreur ${response.status}`);
        return;
      }
      const payload = await response.json() as IntegrityPayload;
      setLabel(`${payload.market.label} · paper ${payload.paperRuntime.status} · démo ${payload.dataMode.demoTradesIncluded ? "ON" : "OFF"}`);
      window.dispatchEvent(new Event("system-integrity-refresh"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Button className={className} disabled={pending} onClick={testConnection} variant="ghost">
      <RefreshCcw className="size-4" />
      {label}
    </Button>
  );
}
