import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Public API: https://spamlyze.com/v1/... is served by the route handlers in src/app/api/v1.
  rewrites() {
    return [{ source: "/v1/:path*", destination: "/api/v1/:path*" }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
