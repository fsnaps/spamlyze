import type { Metadata } from "next";
import Link from "next/link";
import { QuickCheckForm } from "@/components/quick-check-form";

export const metadata: Metadata = {
  title: "Free spam update risk check",
  description: "Enter your URL and get an estimated spam update risk score with the top 3 issues to fix.",
};

export default function CheckPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 sm:py-20">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Free spam risk check</h1>
      <p className="mt-4 text-lg leading-relaxed text-muted">
        We crawl a sample of up to 15 pages, compare them with Google&apos;s spam policies and give you an
        estimated risk score with the top 3 issues to fix. No sign-up needed.
      </p>
      <p className="mt-3 leading-relaxed text-muted">
        Keep in mind it&apos;s an extrapolation: 15 pages say a lot about a small site and much less about a large one.
        On your report, you can connect Search Console (free, read-only) to see whether your clicks dropped after each
        Google update. For a real diagnosis, the{" "}
        <Link href="/#deep-report" className="font-medium text-foreground underline decoration-accent underline-offset-4">
          Deep Report
        </Link>{" "}
        reviews up to 500 pages and builds your Search Console data into the analysis, starting with the pages that
        lost clicks.
      </p>
      <div className="mt-10">
        <QuickCheckForm />
      </div>
    </main>
  );
}
