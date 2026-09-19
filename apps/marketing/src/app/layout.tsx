import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dodgy Deal — Know when a supermarket deal is actually a deal",
  description: "Compare grocery prices across New Zealand supermarkets and see the context behind the discount.",
  metadataBase: new URL("https://dodgydeal.co.nz"),
  openGraph: {
    title: "Dodgy Deal — Better grocery decisions for Aotearoa",
    description: "Compare current prices and price history across NZ supermarkets.",
    url: "https://dodgydeal.co.nz",
    siteName: "Dodgy Deal",
    type: "website",
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      noarchive: true,
      nosnippet: true,
    },
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
