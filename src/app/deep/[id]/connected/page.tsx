import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getDeepReport, isDeepId } from "@/lib/deep/job";

export const metadata: Metadata = { title: "Search Console connected", robots: { index: false } };

/**
 * Where the site owner lands after connecting Search Console to a report ordered through the API.
 * Nothing to watch here: the report runs on our servers and goes to whoever ordered it.
 */
export default function ConnectedPage({ params }: PageProps<"/deep/[id]/connected">) {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-2xl flex-1 px-4 py-16 text-muted sm:px-6">Loading…</main>}>
      <Connected params={params} />
    </Suspense>
  );
}

async function Connected({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const report = isDeepId(id) ? await getDeepReport(id) : null;
  if (!report || !report.gsc) notFound();
  const lost = report.gsc.lostPages ?? 0;
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-16 sm:px-6">
      <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8" role="status">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600/15 text-green-700 dark:text-green-400">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Search Console connected for {report.domain}</h1>
        <p className="mt-3 leading-relaxed text-muted">
          Thank you. The Deep Report now includes your real Google traffic
          {lost > 0 && report.gsc.losers ? `, starting with the ${lost} pages that lost clicks after the ${report.gsc.losers.update}` : ""}. It runs on
          our servers and is sent to the person who ordered it. <strong className="text-foreground">You can close this page.</strong>
        </p>
        <p className="mt-4 text-xs leading-relaxed text-muted">
          We imported your clicks once with read-only access, then revoked it right away. We keep no Google token.
        </p>
      </div>
    </main>
  );
}
