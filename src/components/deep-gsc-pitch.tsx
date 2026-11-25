import { GSC_MESSAGES } from "@/components/gsc-section";

/**
 * The Deep Report's case for connecting Search Console, shown while the job runs and at the top of a
 * finished report that has no traffic data. Without it the report can only estimate exposure from
 * public pages; with it, it can tell whether the site was actually hit and which pages lost clicks.
 */
export function DeepGscPitch({ id, stage, result }: { id: string; stage: "running" | "done"; result?: string }) {
  const message = result && result !== "connected" ? GSC_MESSAGES[result] : null;
  const running = stage === "running";
  return (
    <section
      id="search-console"
      className={`scroll-mt-8 rounded-2xl border-2 border-accent bg-surface p-6 sm:p-8 print:hidden ${running ? "mb-6" : "mt-6"}`}
    >
      {message && <p className="mb-5 rounded-xl border border-line px-4 py-3 text-sm" role="status">{message}</p>}
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Strongly recommended</p>
      <h2 className="mt-2 text-xl font-semibold tracking-tight">
        {running ? "Connect Google Search Console while we work" : "Add your Search Console data to this report"}
      </h2>
      <p className="mt-2 leading-relaxed text-muted">
        {running
          ? "This is what turns the report from an estimate into a diagnosis. Public pages show how exposed your site is; only your own traffic shows whether Google actually acted on it."
          : "This report is built on your public pages only, so it estimates your exposure. Connect Search Console and we add your traffic to it: if pages lost clicks, we review them and update your action plan, in a few minutes and at no extra cost."}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-accent/40 bg-accent/5 p-4">
          <p className="text-sm font-semibold">With Search Console</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            <li>Whether you were actually hit: your clicks before and after each spam and core update</li>
            <li>The exact pages that lost traffic, reviewed first</li>
            <li>An action plan tied to your real losses</li>
          </ul>
        </div>
        <div className="rounded-xl border border-line p-4">
          <p className="text-sm font-semibold text-muted">Without it</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
            <li>An estimate of your exposure, from public pages only</li>
            <li>No way to tell whether an update actually cut your traffic</li>
            <li>Pages ranked by risk, not by what you lost</li>
          </ul>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        <a
          href={`/api/gsc/connect?deep=${id}`}
          className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-2.5 font-semibold text-white"
        >
          Connect Search Console
        </a>
        <p className="text-sm text-muted">Takes a minute with the Google account that manages this site.</p>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted">
        Read-only access (Google&apos;s <span className="font-mono">webmasters.readonly</span> permission): we can&apos;t
        change anything in your account. We import 16 months of clicks for this site once, then revoke the access right
        away and never keep a token.{" "}
        {running
          ? "You can skip it: the analysis keeps running, and you can still connect from the finished report."
          : ""}
      </p>
    </section>
  );
}
