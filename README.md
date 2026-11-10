# Spamlyze

Spam update risk checker for websites. Next.js (App Router) on Firebase App Hosting, Firestore for data.

This first version is the public landing page: waitlist, privacy policy and terms. The privacy policy and a verified domain are required for Google's OAuth verification of the Search Console scope.

## Run locally

```bash
npm install
gcloud auth application-default login   # lets the waitlist write to Firestore
FIREBASE_PROJECT_ID=<your-project-id> npm run dev
```

Without credentials the page still renders; joining the waitlist shows an error.

## Deploy (Firebase App Hosting)

1. Create a Firebase project on the Blaze plan and enable Firestore (production mode).
2. `npx firebase-tools deploy --only firestore:rules --project <your-project-id>`
3. In the Firebase console, App Hosting → Create backend → connect this GitHub repo, branch `main`, root directory `/`.
4. Add the custom domain `spamlyze.com` in the backend settings and create the DNS records it shows.

App Hosting gives the backend's service account access to Firestore in the same project, so no secret is needed for the waitlist.

## Brevo

Waitlist signups are also added to a Brevo list (Firestore remains the source of truth; a Brevo error never blocks a signup).

1. In Brevo, create the list "Spamlyze waitlist".
2. Put the list ID in `apphosting.yaml` (`BREVO_WAITLIST_LIST_ID`).
3. `npx firebase-tools apphosting:secrets:set BREVO_API_KEY --project spamlyze` and accept granting access to the `spamlyze` backend.
4. Welcome email: a Brevo automation triggered by "contact added to list".

The secret must exist before this config is deployed, or the App Hosting rollout fails.

## Quick Check (free plan)

`/check` crawls up to 15 pages (homepage + a spread sample of the sitemap, honouring robots.txt), computes metrics (thin pages, duplicates, outbound links, risky terms) and asks Claude (`CLAUDE_MODEL`, default `claude-haiku-5-5`) for a risk score, one verdict per spam signal and the top 3 issues. The report lives at `/report/{id}`.

Protections: SSRF guard on every fetch and redirect (public IPs, ports 80/443 only, 1.5 MB cap), reCAPTCHA v3 (score ≥ 0.5, fails closed in production when not configured), `QUICK_CHECK_PER_IP_DAILY` checks per IP per day, `QUICK_CHECK_GLOBAL_DAILY` checks per day overall, and a 24-hour cache per domain (re-checking a domain is free). Also set a monthly spend limit in the Anthropic Console.

Setup:

1. Create reCAPTCHA v3 keys at https://www.google.com/recaptcha/admin for `spamlyze.com`; put the site key in `apphosting.yaml` (`NEXT_PUBLIC_RECAPTCHA_SITE_KEY`).
2. `npx firebase-tools apphosting:secrets:set RECAPTCHA_SECRET_KEY --project spamlyze`
3. `npx firebase-tools apphosting:secrets:set ANTHROPIC_API_KEY --project spamlyze`
4. Optional: a Firestore TTL policy on `rateLimits.expiresAt` to clean up counters.

Tests: `npm test` (offline: SSRF guards, robots.txt, sitemap sampling, metrics).

## Data

- `waitlist/{sha256(email)}`: `email`, `site` (optional domain), `source` (`hero` or `footer`), `createdAt`.
- `checks/{id}`: `domain`, `url`, `createdAt`, `pagesAnalyzed`, `robotsBlocked`, `metrics`, `analysis`, `model`, `usage`.
- `checkCache/{domain}`: latest `checkId` and `createdAt` (24-hour reuse).
- `rateLimits/{ip_<hash>_<day>|global_<day>}`: `count`, `expiresAt`.

## Before launch

- Legal entity and contact email live in `src/lib/site.ts`.
- Make sure `hello@spamlyze.com` receives mail.
