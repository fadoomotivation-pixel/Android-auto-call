/**
 * The grounding guard, tested against the source that actually ships.
 *
 * It extracts the regexes and grounded() out of pulse.ts at runtime rather than
 * keeping a copy here. A test with its own copy of the logic passes forever
 * while the real thing rots — and the entire reason this guard exists is that a
 * second, unchecked source of truth told a founder things that never happened.
 *
 * Twice now:
 *
 *   4 Aug 2026 — "Yogesh Rajput booked a site visit for UP-16 and paid the
 *   token amount to hold the unit", in a message whose own KPI block three
 *   lines above said "Bookings: 0". token_amount was NULL. The founder went
 *   looking for money that did not exist.
 *
 *   6 Aug 2026 — "✅ Anuj visited the site today and showed strong interest in
 *   a 2BHK unit near the park". Anuj had a slot booked for 4pm and never came
 *   (site_visit_arrived_at NULL); there were ZERO calls to him all day, so
 *   nobody could have learned what he liked; and site_visit_project and notes
 *   are both NULL — there is no 2BHK and no park in this database. The rep
 *   caught it in minutes because she was there. The founder could not have.
 *
 * It lives OUTSIDE supabase/functions/ on purpose. It sat in
 * functions/_shared/__tests__/ for about twenty minutes and took the Daily
 * Pulse down with it. Nothing that is not an edge function may live under that
 * directory.
 *
 *   node supabase/tests/pulse-grounding.test.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../functions/_shared/pulse.ts"),
  "utf8",
);

// Everything from the first guard constant to the end of grounded(). Pulled as
// one block so the test cannot drift from the shipped implementation.
const m = src.match(
  /const MONEY_CLAIM =\n([\s\S]*?)\nfunction grounded\(\n[\s\S]*?\n\): string \{\n([\s\S]*?)\n\}\n/,
);
if (!m) {
  console.error(
    "Could not find grounded() in pulse.ts. If it was renamed, FIX THIS TEST — do not\n" +
    "delete it. This guard is the only thing standing between an AI sentence and a\n" +
    "founder believing a customer paid, or came to the site, when neither happened.",
  );
  process.exit(1);
}
const grounded = new Function(
  "line", "r", "factsText",
  `const MONEY_CLAIM =\n${m[1]}\n${m[2]}`,
);

// The real shape of the facts blob the model is handed.
const NOTHING_CONFIRMED = JSON.stringify({
  rep: "Ankita", calls: 21, connected: 13,
  visits_confirmed_on_site: [],
  visits_only_booked_for_today_NOT_confirmed: [
    "Anuj — said they would come today; nobody has confirmed they arrived",
  ],
  voice_note_summaries: [
    "Dhananjay: Call did not connect; the customer's phone was not answered.",
  ],
});
const REP_NOTED_DETAIL = JSON.stringify({
  visits_confirmed_on_site: ["Anuj"],
  voice_note_summaries: ["Anuj: liked the 2 BHK, wants a park facing unit"],
});

const NO_MONEY_NO_VISIT = { bookings: 0, revenue: 0, visitsArrived: [] };
const REAL_BOOKING = { bookings: 1, revenue: 50000, visitsArrived: [] };
const REAL_VISIT = { bookings: 0, revenue: 0, visitsArrived: ["Anuj"] };

/** [what it is, the line, the rep's real facts, the facts blob, keep?] */
const cases = [
  // ── the two lines that actually reached a founder ──
  ["6 Aug, verbatim",
    "Anuj visited the site today and showed strong interest in a 2BHK unit near the park",
    NO_MONEY_NO_VISIT, NOTHING_CONFIRMED, false],
  ["4 Aug, verbatim",
    "Yogesh Rajput booked a site visit for UP-16 and paid the token amount to hold the unit.",
    NO_MONEY_NO_VISIT, NOTHING_CONFIRMED, false],

  // ── a visit nobody checked in for ──
  ["came to the site", "Anuj came to the site today", NO_MONEY_NO_VISIT, NOTHING_CONFIRMED, false],
  ["turned up", "Anuj turned up at the project", NO_MONEY_NO_VISIT, NOTHING_CONFIRMED, false],
  ["site visit done", "Site visit done for Anuj", NO_MONEY_NO_VISIT, NOTHING_CONFIRMED, false],

  // ── the honest wording the prompt itself asks for MUST survive ──
  ["agreed to visit", "Anuj agreed to visit the site today", NO_MONEY_NO_VISIT, NOTHING_CONFIRMED, true],
  ["was due at the site", "Anuj was due at the site at 4 PM but has not confirmed",
    NO_MONEY_NO_VISIT, NOTHING_CONFIRMED, true],
  ["future tense", "Kuldeep will visit the site on Friday", NO_MONEY_NO_VISIT, NOTHING_CONFIRMED, true],

  // ── invented product detail, with and without a real visit ──
  ["invented BHK even on a real visit", "Anuj visited and liked the 2BHK",
    REAL_VISIT, NOTHING_CONFIRMED, false],
  ["invented park", "Anuj asked about the park facing units", NO_MONEY_NO_VISIT, NOTHING_CONFIRMED, false],
  ["detail the rep actually recorded", "Anuj visited and liked the 2 BHK, park facing",
    REAL_VISIT, REP_NOTED_DETAIL, true],

  // ── money ──
  ["invented token", "Anuj paid the token to hold the unit", NO_MONEY_NO_VISIT, NOTHING_CONFIRMED, false],
  ["real booking keeps its money", "Yogesh paid the token amount today",
    REAL_BOOKING, NOTHING_CONFIRMED, true],

  // ── an ordinary true sentence must pass untouched ──
  ["plain honest win", "Kuldeep asked for details and will confirm tomorrow",
    NO_MONEY_NO_VISIT, NOTHING_CONFIRMED, true],
];

let failed = 0;
for (const [label, line, rep, facts, shouldKeep] of cases) {
  const out = grounded(line, rep, facts);
  const kept = out !== "";
  if (kept === shouldKeep) {
    console.log(`  ok    ${shouldKeep ? "keep" : "DROP"}  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${shouldKeep ? "keep" : "DROP"}  ${label}`);
    console.log(`          line: ${JSON.stringify(line)}`);
    console.log(`          got:  ${JSON.stringify(out)}`);
  }
}

if (failed) {
  console.error(
    `\n${failed} of ${cases.length} failed.\n` +
    "A founder acts on this report and cannot check it. Do not ship a weakened guard.",
  );
  process.exit(1);
}
console.log(`\nAll ${cases.length} grounding cases pass.`);
