import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Report an incorrect deal | Dodgy Deal",
  description: "Report an incorrect price, promotion, or product detail in Dodgy Deal.",
};

export default function ReportDealLayout({ children }: { children: ReactNode }) {
  return children;
}
