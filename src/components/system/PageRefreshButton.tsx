"use client";

import { RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function PageRefreshButton({ label = "Actualiser" }: { label?: string }) {
  const router = useRouter();

  return (
    <Button onClick={() => router.refresh()} variant="ghost">
      <RefreshCcw className="size-4" />
      {label}
    </Button>
  );
}
