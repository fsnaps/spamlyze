"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:border-accent print:hidden"
    >
      Save as PDF
    </button>
  );
}
