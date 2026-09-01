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
    // Product photos are independent of the frequently changing price data
    // and the catalogue supplies a new URL when an image is replaced. Keep
    // transformed variants for a year so stable supermarket imagery is not
    // re-transformed every month.
    minimumCacheTTL: 60 * 60 * 24 * 365,
    // Keep one browser format so the same remote image does not create
    // separate AVIF/WebP transformation variants.
    formats: ["image/webp"],
    // The app is capped at 480px wide. A single 512px responsive candidate
    // covers the larger 1x/2x/3x card requests; the fixed candidates below
    // cover the 56/64px list rows, the 90px single-layout card, and the
    // approximately 240px grid card.
    deviceSizes: [512],
    imageSizes: [64, 96, 256],
    // All current optimized images use the default quality; keep the
    // allowlist explicit so future callers cannot create extra variants.
    qualities: [75],
  },
};

export default nextConfig;
