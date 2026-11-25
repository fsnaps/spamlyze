import "server-only";
import { sendEmail } from "@/lib/brevo";
import { gscEnabled } from "@/lib/gsc/oauth";
import { site } from "@/lib/site";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function layout(title: string, body: string, link: string, cta: string) {
  return `<!doctype html><html><body style="margin:0;background:#fafaf9;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1917">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e7e5e4;border-radius:16px">
<tr><td style="padding:32px">
<p style="margin:0 0 24px;font-weight:600;font-size:16px"><span style="display:inline-block;background:#dc2626;color:#fff;border-radius:6px;width:24px;height:24px;line-height:24px;text-align:center;margin-right:8px">S</span>Spamlyze</p>
<h1 style="margin:0 0 12px;font-size:22px">${title}</h1>
${body}
<p style="margin:28px 0"><a href="${link}" style="background:#dc2626;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;display:inline-block">${cta}</a></p>
<p style="margin:0;font-size:13px;color:#57534e">Or copy this link: <a href="${link}" style="color:#dc2626">${link}</a></p>
</td></tr></table>
<p style="font-size:12px;color:#57534e;margin-top:16px">Spamlyze · ${escape(site.contactEmail)} · Not affiliated with Google.</p>
</td></tr></table></body></html>`;
}

export function reportLink(id: string) {
  return `${site.url}/deep/${id}`;
}

/** The case for Search Console, for reports that don't have it yet. */
function gscBlock(id: string, intro: string) {
  if (!gscEnabled()) return "";
  return `<div style="margin:20px 0 0;padding:16px 18px;border:2px solid #dc2626;border-radius:12px">
<p style="margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#dc2626">Strongly recommended</p>
<p style="margin:0 0 8px;line-height:1.6;font-weight:600">Connect Google Search Console</p>
<p style="margin:0 0 8px;line-height:1.6;color:#57534e">${intro} With your clicks before and after each spam and core update, the report tells you whether you were actually hit, and reviews the pages that lost traffic first. Without it, it can only estimate your exposure from public pages.</p>
<p style="margin:0 0 12px;line-height:1.6;color:#57534e;font-size:13px">Read-only access: we import your clicks once, revoke the access right away and can't change anything in your account.</p>
<p style="margin:0"><a href="${reportLink(id)}#search-console" style="color:#dc2626;font-weight:600">Connect Search Console from your report</a></p>
</div>`;
}

export function sendDeepStarted(to: string, id: string, domain: string, maxPages = 500, hasGsc = false) {
  const d = escape(domain);
  return sendEmail(
    to,
    `Your Deep Report for ${domain} is on its way`,
    layout(
      `Thanks! Your Deep Report for ${d} is starting`,
      `<p style="margin:0 0 12px;line-height:1.6;color:#57534e">We're reviewing up to ${maxPages} pages of ${d} one by one. It takes 5 to 15 minutes while the report page is open.</p>
<p style="margin:0;line-height:1.6;color:#57534e">If you closed the page, open the link below: the analysis picks up where it left off. Keep this email to find your report again.</p>
${hasGsc ? "" : gscBlock(id, "Do it while the analysis runs: it takes a minute.")}`,
      reportLink(id),
      "Follow your report",
    ),
  );
}

export function sendDeepReady(to: string, id: string, domain: string, score?: number, level?: string, hasGsc = false) {
  const d = escape(domain);
  const verdict =
    score === undefined ? "" : `<p style="margin:0 0 12px;line-height:1.6">Risk score: <strong>${score}/100</strong> (${escape(level ?? "")}).</p>`;
  return sendEmail(
    to,
    `Your Deep Report for ${domain} is ready`,
    layout(
      `Your Deep Report for ${d} is ready`,
      `${verdict}<p style="margin:0;line-height:1.6;color:#57534e">Your prioritized action plan and the list of pages to review are waiting. You can save the report as a PDF from the page.</p>
${hasGsc ? "" : gscBlock(id, "Your report doesn't include your traffic yet. Connect it and we update the report in a few minutes, at no extra cost.")}`,
      reportLink(id),
      "Open my report",
    ),
  );
}

export function sendDeepSignIn(to: string, id: string, domain: string, token: string) {
  const d = escape(domain);
  return sendEmail(
    to,
    `Your sign-in link for the ${domain} Deep Report`,
    layout(
      `Open your private Deep Report`,
      `<p style="margin:0;line-height:1.6;color:#57534e">Someone (hopefully you) asked to open the private Deep Report for ${d}. This link works for one hour and keeps this browser signed in to the report. If you didn't ask for it, you can ignore this email.</p>`,
      `${site.url}/api/deep/${id}/access?k=${encodeURIComponent(token)}`,
      "Open my report",
    ),
  );
}
