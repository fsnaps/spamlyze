import "server-only";
import { sendEmail, sendEmailDetailed } from "@/lib/brevo";
import { deepReportEnabled } from "@/lib/deep/config";
import { deepPricing, formatUsd, promoLastDay, tierFor, tierMaxPages } from "@/lib/pricing";
import { site } from "@/lib/site";
import { coverage, pagesWord } from "./coverage";
import { SIGNAL_LABELS } from "./labels";
import { unlockToken } from "./unlock";
import type { StoredCheck } from "./run";
import { benchmarkFor, rankHeadline, type Benchmark } from "./benchmark";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const LEVEL_COLORS: Record<string, string> = {
  low: "#047857",
  moderate: "#b45309",
  high: "#dc2626",
};

const muted = "color:#57534e";
const n = (x: number) => x.toLocaleString("en-US");

/** When the follow-up goes out after the detailed Quick Check (Brevo schedules up to 72 h ahead). */
export const FOLLOW_UP_HOURS = 60;

function layout(title: string, body: string, footer: string) {
  return `<!doctype html><html><body style="margin:0;background:#fafaf9;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1917">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e7e5e4;border-radius:16px">
<tr><td style="padding:32px">
<p style="margin:0 0 24px;font-weight:600;font-size:16px"><span style="display:inline-block;background:#dc2626;color:#fff;border-radius:6px;width:24px;height:24px;line-height:24px;text-align:center;margin-right:8px">S</span>Spamlyze</p>
<h1 style="margin:0 0 16px;font-size:22px">${title}</h1>
${body}
<p style="margin:24px 0 0;font-size:13px;line-height:1.5;${muted}">${footer}</p>
</td></tr></table>
<p style="font-size:12px;${muted};margin-top:16px">Spamlyze · ${escape(site.contactEmail)} · An estimate from a small sample of public pages, not a guarantee. Not affiliated with Google.</p>
</td></tr></table></body></html>`;
}

/** "all 13 pages of example.com" or "the single page of example.com", once every page was checked. */
function wholeSite(check: StoredCheck): string | null {
  const c = coverage(check.pagesAnalyzed, check.metrics);
  if (!c.complete || c.total === null) return null;
  const d = escape(check.domain);
  return c.total === 1 ? `the single page of ${d}` : `all ${n(c.total)} pages of ${d}`;
}

/** Amber box: how little of the site the Quick Check saw. Green when it saw every page. */
function coverageBox(check: StoredCheck) {
  const c = coverage(check.pagesAnalyzed, check.metrics);
  if (c.complete && c.total !== null) {
    const head = c.total === 1 ? "Your site has a single page, and we checked it" : `All ${n(c.total)} pages checked (100% of your site)`;
    return `<div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:12px;padding:14px 16px;margin:0 0 20px">
<p style="margin:0 0 4px;font-weight:600;color:#065f46">&#10003; ${head}</p>
<p style="margin:0;font-size:14px;line-height:1.5;color:#064e3b">Nothing was extrapolated. The score doesn't use your Search Console traffic yet.</p>
</div>`;
  }
  const head = c.total
    ? `Based on ${check.pagesAnalyzed} of ${n(c.total)} pages (${c.share}% of your site)`
    : `Based on ${check.pagesAnalyzed} ${pagesWord(check.pagesAnalyzed)} only`;
  const rest = c.total
    ? `The other ${n(c.unseen)} ${c.unseen === 1 ? "page wasn't" : "pages weren't"} checked, including any that are losing traffic.`
    : "We found no sitemap, so we can't tell how much of your site that is. Pages losing traffic weren't checked.";
  return `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:14px 16px;margin:0 0 20px">
<p style="margin:0 0 4px;font-weight:600;color:#92400e">&#9888;&#65039; ${head}</p>
<p style="margin:0;font-size:14px;line-height:1.5;color:#78350f">${rest}</p>
</div>`;
}

