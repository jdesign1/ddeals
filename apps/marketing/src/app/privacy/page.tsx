import type { Metadata } from "next";
import { LegalDocument } from "../legal/LegalDocument";

export const metadata: Metadata = {
  title: "Privacy policy | Dodgy Deal",
  description: "How Dodgy Deal collects, uses, stores, and protects personal information.",
};

export default function PrivacyPage() {
  return <LegalDocument type="privacy" />;
}
