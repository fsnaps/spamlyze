import { rankHeadline, type Benchmark } from "@/lib/check/benchmark";

/**
 * Next to the score: where this site sits among every site analysed on Spamlyze, on a
 * safest → riskiest bar. Complements the score, never replaces it.
 */
export function RiskRank({ benchmark: b, score }: { benchmark: Benchmark; score: number }) {
  const h = rankHeadline(b);
  // Same colors as the score gauge: green, amber, red, by the zone of the bar the site falls in.
  const zone = b.position >= 66 ? "red" : b.position >= 33 ? "amber" : "green";
  const tone = {
    red: "text-red-600 dark:text-red-400",
    amber: "text-amber-600 dark:text-amber-400",
    green: "text-emerald-600 dark:text-emerald-400",
  }[zone];
  const fill = { red: "bg-red-500", amber: "bg-amber-500", green: "bg-emerald-500" }[zone];
  // One shade darker behind the white label text, for contrast.
  const labelFill = { red: "bg-red-600", amber: "bg-amber-600", green: "bg-emerald-600" }[zone];
  // Keep the "You" label inside the card near either end of the bar.
  const labelAlign =
    b.position < 12 ? "left-0" : b.position > 88 ? "right-0" : "left-1/2 -translate-x-1/2";

  return (
    <div className="rounded-xl border border-line p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Compared with other sites</p>
      <p className="mt-1 leading-snug">
        <span className={`text-2xl font-semibold tabular-nums ${tone}`}>
          {h.lead} {h.percent}%
        </span>{" "}
        <span className="text-muted">of the sites analysed on Spamlyze</span>
      </p>

      <div className="relative mt-9 mb-1" role="img" aria-label={`${h.lead} ${h.percent}% of the sites analysed on Spamlyze. Risk score ${score} out of 100.`}>
        <div className="h-2.5 rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500" />
        <div className="sl-slide-in absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${b.position}%` }}>
          <div className={`absolute bottom-full mb-2 whitespace-nowrap ${labelAlign}`}>
            <span className={`rounded-full ${labelFill} px-2 py-0.5 text-xs font-semibold tabular-nums text-white shadow-sm`}>
              You · {score}
            </span>
          </div>
          <div className={`size-5 rounded-full border-[3px] border-surface ${fill} shadow-md ring-1 ring-black/10`} />
        </div>
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted">
        <span>Safest</span>
        <span>Riskiest</span>
      </div>
    </div>
  );
}
