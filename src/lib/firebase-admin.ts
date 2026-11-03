import "server-only";
import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// On Firebase App Hosting, credentials come from the backend's service account.
// Locally, run `gcloud auth application-default login` or set
// GOOGLE_APPLICATION_CREDENTIALS to a service-account key file.
export function db() {
  const app =
    getApps()[0] ??
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.GOOGLE_CLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID,
    });
  return getFirestore(app);
}