/** Deep Report offer, priced for this site's size at the given time (promo and deadline included). */
function deepOffer(id: string, check: StoredCheck, at: number, heading: string) {
  const link = `${site.url}/report/${id}#deep-report`;
  const c = coverage(check.pagesAnalyzed, check.metrics);
  const tier = tierFor(check.metrics.sitemapUrlCount);
  const pages =
    c.total === 1 ? "the single page" : c.total && c.total <= tierMaxPages(tier) ? `all ${n(c.total)} pages` : `up to ${tierMaxPages(tier)} pages`;
  if (!deepReportEnabled()) {
    return `<div style="background:#fef2f2;border-radius:12px;padding:20px;margin:24px 0 0">
<p style="margin:0 0 6px;font-weight:600">${heading}</p>
<p style="margin:0 0 12px;line-height:1.5;font-size:14px;${muted}">The Deep Report reviews ${pages} of ${escape(check.domain)} ${c.total === 1 ? "in depth" : "one by one"} and builds your Search Console data into a prioritized action plan.</p>
<a href="${link}" style="color:#dc2626;font-weight:600">Join the Deep Report waitlist →</a>
</div>`;
  }
  const p = deepPricing(at, tier);
  const price = p.promo
    ? `<span style="font-size:22px;font-weight:700">${formatUsd(p.cents)}</span> <s style="${muted}">${formatUsd(p.regularCents)}</s>
<span style="display:inline-block;margin-left:6px;background:#dc2626;color:#fff;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600">${escape(p.promo.label)} -${p.promo.percentOff}%</span>
<br><span style="font-size:13px;color:#b91c1c;font-weight:600">Until ${promoLastDay(p.promo.endsAt)} only</span>`
    : `<span style="font-size:22px;font-weight:700">${formatUsd(p.cents)}</span>`;
  return `<div style="background:#fef2f2;border-radius:12px;padding:20px;margin:24px 0 0">
<p style="margin:0 0 6px;font-weight:600;font-size:17px">${heading}</p>
<p style="margin:0 0 14px;line-height:1.5;font-size:14px;${muted}">The Deep Report reviews ${pages} of ${escape(check.domain)} ${c.total === 1 ? "in depth" : "one by one"}, finds the pages losing clicks in your Search Console and gives you a prioritized action plan with the exact pages to fix. One-time payment, no subscription.</p>
<p style="margin:0 0 14px;line-height:1.4">${price}</p>
<a href="${link}" style="background:#dc2626;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;display:inline-block">Get the Deep Report</a>
</div>`;
}

/** The detailed Quick Check, laid out for email clients (tables and inline styles only). */
/** Where the site sits among all analysed sites: one line and a safest → riskiest bar. */
function rankBox(b: Benchmark | null, score: number): string {
  if (!b) return "";
  const h = rankHeadline(b);
  const color = b.position >= 66 ? "#dc2626" : b.position >= 33 ? "#b45309" : "#047857";
  const left = Math.round(b.position);
  return `<p style="margin:0 0 8px;font-size:15px"><strong style="color:${color}">${h.lead} ${h.percent}%</strong> <span style="${muted}">of the sites analysed on Spamlyze</span></p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 4px;border-collapse:collapse"><tr>
<td width="${left}%" style="height:8px;background:#10b981;background-image:linear-gradient(90deg,#10b981,#fbbf24${left > 60 ? ",#ef4444" : ""});border-radius:4px 0 0 4px;font-size:0;line-height:0">&nbsp;</td>
<td width="6" style="height:16px;background:#1c1917;border-radius:3px;font-size:0;line-height:0">&nbsp;</td>
<td style="height:8px;background:#e7e5e4;border-radius:0 4px 4px 0;font-size:0;line-height:0">&nbsp;</td>
</tr></table>
<p style="margin:0 0 16px;font-size:12px;${muted}">Safest &larr; your site (${score}/100) &rarr; Riskiest</p>`;
}

