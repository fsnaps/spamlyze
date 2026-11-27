// https://spamlyze.com/.well-known/mcp-registry-auth (rewrite in next.config.ts): proves to the official MCP Registry
// (registry.modelcontextprotocol.io) that we own spamlyze.com, so we can publish com.spamlyze/mcp.
// This is a PUBLIC Ed25519 key. Its private half is the GitHub secret MCP_REGISTRY_PRIVATE_KEY,
// used by .github/workflows/publish-mcp-registry.yml. To rotate: new key pair, new line here, new secret.
const PROOF = "v=MCPv1; k=ed25519; p=tIjoy5n9iDzpgCeUF9DHFZc2j7vL3Tu5HFbtDyZgBAI=";

export function GET() {
  return new Response(PROOF + "\n", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" } });
}
