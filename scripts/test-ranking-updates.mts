// Pure checks of the Search Status Dashboard parser (incidents.json shape as of 2026-11-26).
import assert from "node:assert/strict";
import { mergeUpdates, overlapping, parseStatusFeed, SEED_UPDATES } from "../src/lib/gsc/updates";

const R = { service_key: "rGHU1u87FJnkP6W2GwMi", service_name: "Ranking", affected_products: [{ title: "Ranking", id: "rGHU1u87FJnkP6W2GwMi" }] };
const feed = [
  {
    ...R,
    id: "AXrqxXXdtSjj3672ux7X",
    begin: "2026-11-24T15:02:00+00:00",
    external_desc: "December 2026 core update",
    updates: [{ when: "2026-11-24T15:03:11+00:00", status: "SERVICE_INFORMATION", text: "Preannounced the December 2026 core update, which focuses on multiple improvements." }],
  },
  {
    ...R,
    id: "WLxcJyC6jMWMfryxsKMc",
    begin: "2026-11-10T18:06:00+00:00",
    end: "2026-11-24T14:03:00+00:00",
    external_desc: "November 2026 core update",
    updates: [
      { when: "2026-11-24T14:03:26+00:00", status: "AVAILABLE", text: "The rollout was complete as of November 24, 2026." },
      { when: "2026-11-10T18:07:10+00:00", status: "SERVICE_INFORMATION", text: "Released the November 2026 core update <https://developers.google.com/search/docs/appearance/core-updates>." },
    ],
  },
  {
    ...R,
    id: "XhUDXP7A67iHCD2kmbVu",
    begin: "2026-09-24T16:15:00+00:00",
    end: "2026-10-08T08:00:00+00:00",
    external_desc: "September 2026 spam update",
    updates: [{ when: "2026-09-24T16:15:47+00:00", status: "SERVICE_INFORMATION", text: "Released the September 2026 spam update." }],
  },
  {
    ...R,
    id: "mYbNTqV1ytDc2fA8hUz4",
    begin: "2026-02-05T17:00:00+00:00",
    end: "2026-02-27T10:00:00+00:00",
    external_desc: "February 2026 Discover core update",
    updates: [],
  },
  {
    id: "TZF4pLmbzFdoBPP6o3iv",
    service_key: "pKUD9XkLn3TBLquSpQMD",
    service_name: "Serving",
    begin: "2026-02-25T03:55:00+00:00",
    end: "2026-02-25T04:10:00+00:00",
    external_desc: "Serving issue",
  },
  { ...R, id: "broken", external_desc: "No begin" },
];

const december = feed[0] as { updates: object[] };
const parsed = parseStatusFeed(feed);
assert.deepEqual(
  parsed.map((u) => [u.name, u.kind, u.start, u.end, u.status]),
  [
    ["December 2026 core update", "core", "2026-11-24", null, "announced"],
    ["November 2026 core update", "core", "2026-11-10", "2026-11-24", "done"],
    ["September 2026 spam update", "spam", "2026-09-24", "2026-10-08", "done"],
    ["February 2026 Discover core update", "other", "2026-02-05", "2026-02-27", "done"],
  ],
);

// Once released, a preannounced update starts at the release, not at the announcement.
const released = parseStatusFeed([
  {
    ...december,
    updates: [
      { when: "2026-12-08T17:00:00+00:00", status: "SERVICE_INFORMATION", text: "Released the December 2026 core update. The rollout may take up to 2 weeks." },
      ...december.updates,
    ],
  },
])[0];
assert.equal(released.status, "rolling");
assert.equal(released.start, "2026-12-08");

assert.throws(() => parseStatusFeed({}));

// The feed wins over the seed; older seed entries stay.
const merged = mergeUpdates([{ ...parsed[1], end: "2026-11-25" }], SEED_UPDATES);
assert.equal(merged.filter((u) => u.name === "November 2026 core update").length, 1);
assert.equal(merged.find((u) => u.name === "November 2026 core update")!.end, "2026-11-25");
assert.ok(merged.some((u) => u.name === "March 2025 core update"));
assert.equal(merged[0].name, "December 2026 core update");

// The seed matches what the feed says for the entries above.
for (const u of parsed) {
  const seed = SEED_UPDATES.find((s) => s.id === u.id)!;
  assert.deepEqual({ ...seed }, { ...u }, u.name);
}

// March 2026: spam (24–25) and core (27 → Apr 8) are too close to tell apart.
const march = SEED_UPDATES.find((u) => u.name === "March 2026 spam update")!;
assert.deepEqual(overlapping(march, SEED_UPDATES), ["March 2026 core update"]);
assert.deepEqual(overlapping(SEED_UPDATES.find((u) => u.name === "June 2026 spam update")!, SEED_UPDATES), []);
console.log("ranking updates: ok");
