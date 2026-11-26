import { apiError } from "@/lib/api/http";
import { handleMcpPost } from "@/lib/api/mcp";

/** https://spamlyze.com/mcp: hosted MCP server (Streamable HTTP, stateless, JSON responses). */
export const POST = handleMcpPost;

// No server-initiated stream and no sessions: GET and DELETE are not offered (allowed by the spec).
const notAllowed = () => apiError(405, "method_not_allowed", "POST JSON-RPC messages to https://spamlyze.com/mcp with your API key.", { allow: "POST" });
export const GET = notAllowed;
export const DELETE = notAllowed;
