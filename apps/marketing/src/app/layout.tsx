import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dodgy Deal — Know when the special is actually special",
  description: "Compare grocery prices across NZ supermarkets, check price history, and spot the real saving.",
  metadataBase: new URL("https://dodgydeal.co.nz"),
  openGraph: {
    title: "Dodgy Deal — Better grocery decisions for Aotearoa",
    description: "Compare current prices, price history, and deal ratings across NZ supermarkets.",
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
