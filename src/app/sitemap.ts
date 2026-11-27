import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/check", "/privacy", "/terms", "/legal", "/docs/api", "/docs/mcp"].map((path) => ({ url: `${site.url}${path}` }));
}
