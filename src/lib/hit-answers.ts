/** Answers to "Were you hit by a Google spam update?" (shared by server and client code). */
export const HIT_ANSWERS = ["yes", "no", "unsure"] as const;
export type HitAnswer = (typeof HIT_ANSWERS)[number];
export const isHitAnswer = (x: unknown): x is HitAnswer => typeof x === "string" && (HIT_ANSWERS as readonly string[]).includes(x);
