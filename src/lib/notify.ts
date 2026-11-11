import "server-only";
import { sendEmail } from "@/lib/brevo";
import { site } from "@/lib/site";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Emails the Spamlyze team. Set NOTIFY_EMAIL to change the address, NOTIFY_QUICK_CHECKS=false to mute free checks. */
export async function notifyAdmin(kind: "quick_check" | "deep", subject: string, lines: string[], link?: string) {
  if (kind === "quick_check" && process.env.NOTIFY_QUICK_CHECKS === "false") return;
  const to = process.env.NOTIFY_EMAIL || site.contactEmail;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1c1917">
${lines.map((l) => `<p style="margin:0 0 6px">${escape(l)}</p>`).join("")}
${link ? `<p style="margin:14px 0 0"><a href="${link}" style="color:#dc2626">${escape(link)}</a></p>` : ""}
<p style="margin:18px 0 0;font-size:13px;color:#57534e"><a href="${site.url}/admin" style="color:#57534e">Stats</a></p>
</div>`;
  await sendEmail(to, subject, html);
}
