import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Public API: https://spamlyze.com/v1/... is served by the route handlers in src/app/api/v1.
  rewrites() {
    return [
      { source: "/v1/:path*", destination: "/api/v1/:path*" },
      // Hosted MCP server, served by src/app/api/mcp.
      { source: "/mcp", destination: "/api/mcp" },
      // MCP directory files. Served from src/app/api/well-known: a ".well-known" folder in
      // src/app is a hidden folder that the App Hosting deployment may not carry over.
      { source: "/.well-known/mcp-registry-auth", destination: "/api/well-known/mcp-registry-auth" },
      { source: "/.well-known/mcp/server-card.json", destination: "/api/well-known/mcp-server-card" },
    ];
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
