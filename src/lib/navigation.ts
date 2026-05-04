import {
  AlertTriangle,
  BarChart3,
  Home,
  NotebookText,
  Settings,
  Shield,
  Target,
  Users,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavigationStatus = "active" | "locked";
export type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  status: NavigationStatus;
  matchHrefs?: readonly string[];
};

export const navigation: NavigationItem[] = [
  { label: "Cockpit", href: "/", icon: Home, status: "active" },
  { label: "Marchés", href: "/markets", icon: BarChart3, status: "active" },
  { label: "Agents", href: "/agents", icon: Users, status: "active", matchHrefs: ["/agents/new"] },
  { label: "Stratégies", href: "/strategies", icon: Target, status: "active", matchHrefs: ["/strategies/new", "/ai-architect", "/backtests"] },
  { label: "Journal", href: "/journal", icon: NotebookText, status: "active", matchHrefs: ["/decision-replay", "/weekly-postmortem"] },
  { label: "Risque", href: "/risk", icon: Shield, status: "active", matchHrefs: ["/alerts", "/rules", "/human-validation", "/crisis-simulator"] },
  { label: "Progression", href: "/capital-progress", icon: WalletCards, status: "active", matchHrefs: ["/maturity"] },
  { label: "Paramètres", href: "/settings", icon: Settings, status: "active", matchHrefs: ["/llm-providers", "/openclaw"] },
] as const;

export const topbarStatus = {
  agent: "Alpha-01",
  mode: "Paper Trading",
  capital: "10 $",
  autonomy: "ACTIVÉ",
  emergency: "Arrêt d'urgence",
};

export const quickWarnings = [
  { label: "Live verrouillé", icon: AlertTriangle },
];
