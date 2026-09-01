import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Product image URLs come from the live retailer catalogue. Keep this
    // list explicit so Next's optimizer can proxy and resize known sources
    // without allowing arbitrary remote hosts.
    remotePatterns: [
      { protocol: "https", hostname: "assets.woolworths.com.au" },
      { protocol: "https", hostname: "a.fsimg.co.nz" },
      { protocol: "https", hostname: "placehold.co" },
    ],
    // Product photos are independent of the frequently changing price data,
    // so retain their transformed CDN variants for 30 days. This reduces
    // stale re-transformations without changing catalogue refresh behavior.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    // Keep one browser format so the same remote image does not create
    // separate AVIF/WebP transformation variants.
    formats: ["image/webp"],
    // The app is capped at 480px wide. These are the only responsive widths
    // needed for its 1x/2x/3x mobile cards, instead of Next's desktop-wide
    // defaults. Fixed thumbnail widths are listed separately below.
    deviceSizes: [384, 640, 768],
    imageSizes: [56, 64, 96, 112, 128, 192, 256],
    // All current optimized images use the default quality; keep the
    // allowlist explicit so future callers cannot create extra variants.
    qualities: [75],
  },
};

export default nextConfig;
