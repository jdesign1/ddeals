import { AlertTriangle, Clock3, Info, ShieldCheck } from "lucide-react";
import type { AssessmentVerdict } from "@dodgey-deals/shared";

export const VERDICT_BADGE: Record<AssessmentVerdict, { label: string; className: string; icon: typeof ShieldCheck }> = {
  "Real Saver": { label: "Safe to buy", className: "dd-badge-fair", icon: ShieldCheck },
  "Dodgy Deal": { label: "Don't buy", className: "dd-badge-alert", icon: AlertTriangle },
  "Fair Price": { label: "It's been cheaper", className: "dd-badge-dodgy", icon: Info },
  "Early read": { label: "Early flag", className: "dd-badge-neutral", icon: Clock3 },
  "Limited history": { label: "Limited history", className: "dd-badge-neutral", icon: Clock3 },
};

export function getVerdictTitle(verdict: AssessmentVerdict): string {
  if (verdict === "Dodgy Deal") return "Dodgy discount";
  if (verdict === "Early read" || verdict === "Limited history") return "Limited Price History";
  return verdict;
}
