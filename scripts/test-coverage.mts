// Pure checks of the Quick Check headline: a sample score never leads unless every page was checked.
import assert from "node:assert/strict";
import { coverage, quickHeadline } from "../src/lib/check/coverage";

const partial = coverage(15, { sitemapUrlCount: 399, knownPageCount: 400 });
assert.equal(partial.complete, false);
let h = quickHeadline(15, partial, 0);
assert.equal(h.scoreIsVerdict, false);
assert.equal(h.title, "No major warning sign on the 15 pages we checked");
assert.equal(h.detail, "385 of your 400 pages weren't checked, so this doesn't clear the rest of your site.");
h = quickHeadline(15, partial, 2);
assert.equal(h.title, "2 warning signs on the 15 pages we checked");
assert.match(h.detail, /can't tell how far these go/);

const unknown = coverage(15, { sitemapUrlCount: null, knownPageCount: null });
h = quickHeadline(15, unknown, 1);
assert.equal(h.scoreIsVerdict, false);
assert.equal(h.title, "1 warning sign on the 15 pages we checked");
assert.match(h.detail, /no sitemap/);

const whole = coverage(12, { sitemapUrlCount: 11, knownPageCount: 12 });
assert.equal(quickHeadline(12, whole, 0).scoreIsVerdict, true);
console.log("coverage headline: ok");
