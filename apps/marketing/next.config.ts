import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@dodgey-deals/shared"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive, nosnippet",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
