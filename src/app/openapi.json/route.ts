import { openApiSpec } from "@/lib/api/openapi";

/** GET /openapi.json: the OpenAPI 3.1 description of the public API (readable from any origin). */
export function GET() {
  return Response.json(openApiSpec, { headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=3600" } });
}
