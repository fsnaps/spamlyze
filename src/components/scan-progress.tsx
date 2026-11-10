"use client";

import { useEffect, useState } from "react";

const STEPS = [
  "Reading robots.txt and sitemap",
  "Fetching a sample of pages",
  "Measuring thin, duplicate and link-heavy pages",
  "Comparing with Google's spam policies",
  "Writing your report",
];
const STEP_MS = 6500;

function Radar({ host }: { host: string }) {
  return (
    <div className="relative mx-auto aspect-square w-44 sm:w-52">
      <span className="sl-ping absolute inset-6 rounded-full border border-accent/40" />
      <span className="sl-ping absolute inset-6 rounded-full border border-accent/30 [animation-delay:1.2s]" />
      <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <linearGradient id="sl-sweep-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        {[90, 64, 38].map((r) => (
          <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="var(--line)" strokeWidth="1" />
        ))}
        <line x1="10" y1="100" x2="190" y2="100" stroke="var(--line)" strokeWidth="1" />
        <line x1="100" y1="10" x2="100" y2="190" stroke="var(--line)" strokeWidth="1" />
        <g className="sl-sweep">
          <path d="M100 100 L100 10 A90 90 0 0 1 177.9 55 Z" fill="url(#sl-sweep-grad)" />
          <line x1="100" y1="100" x2="177.9" y2="55" stroke="var(--accent)" strokeWidth="1.5" />
        </g>
        <circle cx="100" cy="100" r="3" fill="var(--accent)" />
      </svg>
      <p className="absolute inset-x-0 -bottom-7 truncate text-center font-mono text-xs text-muted">{host}</p>
    </div>
  );
}

function StepIcon({ state }: { state: "done" | "active" | "todo" }) {
  if (state === "done")
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white">
        <svg
          viewBox="0 0 24 24"
          className="sl-check h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
    );
  if (state === "active")
    return (
      <span className="relative flex h-6 w-6 items-center justify-center">
        <span className="sl-ping absolute inset-0 rounded-full bg-accent/30" />
        <span className="h-2.5 w-2.5 rounded-full bg-accent" />
      </span>
    );
  return (
    <span className="flex h-6 w-6 items-center justify-center">
      <span className="h-2 w-2 rounded-full bg-line" />
    </span>
  );
}

export function ScanProgress({ host, done }: { host: string; done: boolean }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 200);
    return () => clearInterval(timer);
  }, []);

  const step = done ? STEPS.length : Math.min(Math.floor(elapsed / STEP_MS), STEPS.length - 1);
  // Eases toward 95% over ~35 s, then jumps to 100% when the report is ready.
  const progress = done ? 100 : 95 * (1 - Math.exp(-elapsed / 12000));

  return (
    <div className="sl-fade-up rounded-3xl border border-line bg-surface p-6 sm:p-8">
      <div className="grid items-center gap-10 sm:grid-cols-[auto_1fr] sm:gap-12">
        <Radar host={host} />
        <ol className="mt-4 space-y-3 sm:mt-0">
          {STEPS.map((label, i) => {
            const state = i < step ? "done" : i === step ? "active" : "todo";
            return (
              <li key={label} className="flex items-center gap-3 text-sm">
                <StepIcon state={state} />
                <span
                  className={
                    state === "active" ? "sl-shimmer font-medium" : state === "done" ? "text-foreground" : "text-muted"
                  }
                >
                  {label}
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
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 flex justify-between text-xs text-muted tabular-nums">
          <span>{done ? "Report ready" : "This takes about 30 seconds"}</span>
          <span>{Math.round(progress)}%</span>
        </p>
      </div>
    </div>
  );
}
