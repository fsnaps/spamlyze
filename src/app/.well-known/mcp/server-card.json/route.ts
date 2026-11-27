import { MCP_SERVER_INFO, MCP_TOOLS } from "@/lib/api/mcp";
import { site } from "@/lib/site";

// https://spamlyze.com/.well-known/mcp/server-card.json: a static description of the hosted MCP
// server for directories and scanners that read server cards (same tools as tools/list on /mcp).
export function GET() {
  return Response.json(
    {
      serverInfo: MCP_SERVER_INFO,
      description: "Check websites against Google's spam policies: quick risk estimate or a page-by-page Deep Report with Search Console data.",
      url: `${site.url}/mcp`,
      transport: "streamable-http",
      authentication: { required: true, schemes: ["bearer"], description: `API key from ${site.url}/account, sent as Authorization: Bearer spz_live_...` },
      documentation: `${site.url}/docs/mcp`,
      tools: MCP_TOOLS,
      resources: [],
      prompts: [],
    },
    { headers: { "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" } },
  );
}