export function quickReportHtml(id: string, check: StoredCheck, now = Date.now(), benchmark: Benchmark | null = null): string {
  const a = check.analysis;
  const link = `${site.url}/report/${id}?u=${unlockToken(id)}`;
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
    : `<p style="margin:0 0 14px;font-size:15px">Estimated spam risk: <strong style="font-size:20px">${a.riskScore}/100</strong> ${level(a.riskLevel)}</p>
${rankBox(benchmark, a.riskScore)}${coverageBox(check)}
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
${deepOffer(
  id,
  check,
  now,
  wholeSite(check)
    ? "Now add your traffic data"
    : `These ${a.topIssues.length} fixes come from ${check.pagesAnalyzed} ${pagesWord(check.pagesAnalyzed)}. What about the rest?`,
)}
<p style="margin:20px 0 0;font-size:14px"><a href="${link}" style="color:#dc2626">Open this Quick Check on Spamlyze</a></p>`;

  return layout(
    `Your detailed Quick Check for ${d}`,
    body,
    `You asked for this detailed Quick Check on spamlyze.com. We'll also email you when Google rolls out a spam update, so you can check ${d} again. Every alert has a one-click unsubscribe link.`,
  );
}

/** Sent FOLLOW_UP_HOURS later: did they fix the issues, and what's left on the rest of the site. */
export function followUpHtml(id: string, check: StoredCheck, at: number): string {
  const a = check.analysis!;
  const d = escape(check.domain);
  const c = coverage(check.pagesAnalyzed, check.metrics);
  const whole = wholeSite(check);
  const rest = whole
    ? `Your Quick Check looked at ${whole}, but not at your traffic. Your Search Console shows which pages lose clicks after a spam update: that's where to start.`
    : c.total
    ? `Your Quick Check looked at ${check.pagesAnalyzed} of the ${n(c.total)} pages of ${d}. The other ${n(c.unseen)} ${c.unseen === 1 ? "has" : "have"} never been checked: if the same patterns are there, Google can see them too.`
    : `Your Quick Check looked at ${check.pagesAnalyzed} pages of ${d}. The rest of the site has never been checked: if the same patterns are there, Google can see them too.`;
  const body = `<p style="margin:0 0 12px;line-height:1.6">A few days ago, your Quick Check flagged these on ${d}:</p>
<ol style="margin:0 0 16px;padding-left:20px;line-height:1.6">${a.topIssues.map((t) => `<li>${escape(t.title)}</li>`).join("")}</ol>
<p style="margin:0 0 12px;line-height:1.6">${rest}</p>
${deepOffer(id, check, at, whole ? "See which pages are losing traffic" : "See what's left across the whole site")}`;
  return layout(
    `Did you fix the ${a.topIssues.length} issues on ${d}?`,
    body,
    `You get this one follow-up because you asked for a detailed Quick Check of ${d}. Besides spam update alerts, we won't email you about it again.`,
  );
}

export async function sendQuickReport(to: string, id: string, check: StoredCheck) {
  const benchmark = check.analysis ? await benchmarkFor(check.analysis.riskScore) : null;
  const subject = check.analysis
    ? `Your detailed Quick Check for ${check.domain}: ${check.analysis.riskScore}/100`
    : `Your Quick Check for ${check.domain}`;
  return sendEmail(to, subject, quickReportHtml(id, check, Date.now(), benchmark));
}

/** Schedules the follow-up through Brevo and returns its message id, to cancel it if they buy. */
export async function scheduleFollowUp(to: string, id: string, check: StoredCheck): Promise<string | undefined> {
  if (!check.analysis) return undefined;
  const at = Date.now() + FOLLOW_UP_HOURS * 3_600_000;
  const res = await sendEmailDetailed(
    to,
    `Did you fix the ${check.analysis.topIssues.length} issues on ${check.domain}?`,
    followUpHtml(id, check, at),
    { scheduledAt: new Date(at) },
  );
  return res.messageId;
}
