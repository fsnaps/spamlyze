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

## Data

- `waitlist/{sha256(email)}`: `email`, `site` (optional domain), `source` (`hero` or `footer`), `createdAt`.

## Before launch

- Set the legal entity in `src/lib/site.ts`.
- Make sure `hello@spamlyze.com` receives mail (e.g. Cloudflare Email Routing).
