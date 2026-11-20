"use client";

import { useActionState } from "react";
import { rerunDeepAction, type RerunState } from "./actions";

/** Runs a Deep Report again, without emailing the buyer. Checks first that the site lets us crawl it. */
export function RerunDeepButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<RerunState, FormData>(rerunDeepAction, { error: null });
  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={id} />
      <button
        disabled={pending || state.done}
        title="Run this report again (no email to the buyer)"
        className="ml-2 rounded border border-line px-2 py-0.5 text-xs disabled:opacity-50"
      >
        {pending ? "Checking…" : state.done ? "Restarted" : "Rerun"}
      </button>
      {state.error && <span className="ml-2 text-xs text-red-700 dark:text-red-300">{state.error}</span>}
    </form>
  );
}
