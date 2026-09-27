import type { Metadata } from "next";
import { LegalDocument } from "../legal/LegalDocument";

export const metadata: Metadata = {
  title: "Terms of use | Dodgy Deal",
  description: "The terms that apply when you use the Dodgy Deal app and related services.",
};

export default function TermsPage() {
  return <LegalDocument type="terms" />;
}
