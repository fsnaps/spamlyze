import "server-only";
import { isHitAnswer } from "@/lib/hit-answers";
import { site } from "@/lib/site";
import { track } from "@/lib/stats";
import { accountSummary } from "./account-summary";
import { createApiCheck } from "./checks";
import { authenticate, type ApiContext } from "./http";
import { createApiReport, getApiReport } from "./reports";

// Hosted MCP server at https://spamlyze.com/mcp (Streamable HTTP transport, stateless, JSON
// responses only: no SSE stream and no session id). The customer's API key goes in the
// Authorization header, and every tool calls the same code as the REST API, so it is billed,
// rate-limited, budget-capped and logged exactly like /v1. One MCP request = one API request.

export const MCP_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;
const SERVER_INFO = { name: "spamlyze", title: "Spamlyze", version: "1.0.0" };

type JsonRpcId = string | number | null;
type JsonRpcRequest = { jsonrpc: "2.0"; id?: JsonRpcId; method: string; params?: Record<string, unknown> };

const hitSchema = {
  type: "string",
  enum: ["yes", "no", "unsure"],
  description: "Optional: did the site lose Google traffic after a spam update?",
};

export const MCP_TOOLS = [
  {
    name: "quick_check",
    title: "Quick Check (spam risk estimate)",
    description:
      "Estimates a website's risk under Google's spam policies from a SAMPLE of about 15 pages (homepage and a few linked pages). " +
      "Takes 30 to 45 seconds and costs $0.15 from the prepaid balance (the same domain within 24 h is served from cache). " +
      "The score only covers the pages checked: read coverage.message. On a large site a low score does not mean the whole site is safe. " +
      "For a page-by-page verdict on the whole site, use start_deep_report.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The site to check, e.g. example.com" },
        hitBySpamUpdate: hitSchema,
      },
      required: ["url"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: "start_deep_report",
    title: "Start a Deep Report",
    description:
      "Starts a Deep Report: every page of the site (up to maxPages, default and maximum 500) is judged against Google's spam policies, " +
      "with a prioritised action plan. It can use the site's Google Search Console data (real clicks before and after each update, " +
      "pages that lost traffic reviewed first): the response has searchConsole.connectUrl, a link for the site owner to open. " +
      'With searchConsole "wait", the report only starts once the owner connects Search Console (up to 72 h, then it runs without it, ' +
      'or with onSearchConsoleTimeout "cancel" the $12 go back to the balance). Without it, the report starts now and the link adds the data later, for free. ' +
      "Costs $12 from the prepaid balance, credited back if the report fails. Returns at once with an id; the report takes 5 to 30 minutes once started. " +
      "Poll it with get_deep_report (no charge). Ask the user before starting one: it is a paid action.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The site to analyse, e.g. example.com" },
        maxPages: { type: "integer", minimum: 10, maximum: 500, description: "Optional page limit (default 500)." },
        searchConsole: { type: "string", enum: ["wait"], description: "Optional: wait for the owner to connect Search Console before starting." },
        onSearchConsoleTimeout: {
          type: "string",
          enum: ["run", "cancel"],
          description: 'With searchConsole "wait": what happens after 72 h without Search Console. "run" (default) or "cancel" (credits back).',
        },
        hitBySpamUpdate: hitSchema,
      },
      required: ["url"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: "get_deep_report",
    title: "Get a Deep Report",
    description:
      "Progress of a Deep Report, then its results once status is done. Free. Set pages to true for the page-by-page verdicts. " +
      "status waiting_for_search_console means it starts when the owner opens searchConsole.connectUrl.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The id returned by start_deep_report." },
        pages: { type: "boolean", description: "Include the verdict of every page (long)." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "get_balance",
    title: "Balance and prices",
    description: "The prepaid balance of this API key's account, today's spend and daily cap, and the current prices. Free.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
] as const;

const rpcResult = (id: JsonRpcId, result: unknown) => ({ jsonrpc: "2.0" as const, id, result });
const rpcError = (id: JsonRpcId, code: number, message: string) => ({ jsonrpc: "2.0" as const, id, error: { code, message } });

