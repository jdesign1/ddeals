import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Privacy policy | Dodgy Deal",
  description: "How Dodgy Deal collects, uses, stores, and protects personal information.",
};

export default function PrivacyLayout({ children }: { children: ReactNode }) {
  return children;
}
