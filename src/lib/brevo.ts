import "server-only";

// Adds a contact to a Brevo list: the waitlist, or the Monitoring, API or spam update alerts list
// when it is configured (otherwise the waitlist). Firestore stays the source of truth: a Brevo failure is logged
// and never blocks the signup.
export async function addToBrevoWaitlist(email: string, list: "waitlist" | "monitoring" | "api" | "alerts" = "waitlist"): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const listId = Number(
    (list === "monitoring" && process.env.BREVO_MONITORING_LIST_ID) ||
      (list === "api" && process.env.BREVO_API_LIST_ID) ||
      (list === "alerts" && process.env.BREVO_ALERTS_LIST_ID) ||
      process.env.BREVO_WAITLIST_LIST_ID,
  );
  if (!apiKey || !Number.isInteger(listId) || listId <= 0) return;

  try {
    const res = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        email,
        listIds: [listId],
        updateEnabled: true,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error("brevo contact upsert failed", res.status, await res.text());
    }
  } catch (err) {
    console.error("brevo contact upsert failed", err);
  }
}

/** Sends a transactional email through Brevo. Failures are logged, never thrown. */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  return (await sendEmailDetailed(to, subject, html)).ok;
}

/**
 * Same as sendEmail, with an optional delivery time (Brevo accepts up to 72 h ahead) and the
 * message id, needed to cancel a scheduled email.
 */
export async function sendEmailDetailed(
  to: string,
  subject: string,
  html: string,
  opts: { scheduledAt?: Date } = {},
): Promise<{ ok: boolean; messageId?: string }> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { ok: false };
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: "Spamlyze", email: process.env.EMAIL_SENDER ?? "hello@spamlyze.com" },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        ...(opts.scheduledAt ? { scheduledAt: opts.scheduledAt.toISOString() } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("brevo email failed", res.status, await res.text());
      return { ok: false };
    }
    const data = (await res.json().catch(() => ({}))) as { messageId?: string };
    return { ok: true, messageId: data.messageId };
  } catch (err) {
    console.error("brevo email failed", err);
    return { ok: false };
  }
}

/** Cancels a scheduled transactional email. Failures (already sent, unknown id) are logged only. */
export async function cancelScheduledEmail(messageId: string): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return;
  try {
    const res = await fetch(`https://api.brevo.com/v3/smtp/email/${encodeURIComponent(messageId)}`, {
      method: "DELETE",
      headers: { "api-key": apiKey, accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok && res.status !== 404) console.error("brevo cancel failed", res.status, await res.text());
  } catch (err) {
    console.error("brevo cancel failed", err);
  }
}
