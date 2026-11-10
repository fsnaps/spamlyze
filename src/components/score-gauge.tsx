"use client";

import { useEffect, useState } from "react";

const COLORS: Record<string, string> = {
  low: "#10b981",
  moderate: "#f59e0b",
  high: "var(--accent)",
};

const R = 52;
const CIRC = 2 * Math.PI * R;
// The arc covers 270° and leaves a gap at the bottom.
const ARC = CIRC * 0.75;

export function ScoreGauge({ score, level }: { score: number; level: string }) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const start = performance.now();
    const duration = reduced ? 1 : 1400;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      setValue(score * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  const color = COLORS[level] ?? "var(--muted)";
  return (
    <div className="relative mx-auto h-40 w-40">
      <svg viewBox="0 0 120 120" className="h-full w-full rotate-[135deg]" aria-hidden>
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke="var(--line)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${ARC} ${CIRC}`}
        />
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(ARC * value) / 100} ${CIRC}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-semibold tabular-nums" aria-label={`Risk score ${score} out of 100`}>
          {Math.round(value)}
        </span>
        <span className="text-xs text-muted">/ 100</span>
      </div>
    </div>
  );
}
