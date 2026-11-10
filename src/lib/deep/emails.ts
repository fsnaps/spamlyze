import "server-only";
import { sendEmail } from "@/lib/brevo";
import { site } from "@/lib/site";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function layout(title: string, body: string, link: string, cta: string) {
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

export function sendDeepStarted(to: string, id: string, domain: string) {
  const d = escape(domain);
  return sendEmail(
    to,
    `Your Deep Report for ${domain} is on its way`,
    layout(
      `Thanks! Your Deep Report for ${d} is starting`,
      `<p style="margin:0 0 12px;line-height:1.6;color:#57534e">We're reviewing up to 500 pages of ${d} one by one. It takes 5 to 15 minutes while the report page is open.</p>
<p style="margin:0;line-height:1.6;color:#57534e">If you closed the page, open the link below: the analysis picks up where it left off. Keep this email to find your report again.</p>`,
      reportLink(id),
      "Follow your report",
    ),
  );
}

export function sendDeepReady(to: string, id: string, domain: string, score?: number, level?: string) {
  const d = escape(domain);
  const verdict =
    score === undefined ? "" : `<p style="margin:0 0 12px;line-height:1.6">Risk score: <strong>${score}/100</strong> (${escape(level ?? "")}).</p>`;
  return sendEmail(
    to,
    `Your Deep Report for ${domain} is ready`,
    layout(
      `Your Deep Report for ${d} is ready`,
      `${verdict}<p style="margin:0;line-height:1.6;color:#57534e">Your prioritized action plan and the list of pages to review are waiting. You can save the report as a PDF from the page.</p>`,
      reportLink(id),
      "Open my report",
    ),
  );
}
