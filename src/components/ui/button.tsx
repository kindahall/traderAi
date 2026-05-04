import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        default: "border-sky-400/40 bg-sky-500/15 text-sky-100 shadow-[0_0_24px_rgba(14,165,233,0.18)] hover:bg-sky-500/25",
        ghost: "border-white/10 bg-white/[0.03] text-slate-200 hover:border-sky-400/40 hover:bg-sky-500/10",
        danger: "border-red-500/70 bg-red-500/10 text-red-200 shadow-[0_0_24px_rgba(239,68,68,0.16)] hover:bg-red-500/20",
        success: "border-emerald-500/50 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25",
        ai: "border-violet-500/50 bg-violet-500/15 text-violet-100 hover:bg-violet-500/25",
        warning: "border-amber-500/50 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10",
        lg: "h-12 px-6 text-base",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} type={type} {...props} />;
}
