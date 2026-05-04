"use client";

import { useState } from "react";
import type { ButtonProps } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LocalActionButtonProps = ButtonProps & {
  actionLabel: string;
};

export function LocalActionButton({ actionLabel, children, onClick, ...props }: LocalActionButtonProps) {
  const [message, setMessage] = useState<string | null>(null);
  const fullWidth = typeof props.className === "string" && props.className.includes("w-full");

  return (
    <span className={cn("inline-flex flex-col items-stretch gap-1", fullWidth && "w-full")}>
      <Button
        {...props}
        onClick={(event) => {
          onClick?.(event);
          setMessage(`${actionLabel} confirmé localement`);
          window.setTimeout(() => setMessage(null), 2600);
        }}
      >
        {children}
      </Button>
      {message ? <span className="text-right text-[11px] font-medium text-emerald-300">{message}</span> : null}
    </span>
  );
}
