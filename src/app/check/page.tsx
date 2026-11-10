import type { Metadata } from "next";
import { QuickCheckForm } from "@/components/quick-check-form";

export const metadata: Metadata = {
  title: "Free spam update risk check",
  description: "Enter your URL and get a spam update risk score with the top 3 issues to fix.",
};

export default function CheckPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 sm:py-20">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Free spam risk check</h1>
      <p className="mt-4 text-lg leading-relaxed text-muted">
        We crawl a sample of up to 15 pages, compare them with Google&apos;s spam policies and give you a
        risk score with the top 3 issues to fix. No sign-up needed.
      </p>
      <div className="mt-10">
        <QuickCheckForm />
      </div>
    </main>
  );
}
