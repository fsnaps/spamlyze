import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";
import { track } from "@/lib/stats";
import { HIT_ANSWERS, type HitAnswer } from "@/lib/hit-answers";

export { HIT_ANSWERS, isHitAnswer, type HitAnswer } from "@/lib/hit-answers";

const STAT = { yes: "hitYes", no: "hitNo", unsure: "hitUnsure" } as const;

/**
 * "Were you hit by a spam update?" Every answer is logged in hitAnswers (for /admin), and the
 * latest one is kept on the Quick Check or Deep Report as hitAnswer. A Quick Check is shared by
 * everyone who checks the same domain within 24 h, so on a check it's only the latest answer.
 */
export async function recordHitAnswer(opts: {
  kind: "check" | "deep";
  id: string;
  domain: string;
  answer: HitAnswer;
  source: "site" | "api";
  accountId?: string;
}): Promise<void> {
  if (!HIT_ANSWERS.includes(opts.answer)) return;
  const col = opts.kind === "check" ? "checks" : "deepReports";
  try {
    await Promise.all([
      db()
        .collection("hitAnswers")
        .add({
          kind: opts.kind,
          refId: opts.id,
          domain: opts.domain,
          answer: opts.answer,
          source: opts.source,
          ...(opts.accountId ? { accountId: opts.accountId } : {}),
          createdAt: FieldValue.serverTimestamp(),
        }),
      db().collection(col).doc(opts.id).update({ hitAnswer: opts.answer, hitAnsweredAt: FieldValue.serverTimestamp() }),
      track({ [STAT[opts.answer]]: 1 }),
    ]);
  } catch (err) {
    console.error("hit answer write failed", err instanceof Error ? err.message : err);
  }
}
