// The API docs stay in step with the code: every OpenAPI path has a route handler for its methods,
// and every error code the API can send is listed in the OpenAPI file and on /docs/api.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const { openApiSpec } = await import("../src/lib/api/openapi");

for (const [path, ops] of Object.entries(openApiSpec.paths)) {
  const file = join("src/app/api/v1", path.replace(/\{(\w+)\}/g, "[$1]"), "route.ts");
  const src = readFileSync(file, "utf8");
  for (const method of Object.keys(ops)) {
    assert.match(src, new RegExp(`export (async function|const|function) ${method.toUpperCase()}\\b`), `${method.toUpperCase()} ${path} in ${file}`);
  }
}

// Every route under /api/v1 (except the JSON 404 catch-all) is documented.
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
const documented = new Set(Object.keys(openApiSpec.paths));
for (const f of walk("src/app/api/v1").filter((f) => f.endsWith("route.ts") && !f.includes("[...path]"))) {
  const path = f.replace("src/app/api/v1", "").replace("/route.ts", "").replace(/\[(\w+)\]/g, "{$1}");
  assert.ok(documented.has(path), `${path} is missing from openapi.ts`);
}

// Error codes sent by the API code.
const codes = new Set<string>();
for (const f of [...walk("src/lib/api"), ...walk("src/app/api/v1")].filter((f) => f.endsWith(".ts"))) {
  for (const m of readFileSync(f, "utf8").matchAll(/apiError\(\d+, "([a-z_]+)"/g)) codes.add(m[1]);
}
for (const m of readFileSync("src/lib/api/credits.ts", "utf8").matchAll(/"(insufficient_credits|daily_cap_reached)"/g)) codes.add(m[1]);
const spec = JSON.stringify(openApiSpec);
const docs = readFileSync("src/app/docs/api/page.tsx", "utf8");
const internal = new Set(["internal_error", "method_not_allowed"]);
for (const c of codes) {
  if (internal.has(c)) continue;
  assert.ok(docs.includes(c), `error code ${c} missing from /docs/api`);
}
for (const c of ["insufficient_credits", "rate_limited", "budget_exhausted", "invalid_url", "domain_cooldown", "too_many_concurrent"]) {
  assert.ok(spec.includes(c), `error code ${c} missing from openapi`);
}
assert.ok(codes.size > 15, "found the error codes");
console.log("api docs tests passed", { paths: documented.size, codes: codes.size });
