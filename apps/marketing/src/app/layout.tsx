import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dodgy Deal — Know when the special is actually special",
  description: "Compare grocery prices across NZ supermarkets, check price history, and spot the real saving.",
  metadataBase: new URL("https://www.dodgydeal.co.nz"),
  openGraph: {
    title: "Dodgy Deal — Better grocery decisions for Aotearoa",
    description: "Compare current prices, price history, and deal ratings across NZ supermarkets.",
    url: "https://www.dodgydeal.co.nz",
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
  return <html lang="en"><body className={inter.variable}>{children}</body></html>;
}