/** A tool's answer: the API JSON as text and as structured content, flagged as an error when the API said no. */
async function toolResult(res: Response) {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { code: string; message: string } };
  if (!res.ok || data.error) {
    const e = data.error ?? { code: "error", message: `HTTP ${res.status}` };
    const retry = res.headers.get("retry-after");
    return {
      content: [{ type: "text", text: `${e.message} (${e.code}${retry ? `, retry after ${retry} s` : ""})` }],
      structuredContent: { error: e, status: res.status },
      isError: true,
    };
  }
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data };
}

const badArgs = (message: string) => ({ content: [{ type: "text", text: message }], isError: true });

async function callTool(ctx: ApiContext, name: string, args: Record<string, unknown>) {
  const hit = args.hitBySpamUpdate;
  if (hit != null && !isHitAnswer(hit)) return badArgs('hitBySpamUpdate must be "yes", "no" or "unsure".');
  switch (name) {
    case "quick_check":
      return toolResult(await createApiCheck(ctx, args.url, hit ?? undefined));
    case "start_deep_report":
      return toolResult(
        await createApiReport(ctx, {
          url: args.url,
          maxPages: args.maxPages,
          hitBySpamUpdate: hit,
          searchConsole: args.searchConsole,
          onSearchConsoleTimeout: args.onSearchConsoleTimeout,
        }),
      );
    case "get_deep_report":
      if (typeof args.id !== "string" || !args.id) return badArgs("id is required.");
      return toolResult(await getApiReport(ctx, args.id, args.pages === true));
    case "get_balance":
      return toolResult(Response.json(await accountSummary(ctx)));
    default:
      return null;
  }
}

const httpJson = (body: unknown, status = 200, headers?: HeadersInit) => Response.json(body, { status, headers });

/** Handles one POST to /mcp. */
export async function handleMcpPost(request: Request): Promise<Response> {
  let msg: JsonRpcRequest;
  try {
    msg = await request.json();
  } catch {
    return httpJson(rpcError(null, -32700, "Parse error: send one JSON-RPC message."), 400);
  }
  if (Array.isArray(msg) || !msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return httpJson(rpcError(null, -32600, "Invalid request: send one JSON-RPC 2.0 message (batches are not supported)."), 400);
  }

  // Every message needs a valid key, so an unauthenticated client learns nothing (not even the tools).
  const ctx = await authenticate(request);
  if (ctx instanceof Response) {
    const headers = new Headers(ctx.headers);
    if (ctx.status === 401) headers.set("www-authenticate", `Bearer realm="spamlyze", error="invalid_token"`);
    return new Response(ctx.body, { status: ctx.status, headers });
  }

  const id = msg.id ?? null;
  if (msg.id === undefined) return new Response(null, { status: 202 }); // a notification (e.g. notifications/initialized)

  switch (msg.method) {
    case "initialize": {
      const asked = msg.params?.protocolVersion;
      const version = (MCP_PROTOCOL_VERSIONS as readonly unknown[]).includes(asked) ? (asked as string) : MCP_PROTOCOL_VERSIONS[0];
      return httpJson(
        rpcResult(id, {
          protocolVersion: version,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions:
            "Spamlyze checks websites against Google's spam policies. quick_check ($0.15) is a fast estimate on a sample of pages; " +
            "start_deep_report ($12) analyses the whole site with the owner's Search Console data and must be confirmed with the user first. " +
            `Prices are taken from the prepaid balance of the API key (top up at ${site.url}/account).`,
        }),
      );
    }
    case "ping":
      return httpJson(rpcResult(id, {}));
    case "tools/list":
      return httpJson(rpcResult(id, { tools: MCP_TOOLS }));
    case "tools/call": {
      const name = msg.params?.name;
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      if (typeof name !== "string" || typeof args !== "object" || Array.isArray(args)) {
        return httpJson(rpcError(id, -32602, "Invalid params: name and arguments are required."));
      }
      const result = await callTool(ctx, name, args);
      if (!result) return httpJson(rpcError(id, -32602, `Unknown tool: ${name}`));
      await track({ apiMcpToolCalls: 1 });
      return httpJson(rpcResult(id, result));
    }
    default:
      return httpJson(rpcError(id, -32601, `Method not found: ${msg.method}`));
  }
}
