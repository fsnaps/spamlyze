import { apiError } from "@/lib/api/http";
import { handleMcpPost } from "@/lib/api/mcp";
import { site } from "@/lib/site";

/** https://spamlyze.com/mcp: hosted MCP server (Streamable HTTP, stateless, JSON responses). */
export const POST = handleMcpPost;

// No server-initiated stream and no sessions: GET and DELETE are not offered (allowed by the spec).
const notAllowed = () => apiError(405, "method_not_allowed", "POST JSON-RPC messages to https://spamlyze.com/mcp with your API key.", { allow: "POST" });
export const DELETE = notAllowed;

/** A person opening /mcp in a browser gets the MCP docs; MCP clients get the 405 the spec allows. */
export function GET(request?: Request) {
  const accept = request?.headers.get("accept") ?? "";
  if (accept.includes("text/html")) return Response.redirect(new URL("/docs/mcp", site.url), 307);
  return notAllowed();
}
