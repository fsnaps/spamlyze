import "server-only";

// Adds a contact to the Brevo waitlist list. Firestore stays the source of truth:
// a Brevo failure is logged and never blocks the signup.
export async function addToBrevoWaitlist(email: string): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const listId = Number(process.env.BREVO_WAITLIST_LIST_ID);
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
