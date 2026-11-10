import type { DeepReport } from "./types";

export type DeepStatusView = {
  status: DeepReport["status"];
  phase: DeepReport["phase"];
  pagesPlanned: number;
  pagesCrawled: number;
  pagesAnalyzed: number;
  error: string | null;
  refunded: boolean;
};

export function publicStatus(r: DeepReport): DeepStatusView {
  return {
    status: r.status,
    phase: r.phase,
    pagesPlanned: r.urls?.length ?? 0,
    pagesCrawled: typeof r.pagesCrawled === "number" ? r.pagesCrawled : 0,
    pagesAnalyzed: typeof r.pagesAnalyzed === "number" ? r.pagesAnalyzed : 0,
    error: r.error ?? null,
    refunded: Boolean(r.refunded),
  };
}
