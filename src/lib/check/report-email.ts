import "server-only";
import { sendEmail } from "@/lib/brevo";
import { site } from "@/lib/site";
import { SIGNAL_LABELS } from "./labels";
import { unlockToken } from "./unlock";
import type { StoredCheck } from "./run";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const LEVEL_COLORS: Record<string, string> = {
  low: "#047857",
  moderate: "#b45309",
  high: "#dc2626",
};

const muted = "color:#57534e";

/** The full Quick Check, laid out for email clients (tables and inline styles only). */
export function quickReportHtml(id: string, check: StoredCheck): string {
  const a = check.analysis;
  const link = `${site.url}/report/${id}?u=${unlockToken(id)}`;
  const deepLink = `${site.url}/report/${id}#deep-report`;
  const d = escape(check.domain);
  const level = (lvl: string) =>
    `<span style="font-size:12px;font-weight:600;text-transform:capitalize;color:${LEVEL_COLORS[lvl] ?? "#57534e"}">${escape(lvl)}</span>`;
  const urls = (list: string[]) =>
    list.length
      ? `<p style="margin:6px 0 0;font-size:13px">${list
          .slice(0, 3)
          .map((u) => `<a href="${escape(u)}" style="color:#dc2626">${escape(u.replace(/^https?:\/\//, ""))}</a>`)
          .join("<br>")}</p>`
      : "";

  const body = !a
    ? `<p style="margin:0 0 12px;line-height:1.6;${muted}">Your robots.txt blocks crawlers from your homepage, so we couldn't analyze ${d}. Allow SpamlyzeBot and run the check again.</p>`
    : `<p style="margin:0 0 4px;font-size:15px">Estimated spam risk: <strong style="font-size:20px">${a.riskScore}/100</strong> ${level(a.riskLevel)}</p>
<p style="margin:0 0 16px;font-size:13px;${muted}">Estimate from ${check.pagesAnalyzed} sampled pages${
        check.metrics.sitemapUrlCount ? ` out of ${(check.metrics.sitemapUrlCount + 1).toLocaleString("en-US")}` : ""
      }.</p>
<p style="margin:0 0 24px;line-height:1.6">${escape(a.summary)}</p>
<h2 style="margin:0 0 12px;font-size:18px">Top 3 things to fix</h2>
${a.topIssues
  .map(
    (t, i) => `<div style="border:1px solid #e7e5e4;border-radius:12px;padding:16px;margin:0 0 12px">
<p style="margin:0 0 6px;font-weight:600">${i + 1}. ${escape(t.title)}</p>
<p style="margin:0 0 6px;line-height:1.5;font-size:14px;${muted}">${escape(t.why)}</p>
<p style="margin:0;line-height:1.5;font-size:14px"><strong>Fix:</strong> ${escape(t.fix)}</p>${urls(t.exampleUrls)}
</div>`,
  )
  .join("")}
<h2 style="margin:24px 0 12px;font-size:18px">Spam signals</h2>
${a.signals
  .map(
    (s) => `<div style="border-top:1px solid #e7e5e4;padding:12px 0">
<p style="margin:0 0 4px;font-weight:600">${escape(SIGNAL_LABELS[s.id] ?? s.id)} &nbsp;${level(s.level)}</p>
<p style="margin:0;line-height:1.5;font-size:14px;${muted}">${escape(s.finding)}</p>${urls(s.exampleUrls)}
</div>`,
  )
  .join("")}
<div style="background:#fef2f2;border-radius:12px;padding:16px;margin:20px 0 0">
<p style="margin:0 0 6px;font-weight:600">Want the exact pages to fix?</p>
<p style="margin:0 0 10px;line-height:1.5;font-size:14px;${muted}">This check only saw ${check.pagesAnalyzed} pages. The Deep Report reviews your site page by page, adds your Search Console data and gives you a prioritized action plan.</p>
<a href="${deepLink}" style="color:#dc2626;font-weight:600">See the Deep Report →</a>
</div>`;

  return `<!doctype html><html><body style="margin:0;background:#fafaf9;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1917">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e7e5e4;border-radius:16px">
<tr><td style="padding:32px">
<p style="margin:0 0 24px;font-weight:600;font-size:16px"><span style="display:inline-block;background:#dc2626;color:#fff;border-radius:6px;width:24px;height:24px;line-height:24px;text-align:center;margin-right:8px">S</span>Spamlyze</p>
<h1 style="margin:0 0 16px;font-size:22px">Your detailed Quick Check for ${d}</h1>
${body}
<p style="margin:28px 0 8px"><a href="${link}" style="background:#dc2626;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;display:inline-block">Open it on Spamlyze</a></p>
<p style="margin:16px 0 0;font-size:13px;line-height:1.5;${muted}">You asked for this detailed Quick Check on spamlyze.com. We'll also email you when Google rolls out a spam update, so you can check ${d} again. Every alert has a one-click unsubscribe link.</p>
</td></tr></table>
<p style="font-size:12px;${muted};margin-top:16px">Spamlyze · ${escape(site.contactEmail)} · An estimate from a small sample of public pages, not a guarantee. Not affiliated with Google.</p>
</td></tr></table></body></html>`;
}

export function sendQuickReport(to: string, id: string, check: StoredCheck) {
  const subject = check.analysis
    ? `Your detailed Quick Check for ${check.domain}: ${check.analysis.riskScore}/100`
    : `Your Quick Check for ${check.domain}`;
  return sendEmail(to, subject, quickReportHtml(id, check));
}
