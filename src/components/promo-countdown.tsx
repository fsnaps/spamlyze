"use client";

import { useEffect, useState } from "react";

function left(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  return d > 0 ? `${d}d ${h}h ${min}m` : `${h}h ${min}m`;
}

/** "Ends in 3d 4h 12m", ticking every 30 s. Shows `fallback` until mounted (no clock during render). */
export function PromoCountdown({ endsAt, fallback }: { endsAt: string; fallback: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, []);
  if (now === null) return <>{fallback}</>;
  const ms = Date.parse(endsAt) - now;
  if (ms <= 0) return <>Offer ended</>;
  return <>Ends in {left(ms)}</>;
}
