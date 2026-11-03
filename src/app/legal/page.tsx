import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Legal notice",
  robots: { index: false, follow: true },
};

export default function LegalPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
      <h1 className="text-4xl font-semibold tracking-tight">Legal notice</h1>
      <p className="mt-2 text-sm text-muted">Last updated: {site.policyUpdated}</p>

      <div className="prose-legal">
        <h2>Publisher</h2>
        <ul>
          <li>
            <strong>Name:</strong> {site.legalEntity}
          </li>
          <li>
            <strong>Legal status:</strong> {site.legal.status}
          </li>
          <li>
            <strong>Address:</strong> {site.legal.address}
          </li>
          <li>
            <strong>SIRET:</strong> {site.legal.siret}
          </li>
          <li>
            <strong>Email:</strong>{" "}
            <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
          </li>
          <li>
            <strong>Publication director:</strong> {site.legal.publisher}
          </li>
        </ul>

        <h2>Hosting</h2>
        <p>
          Firebase App Hosting, a service of Google LLC, 1600 Amphitheatre Parkway, Mountain
          View, CA 94043, USA. Phone: +1 650-253-0000.
        </p>
      </div>
    </main>
  );
}
