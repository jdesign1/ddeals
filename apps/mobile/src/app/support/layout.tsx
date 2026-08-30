import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Contact support | Dodgy Deal",
  description: "Contact the Dodgy Deal support team.",
};

export default function SupportLayout({ children }: { children: ReactNode }) {
  return children;
}
