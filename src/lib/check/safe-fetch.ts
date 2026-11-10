import "server-only";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";

export const USER_AGENT = "SpamlyzeBot/0.1 (+https://spamlyze.com)";

const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 4;

export class FetchBlockedError extends Error {}

/** Normalizes user input ("example.com", "http://x/y") into an https/http URL, or throws. */
export function normalizeInputUrl(raw: string): URL {
  const value = raw.trim();
  if (!value || value.length > 2048) throw new FetchBlockedError("Please enter a website address.");
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    throw new FetchBlockedError("That doesn't look like a valid website address.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new FetchBlockedError("Only http and https websites can be checked.");
  }
  if (url.username || url.password) throw new FetchBlockedError("URLs with credentials are not allowed.");
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new FetchBlockedError("Only standard web ports can be checked.");
  }
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".internal") || host === "localhost") {
    throw new FetchBlockedError("Please enter a public website.");
  }
  url.hash = "";
  return url;
}

/** Throws unless every address the host resolves to is a public unicast address. */
async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  if (ipaddr.isValid(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);
    } catch {
      throw new FetchBlockedError(`We couldn't find the website ${hostname}.`);
    }
  }
  if (addresses.length === 0) throw new FetchBlockedError(`We couldn't find the website ${hostname}.`);
  for (const address of addresses) {
    let parsed = ipaddr.parse(address);
    if (parsed.kind() === "ipv6" && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
      parsed = (parsed as ipaddr.IPv6).toIPv4Address();
    }
    if (parsed.range() !== "unicast") throw new FetchBlockedError("Please enter a public website.");
  }
}

export type FetchedPage = {
  url: string; // final URL after redirects
  status: number;
  contentType: string;
  body: string;
};

/**
 * GET a public URL with SSRF protection: every hop (including redirects) must resolve to
 * public addresses, standard ports only, size and time capped.
 */
export async function safeFetch(input: string | URL, timeoutMs = 7000): Promise<FetchedPage> {
  let url = typeof input === "string" ? new URL(input) : new URL(input.toString());
  const deadline = AbortSignal.timeout(timeoutMs);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new FetchBlockedError("Unsupported redirect.");
    if (url.port && url.port !== "80" && url.port !== "443") throw new FetchBlockedError("Unsupported redirect.");
    await assertPublicHost(url.hostname);

    const res = await fetch(url, {
      redirect: "manual",
      signal: deadline,
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xml,text/xml,text/plain;q=0.9,*/*;q=0.5" },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel();
      if (!location) throw new FetchBlockedError("Broken redirect.");
      url = new URL(location, url);
      continue;
    }

    const contentType = res.headers.get("content-type") ?? "";
    const body = await readCapped(res);
    return { url: url.toString(), status: res.status, contentType, body };
  }
  throw new FetchBlockedError("Too many redirects.");
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}
