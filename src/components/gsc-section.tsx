import type { ReactNode } from "react";
import { fillGaps, type GscData, type UpdateImpact } from "@/lib/gsc/data";
import { UPDATES } from "@/lib/gsc/updates";

export const GSC_MESSAGES: Record<string, string> = {
  connected: "Search Console connected. Your traffic is now lined up with Google's updates below.",
  denied: "Search Console wasn't connected: the read-only permission was not granted.",
  no_property: "This Google account has no Search Console property for this site. Try another Google account.",
  error: "We couldn't import your Search Console data. Please try again in a minute.",
};

const VERDICT: Record<UpdateImpact["verdict"], { label: string; cls: string }> = {
  hit: { label: "Likely hit", cls: "bg-red-500/10 text-red-700 dark:text-red-300" },
  possible: { label: "Possible impact", cls: "bg-amber-500/15 text-amber-800 dark:text-amber-300" },
  stable: { label: "No clear impact", cls: "bg-stone-500/10 text-muted" },
  gain: { label: "Gained", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
};

const QUALITY: Record<string, string> = {
  good: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  ok: "bg-stone-500/10 text-muted",
  weak: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  spammy: "bg-red-500/10 text-red-700 dark:text-red-300",
};

const pct = (x: number) => `${x > 0 ? "+" : ""}${Math.round(x * 100)}%`;
const fmtDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

type Props = {
  /** Where "Connect" and "Refresh" send the visitor. */
  connectHref: string;
  gsc?: GscData;
  result?: string;
  enabled: boolean;
  /** Shown instead of the list of losing pages when the free plan withholds it. */
  upsell?: ReactNode;
  /** Replaces the default pitch on the "Connect" card. */
  pitch?: ReactNode;
  /** Short line under the heading, e.g. how this data is (or isn't) used in the score. */
  note?: ReactNode;
  /** Our verdict on a losing page (Deep Report), shown next to its click loss. */
  verdictOf?: (url: string) => string | undefined;
  /** A secondary section (Quick Check page): neutral card and an outlined button, so the Deep Report stays the main action. */
  quiet?: boolean;
};

export function GscSection({ connectHref, gsc, result, enabled, upsell, pitch, note, verdictOf, quiet }: Props) {
  if (!gsc && !enabled) return null;
  const message = result ? GSC_MESSAGES[result] : null;
  return (
    <section id="search-console" className={`${quiet ? "mt-16 sm:mt-20" : "mt-12"} scroll-mt-8`}>
      <h2 className={quiet ? "text-lg font-semibold" : "text-2xl font-semibold tracking-tight"}>Traffic around Google updates</h2>
      {note && <p className="mt-2 text-sm text-muted">{note}</p>}
      {message && (
        <p className="mt-4 rounded-xl border border-line bg-surface px-4 py-3 text-sm" role="status">
          {message}
        </p>
      )}
      {gsc ? (
        <GscResults gsc={gsc} connectHref={connectHref} enabled={enabled} upsell={upsell} verdictOf={verdictOf} />
      ) : (
        <div className={`mt-6 rounded-2xl bg-surface ${quiet ? "border border-line p-5 text-sm sm:p-6" : "border-2 border-accent p-6"}`}>
          <p className="leading-relaxed">
            {pitch ??
              "Connect Google Search Console to see whether your clicks actually dropped when a spam or core update rolled out, and which pages lost the most."}
          </p>
          <p className="mt-2 text-sm text-muted">
            We import 16 months of clicks and impressions for this site, once. You can see exactly what Google asks for on
            the next screen.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 print:hidden">
            <a
              href={connectHref}
              className={
                quiet
                  ? "inline-flex items-center justify-center rounded-full border border-line px-4 py-2 text-sm font-semibold transition hover:border-foreground/40"
                  : "inline-flex items-center justify-center rounded-full bg-accent px-5 py-2.5 font-semibold text-white"
              }
            >
              Connect Search Console
            </a>
            <span className="inline-flex items-center gap-1.5 text-sm text-muted">
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                <rect x="3" y="7" width="10" height="7" rx="1.5" />
                <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
              </svg>
              Read-only · access revoked right after import · we never keep a token
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function GscResults({ gsc, connectHref, enabled, upsell, verdictOf }: Omit<Props, "result" | "pitch" | "note"> & { gsc: GscData }) {
  const hits = gsc.updates.filter((u) => u.verdict === "hit" || u.verdict === "possible");
  return (
    <>
      <p className="mt-4 text-muted">
        {hits.length
          ? `Your clicks fell after ${hits.length} of the ${gsc.updates.length} updates we could measure.`
          : gsc.updates.length
            ? `No clear traffic drop after the ${gsc.updates.length} updates we could measure.`
            : "Not enough Search Console history to measure an update yet."}{" "}
        Property: <span className="font-mono text-sm">{gsc.property}</span>
      </p>
      <TrafficChart daily={gsc.daily} />
      {gsc.updates.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="p-3 font-medium">Update</th>
                <th className="p-3 text-right font-medium">Clicks/day before</th>
                <th className="p-3 text-right font-medium">After</th>
                <th className="p-3 text-right font-medium">Change</th>
                <th className="p-3 font-medium">Verdict</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {gsc.updates.map((u) => (
                <tr key={u.name} className="break-inside-avoid">
                  <td className="p-3">
                    <span className="font-medium">{u.name}</span>
                    <span className="block text-xs text-muted">
                      {fmtDay(u.start)} – {u.end ? fmtDay(u.end) : "ongoing"}
                    </span>
                  </td>
                  <td className="p-3 text-right tabular-nums">{Math.round(u.beforeClicks)}</td>
                  <td className="p-3 text-right tabular-nums">{Math.round(u.afterClicks)}</td>
                  <td className="p-3 text-right tabular-nums">{pct(u.clicksChange)}</td>
                  <td className="p-3">
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${VERDICT[u.verdict].cls}`}>
                      {VERDICT[u.verdict].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted">
        Average daily clicks over the 28 days before each update versus the 28 days after it finished rolling out.
        Seasonality and other changes on your site can also move these numbers.
      </p>
      {gsc.losers && gsc.losers.pages.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold">Pages that lost the most clicks after the {gsc.losers.update}</h3>
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
            {gsc.losers.pages.map((p) => (
              <li key={p.url} className="flex items-center justify-between gap-3 p-3 text-sm">
                <a href={p.url} rel="nofollow noopener" target="_blank" className="min-w-0 truncate text-accent underline">
                  {p.url.replace(/^https?:\/\//, "")}
                </a>
                <span className="flex shrink-0 items-center gap-2">
                  {verdictOf?.(p.url) && (
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${QUALITY[verdictOf(p.url)!] ?? QUALITY.ok}`}
                    >
                      {verdictOf(p.url)}
                    </span>
                  )}
                  <span className="tabular-nums text-muted">
                    {p.before} → {p.after} clicks / 28 days
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {gsc.losers && gsc.losers.pages.length === 0 && (gsc.lostPages ?? 0) > 0 && upsell && (
        <div className="mt-8 rounded-2xl border-2 border-accent bg-surface p-6">
          <h3 className="text-lg font-semibold">
            {gsc.lostPages} {gsc.lostPages === 1 ? "page" : "pages"} lost clicks after the {gsc.losers.update}
          </h3>
          {upsell}
        </div>
      )}
      {enabled && (
        <p className="mt-4 text-sm text-muted print:hidden">
          Imported {fmtDay(gsc.importedAt.slice(0, 10))}.{" "}
          <a href={connectHref} className="text-accent underline">
            Refresh the data
          </a>
        </p>
      )}
    </>
  );
}

/** Daily clicks as a line, with spam updates shaded red and core updates grey. */
function TrafficChart({ daily: raw }: { daily: GscData["daily"] }) {
  const daily = fillGaps(raw);
  if (daily.length < 2) return null;
  const W = 800;
  const H = 220;
  const pad = { l: 44, r: 8, t: 10, b: 24 };
  const t0 = Date.parse(`${daily[0].d}T00:00:00Z`);
  const t1 = Date.parse(`${daily[daily.length - 1].d}T00:00:00Z`);
  const max = Math.max(1, ...daily.map((p) => p.c));
  const x = (d: string) => pad.l + ((Date.parse(`${d}T00:00:00Z`) - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const path = daily.map((p, i) => `${i ? "L" : "M"}${x(p.d).toFixed(1)},${y(p.c).toFixed(1)}`).join("");
  const bands = UPDATES.filter((u) => u.kind !== "other")
    .map((u) => {
      const s = Math.max(Date.parse(`${u.start}T00:00:00Z`), t0);
      const e = Math.min(Date.parse(`${u.end ?? daily[daily.length - 1].d}T00:00:00Z`), t1);
      return e >= s ? { ...u, x1: x(new Date(s).toISOString().slice(0, 10)), x2: x(new Date(e).toISOString().slice(0, 10)) } : null;
    })
    .filter((b) => b !== null);
  const months = daily.filter((p) => p.d.endsWith("-01"));
  return (
    <figure className="mt-6 rounded-2xl border border-line bg-surface p-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Daily clicks from Google Search">
        {bands.map((b) => (
          <rect
            key={b.name}
            x={b.x1}
            y={pad.t}
            width={Math.max(2, b.x2 - b.x1)}
            height={H - pad.t - pad.b}
            className={b.kind === "spam" ? "fill-red-500/15" : "fill-stone-500/15"}
          >
            <title>{b.name}</title>
          </rect>
        ))}
        {(max >= 2 ? [0, Math.round(max / 2), max] : [0, max]).map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="stroke-line" strokeWidth={1} />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="fill-current text-[11px] opacity-60">
              {v}
            </text>
          </g>
        ))}
        {months.map((m) => (
          <text key={m.d} x={x(m.d)} y={H - 6} textAnchor="middle" className="fill-current text-[11px] opacity-60">
            {new Date(`${m.d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}
          </text>
        ))}
        <path d={path} fill="none" className="stroke-foreground" strokeWidth={1.5} strokeLinejoin="round" />
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        <span>Daily clicks</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-red-500/30" /> Spam update
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-stone-500/30" /> Core update
        </span>
      </figcaption>
    </figure>
  );
}
