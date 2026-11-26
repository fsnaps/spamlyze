"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { answerHit } from "@/app/actions";
import { trackEvent } from "@/lib/analytics";
import type { HitAnswer } from "@/lib/hit-answers";

const OPTIONS: { value: HitAnswer; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unsure", label: "Not sure" },
];

const storageKey = (kind: string, id: string) => `sl-hit-${kind}-${id}`;
const noSubscribe = () => () => {};

function readSaved(kind: string, id: string): HitAnswer | null {
  try {
    const v = window.localStorage.getItem(storageKey(kind, id));
    return v === "yes" || v === "no" || v === "unsure" ? v : null;
  } catch {
    return null;
  }
}

/**
 * "Were you hit by a Google spam update?" A Yes points to Search Console and the Deep Report,
 * whatever the score says. The reply text for each answer comes from the page, as children.
 */
export function HitQuestion({
  kind,
  id,
  initial,
  replies,
}: {
  kind: "check" | "deep";
  id: string;
  /** Answer already stored on a Deep Report. Quick Checks are shared, so they use this browser's answer. */
  initial?: HitAnswer;
  replies: Record<HitAnswer, React.ReactNode>;
}) {
  const [picked, setPicked] = useState<HitAnswer | undefined>();
  const [pending, start] = useTransition();
  // This browser's earlier answer (read after hydration; the server renders without it).
  const saved = useSyncExternalStore(noSubscribe, () => readSaved(kind, id), () => null);
  const answer = picked ?? initial ?? saved ?? undefined;

  const pick = (value: HitAnswer) => {
    setPicked(value);
    try {
      window.localStorage.setItem(storageKey(kind, id), value);
    } catch {}
    trackEvent("hit_answer", { kind, answer: value });
    start(async () => {
      await answerHit(kind, id, value).catch(() => undefined);
    });
  };

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6 print:hidden" aria-busy={pending}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-semibold">Did your Google traffic drop after a spam update?</p>
        <div className="flex gap-2" role="group" aria-label="Did your Google traffic drop after a spam update?">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => pick(o.value)}
              aria-pressed={answer === o.value}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                answer === o.value
                  ? "border-foreground bg-foreground text-background"
                  : "border-line hover:border-foreground"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      {answer && <div className="mt-3 text-sm leading-relaxed text-muted">{replies[answer]}</div>}
    </div>
  );
}
