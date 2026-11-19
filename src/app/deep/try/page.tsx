import type { Metadata } from "next";
import { DeepCheckoutNow } from "@/components/deep-price";

// Unlinked entry point to test the Deep Report before it's switched on for everyone.
export const metadata: Metadata = {
  title: "Deep Report",
  robots: { index: false, follow: false },
};

export default function DeepTryPage() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-12 sm:px-6 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight">Deep Report</h1>
      <p className="mt-3 text-muted">Up to 100 or 500 pages reviewed one by one, depending on your site&apos;s size, with a prioritized action plan.</p>
      <div className="mt-8">
        <DeepCheckoutNow />
      </div>
    </main>
  );
}
