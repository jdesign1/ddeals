import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Terms of use | Dodgy Deal",
  description: "The terms that apply when you use the Dodgy Deal app and related services.",
};

export default function TermsLayout({ children }: { children: ReactNode }) {
  return children;
}
