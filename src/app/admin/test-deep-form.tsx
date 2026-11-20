"use client";

import { useActionState } from "react";
import { startTestDeepAction, type TestDeepState } from "./actions";

/** Starts a free Deep Report (admins only, 5 a day) to test the job end to end without Stripe. */
export function TestDeepForm() {
  const [state, action, pending] = useActionState<TestDeepState, FormData>(startTestDeepAction, { error: null });
  return (
    <form action={action} className="mt-4 rounded-2xl border border-line bg-surface p-4 text-sm">
      <p className="font-medium">Run a free test Deep Report</p>
      <p className="mt-1 text-xs text-muted">No payment. Uses real Claude credits (about $0.65 for 100 pages, up to $3.35 for 500). Max 5 a day.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input name="url" placeholder="example.com" required className="min-w-0 flex-1 rounded border border-line bg-transparent px-2 py-1" />
        <select name="size" className="rounded border border-line bg-transparent px-2 py-1">
          <option value="100">100 pages</option>
          <option value="500">500 pages</option>
        </select>
        <button disabled={pending} className="rounded border border-line px-3 py-1 disabled:opacity-50">
          {pending ? "Starting…" : "Start"}
        </button>
      </div>
      {state.error && <p className="mt-2 text-xs text-red-700 dark:text-red-300">{state.error}</p>}
    </form>
  );
}
