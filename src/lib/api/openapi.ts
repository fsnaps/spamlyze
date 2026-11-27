import { site } from "@/lib/site";

// OpenAPI 3.1 description of the public API, served at /openapi.json and used by /docs/api.
// Keep it in step with src/app/api/v1: scripts/test-api-docs.mts checks that every path here has a route.

const money = { type: "object", properties: { cents: { type: "integer" }, currency: { type: "string", const: "usd" } }, required: ["cents", "currency"] };
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: unknown, description: string) => ({ description, content: { "application/json": { schema } } });
const err = (description: string) => json(ref("Error"), description);
const hit = { type: "string", enum: ["yes", "no", "unsure"], description: "Optional: did the site lose Google traffic after a spam update?" };
const idempotencyKey = {
  name: "Idempotency-Key",
  in: "header",
  required: false,
  description: "Any unique string (max 255 chars). A retry with the same key and body returns the first response without charging again, for 24 h.",
  schema: { type: "string", maxLength: 255 },
};
const common = {
  "401": err("Missing, invalid or revoked API key"),
  "429": err("rate_limited (60 requests per minute per key) or daily_cap_reached. See the Retry-After header."),
  "503": err("api_not_open, budget_exhausted, busy or unavailable: retry later (Retry-After when known)."),
};

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Spamlyze API",
    version: "1.0.0",
    description:
      "Check websites against Google's spam policies. Requests are paid from a prepaid balance in US dollars. " +
      `Get a key at ${site.url}/account. Full guide: ${site.url}/docs/api`,
    contact: { email: site.contactEmail },
    termsOfService: `${site.url}/terms#api`,
  },
  servers: [{ url: `${site.url}/v1` }],
  security: [{ bearer: [] }],
  paths: {
    "/account": {
      get: {
        operationId: "getAccount",
        summary: "Balance, daily cap and prices",
        description: "Free.",
        responses: { "200": json(ref("Account"), "The account of this key"), ...common },
      },
    },
    "/checks": {
      post: {
        operationId: "createQuickCheck",
        summary: "Run a Quick Check ($0.15)",
        description:
          "Estimates spam risk from a sample of about 15 pages. Takes 30 to 45 s and answers when done. The same domain within 24 h is served from cache (still charged). " +
          "Read coverage.scoreScope: on a large site the score only describes the pages checked. Credited back to your balance automatically when no analysis comes out.",
        parameters: [idempotencyKey],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", properties: { url: { type: "string", example: "example.com" }, hitBySpamUpdate: hit }, required: ["url"] },
            },
          },
        },
        responses: {
          "201": json(ref("QuickCheck"), "The Quick Check, with what was charged and the new balance"),
          "400": err("invalid_body, invalid_url or invalid_hit_by_spam_update (not charged)"),
          "402": err("insufficient_credits (not charged)"),
          "422": err("robots_blocked or analysis_failed (not charged), or idempotency_key_reused"),
          "409": err("idempotency_in_progress"),
          ...common,
          "429": err("too_many_concurrent (3 Quick Checks at once per account), rate_limited or daily_cap_reached. See the Retry-After header."),
        },
      },
    },
    "/checks/{id}": {
      get: {
        operationId: "getQuickCheck",
        summary: "Read a Quick Check you ran",
        description: "Free.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": json(ref("QuickCheck"), "The Quick Check"), "404": err("not_found"), ...common },
      },
    },
    "/reports": {
      post: {
        operationId: "createDeepReport",
        summary: "Start a Deep Report ($12), with the site's Search Console data",
        description:
          "Judges every page of the site (up to maxPages, max 500) and writes an action plan. With the owner's Google Search Console, it also uses real clicks: " +
          "whether each Google update cut traffic, and which pages lost clicks (reviewed first, at the top of the plan). " +
          "The response has searchConsole.connectUrl: send it to the site owner. " +
          'With searchConsole "wait", the report starts only once Search Console is connected, for up to 72 h; then it runs without it ("run", default) ' +
          'or is cancelled and the $12 go back to your balance ("cancel"). Nothing runs, and nothing is spent on analysis, while it waits. ' +
          "Without it, the report starts at once and connecting later updates it for free (event report.updated). " +
          "Answers 202 at once; the report takes 5 to 30 minutes once started. Poll GET /reports/{id} or set a webhook. Credited back if it fails. One report per domain per hour.",
        parameters: [idempotencyKey],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  url: { type: "string", example: "example.com" },
                  maxPages: { type: "integer", minimum: 10, maximum: 500, default: 500 },
                  searchConsole: { type: "string", enum: ["wait"], description: "Wait for the owner to connect Search Console before starting." },
                  onSearchConsoleTimeout: { type: "string", enum: ["run", "cancel"], default: "run", description: 'With searchConsole "wait": after 72 h without Search Console.' },
                  hitBySpamUpdate: hit,
                },
                required: ["url"],
              },
            },
          },
        },
        responses: {
          "202": { ...json(ref("DeepReport"), "Started. The Location header points at the report."), headers: { Location: { schema: { type: "string" } } } },
          "400": err("invalid_body, invalid_url, invalid_max_pages, invalid_search_console or invalid_hit_by_spam_update (not charged)"),
          "402": err("insufficient_credits (not charged)"),
          "409": err("idempotency_in_progress"),
          "422": err("site_unreachable, robots_blocked or bot_challenge (not charged), or idempotency_key_reused"),
          "429": err("domain_cooldown, too_many_running, too_many_waiting, rate_limited or daily_cap_reached (not charged)"),
          "401": common["401"],
          "503": common["503"],
        },
      },
    },
    "/reports/{id}": {
      get: {
        operationId: "getDeepReport",
        summary: "Progress, then results of a Deep Report",
        description: "Free. analysis and metrics appear once status is done; add pages=true for the verdict of every page.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "pages", in: "query", required: false, schema: { type: "boolean" } },
        ],
        responses: { "200": json(ref("DeepReport"), "The report"), "404": err("not_found"), ...common },
      },
    },
    "/ledger": {
      get: {
        operationId: "listLedger",
        summary: "Credit movements, newest first",
        description: "Free.",
        parameters: [{ name: "limit", in: "query", required: false, schema: { type: "integer", default: 50, maximum: 200 } }],
        responses: {
          "200": json({ type: "object", properties: { data: { type: "array", items: ref("LedgerEntry") } } }, "Ledger entries"),
          ...common,
        },
      },
    },
    "/webhook": {
      get: {
        operationId: "getWebhook",
        summary: "Webhook URL, signing secret and recent deliveries",
        responses: { "200": json(ref("Webhook"), "The webhook"), ...common },
      },
      put: {
        operationId: "setWebhook",
        summary: "Set the URL that receives report events",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { url: { type: "string", format: "uri" } }, required: ["url"] } } },
        },
        responses: { "200": json(ref("Webhook"), "Saved. The secret stays the same when only the URL changes."), "400": err("invalid_webhook_url"), ...common },
      },
      delete: {
        operationId: "deleteWebhook",
        summary: "Stop sending events and forget the secret",
        responses: { "200": json({ type: "object" }, "Removed"), ...common },
      },
    },
  },
  webhooks: {
    reportEvent: {
      post: {
        summary: "report.done, report.failed or report.updated (Search Console added to a finished report)",
        description:
          "Sent to your webhook URL. Verify the Spamlyze-Signature header (t=<unix>,v1=<hex>): HMAC-SHA256 of `${t}.${rawBody}` with your whsec_ secret. " +
          "Retried up to 6 times over about 9 hours until you answer 2xx. Deduplicate with the event id.",
        requestBody: { content: { "application/json": { schema: ref("Event") } } },
        responses: { "200": { description: "Received" } },
      },
    },
  },
  components: {
    securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "Your API key: spz_live_…" } },
    schemas: {
      Error: {
        type: "object",
        properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } }, required: ["code", "message"] } },
        required: ["error"],
      },
      Account: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          email: { type: "string" },
          balance: money,
          dailySpendCap: money,
          spentToday: money,
          prices: { type: "object", properties: { quickCheck: money, deepReport: money } },
          key: { type: "object", properties: { name: { type: "string" }, hint: { type: "string" } } },
        },
      },
      Signal: {
        type: "object",
        properties: {
          id: { type: "string", example: "scaled_content" },
          level: { type: "string", enum: ["low", "moderate", "high"] },
          score: { type: "integer", minimum: 0, maximum: 100 },
          finding: { type: "string" },
          exampleUrls: { type: "array", items: { type: "string" } },
        },
      },
      QuickCheck: {
        type: "object",
        properties: {
          id: { type: "string" },
          object: { type: "string", const: "quick_check" },
          domain: { type: "string" },
          url: { type: "string" },
          createdAt: { type: ["string", "null"], format: "date-time" },
          pagesAnalyzed: { type: "integer" },
          riskScore: { type: ["integer", "null"], minimum: 0, maximum: 100 },
          riskLevel: { type: ["string", "null"], enum: ["low", "moderate", "high", null] },
          summary: { type: ["string", "null"] },
          headline: { type: ["string", "null"], description: "Set when the score is only a sample: show it instead of the bare score." },
          note: { type: "string", description: "Same as coverage.message." },
          coverage: {
            type: "object",
            properties: {
              pagesChecked: { type: "integer" },
              knownPages: { type: ["integer", "null"] },
              pagesNotChecked: { type: ["integer", "null"] },
              percent: { type: ["number", "null"] },
              complete: { type: "boolean" },
              scoreScope: { type: "string", enum: ["whole_site", "sample"] },
              message: { type: "string" },
            },
          },
          signals: { type: "array", items: ref("Signal") },
          topIssues: { type: "array", items: { type: "object", properties: { title: { type: "string" }, why: { type: "string" }, fix: { type: "string" }, exampleUrls: { type: "array", items: { type: "string" } } } } },
          metrics: { type: "object" },
          reportUrl: { type: "string" },
          cached: { type: "boolean" },
          hitBySpamUpdate: { type: ["string", "null"] },
          charged: money,
          balance: money,
        },
      },
      DeepReport: {
        type: "object",
        properties: {
          id: { type: "string" },
          object: { type: "string", const: "deep_report" },
          domain: { type: "string" },
          url: { type: "string" },
          status: { type: "string", enum: ["waiting_for_search_console", "running", "done", "failed"] },
          phase: { type: "string" },
          createdAt: { type: ["string", "null"], format: "date-time" },
          finishedAt: { type: ["string", "null"], format: "date-time" },
          progress: { type: "object", properties: { pagesPlanned: { type: "integer" }, pagesCrawled: { type: "integer" }, pagesAnalyzed: { type: "integer" } } },
          maxPages: { type: "integer" },
          error: { type: ["string", "null"] },
          refunded: { type: "boolean" },
          hitBySpamUpdate: { type: ["string", "null"] },
          searchConsole: {
            type: "object",
            properties: {
              connected: { type: "boolean" },
              connectUrl: { type: ["string", "null"], description: "Link for the site owner (read-only Google access, one-time import). Null once connected." },
              waitUntil: { type: ["string", "null"], format: "date-time" },
              onTimeout: { type: ["string", "null"], enum: ["run", "cancel", null] },
              property: { type: ["string", "null"] },
              importedAt: { type: ["string", "null"] },
              worstUpdate: { type: ["string", "null"], description: "The Google update after which the site lost the most clicks." },
              pagesThatLostClicks: { type: ["integer", "null"] },
            },
          },
          reportUrl: { type: "string" },
          analysis: { type: ["object", "null"], description: "Risk score, signals and the action plan (status done only)." },
          metrics: { type: ["object", "null"] },
          pages: { type: "array", items: { type: "object", properties: { url: { type: "string" }, title: { type: "string" }, words: { type: "integer" }, verdict: { type: ["object", "null"] } } } },
          charged: money,
          balance: money,
        },
      },
      LedgerEntry: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["credit", "charge", "refund"] },
          cents: { type: "integer" },
          balanceAfter: { type: "integer" },
          reason: { type: "string" },
          ref: { type: "string" },
          note: { type: ["string", "null"] },
          createdAt: { type: ["string", "null"], format: "date-time" },
        },
      },
      Webhook: {
        type: "object",
        properties: {
          object: { type: "string", const: "webhook" },
          url: { type: ["string", "null"] },
          secret: { type: ["string", "null"], description: "whsec_…" },
          events: { type: "array", items: { type: "string" } },
          recentDeliveries: { type: "array", items: { type: "object" } },
        },
      },
      Event: {
        type: "object",
        properties: {
          id: { type: "string", example: "evt_abc_done" },
          object: { type: "string", const: "event" },
          type: { type: "string", enum: ["report.done", "report.failed", "report.updated"] },
          createdAt: { type: "string", format: "date-time" },
          data: ref("DeepReport"),
        },
      },
    },
  },
} as const;
