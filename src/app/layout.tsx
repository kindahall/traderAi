import type { Metadata } from "next";
import { DashboardShell } from "@/components/layout/DashboardShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Trader AI",
  description: "Cockpit premium de supervision, audit, risque et configuration multi-LLM pour agent trader autonome.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <DashboardShell>{children}</DashboardShell>
      </body>
    </html>
  );
}
