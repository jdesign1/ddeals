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
  },
};

export default nextConfig;
