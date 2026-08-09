import type { Metadata } from "next";
import { Geist, Geist_Mono, Manrope } from "next/font/google";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import { AuthProvider } from "@/lib/auth-context";
import { HeaderOverrideProvider } from "@/lib/header-context";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Prototype/index.html's "Dodgy Deal · Mobile UI Kit" uses Manrope for
// display/heading text (its Tailwind config's `font-display`), which
// AppHeader's title reuses here — see globals.css's `--font-display` token.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["500", "700", "800"],
});

export const metadata: Metadata = {
  title: "Dodgy Deal",
  description: "Real savings vs dodgy fake discounts, across NZ supermarkets.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="h-dvh flex flex-col overflow-hidden">
        <AuthProvider>
          <HeaderOverrideProvider>
            <AppHeader />
            <div className="flex-1 overflow-y-auto">{children}</div>
            <BottomNav />
          </HeaderOverrideProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
