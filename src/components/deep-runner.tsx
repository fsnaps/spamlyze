"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { DeepStatusView } from "@/lib/deep/status";
import { Radar, StepIcon } from "./scan-progress";

const PHASES: { id: DeepStatusView["phase"]; label: string }[] = [
  { id: "discover", label: "Reading robots.txt and sitemaps" },
  { id: "crawl", label: "Crawling your pages" },
  { id: "analyze", label: "Reviewing each page" },
  { id: "synthesize", label: "Writing your action plan" },
];
const ORDER = ["discover", "crawl", "analyze", "synthesize", "done"];

function progressOf(s: DeepStatusView): number {
  const planned = Math.max(s.pagesPlanned, 1);
  switch (s.phase) {
    case "discover":
      return 3;
    case "crawl":
      return 5 + 35 * Math.min(s.pagesCrawled / planned, 1);
    case "analyze":
      return 40 + 50 * Math.min(s.pagesAnalyzed / Math.max(s.pagesCrawled, 1), 1);
    case "synthesize":
      return 93;
    default:
      return 100;
  }
}

/** Drives the report job one step at a time and shows live progress. */
export function DeepRunner({ id, host, initial }: { id: string; host: string; initial: DeepStatusView }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const res = await fetch(`/api/deep/${id}/step`, { method: "POST" });
        if (res.ok) {
          const next = (await res.json()) as DeepStatusView;
          if (stopped.current) return;
          setStatus(next);
          if (next.status === "done") {
            router.refresh();
            return;
          }
          if (next.status === "failed") return;
        }
      } catch {}
      if (!stopped.current) timer = setTimeout(tick, 1500);
    };
    if (initial.status === "running") tick();
    return () => {
      stopped.current = true;
      clearTimeout(timer);
    };
  }, [id, initial.status, router]);

  if (status.status === "failed") {
    return (
      <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <h2 className="text-xl font-semibold">We couldn&apos;t finish this report</h2>
        <p className="mt-2 text-muted">{status.error}</p>
        <p className="mt-2 text-muted">
          {status.refunded
            ? "Your payment has been refunded in full. It can take 5 to 10 days to show on your statement. Questions?"
            : "You'll get a full refund. If you don't see it within a few days,"}{" "}
          {status.refunded ? "Write" : "write"} to <a className="text-accent underline" href="mailto:hello@spamlyze.com">hello@spamlyze.com</a>.
        </p>
      </div>
    );
  }

  const current = ORDER.indexOf(status.phase);
  const progress = progressOf(status);
  const detail =
    status.phase === "crawl"
      ? `${status.pagesCrawled} of ${status.pagesPlanned} pages crawled`
      : status.phase === "analyze"
        ? `${status.pagesAnalyzed} of ${status.pagesCrawled} pages reviewed`
        : status.phase === "synthesize"
          ? "Almost there"
          : "Starting";

  return (
    <div className="sl-fade-up rounded-3xl border border-line bg-surface p-6 sm:p-8">
      <div className="grid items-center gap-10 sm:grid-cols-[auto_1fr] sm:gap-12">
        <Radar host={host} />
        <ol className="mt-4 space-y-3 sm:mt-0">
          {PHASES.map((p, i) => {
            const state = i < current ? "done" : i === current ? "active" : "todo";
            return (
              <li key={p.id} className="flex items-center gap-3 text-sm">
                <StepIcon state={state} />
                <span
                  className={
                    state === "active" ? "sl-shimmer font-medium" : state === "done" ? "text-foreground" : "text-muted"
                  }
                >
                  {p.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="mt-12">
        <div
          className="h-1 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 flex justify-between text-xs text-muted tabular-nums">
          <span aria-live="polite">{detail}</span>
          <span>{Math.round(progress)}%</span>
        </p>
      </div>
      <p className="mt-6 text-sm text-muted">
        This takes 5 to 15 minutes. Keep this tab open: the analysis runs while you&apos;re here, and resumes if you
        come back to this link later. Bookmark it to find your report again.
      </p>
    </div>
  );
}
