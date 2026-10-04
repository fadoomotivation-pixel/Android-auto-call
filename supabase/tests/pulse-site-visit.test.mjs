/**
 * The two site-visit blocks on the founder's Pulse, tested against the
 * source that ships.
 *
 * Same idea as pulse-grounding.test.mjs: the functions are lifted out of
 * pulse.ts and run. A copy kept here would stay green while the WhatsApp
 * text rotted.
 *
 *   node supabase/tests/pulse-site-visit.test.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../functions/_shared/pulse.ts"),
  "utf8",
);

const block = src.match(/\/\/ SITE_VISIT_BLOCKS_START\n([\s\S]*?)\n\/\/ SITE_VISIT_BLOCKS_END/);
if (!block) {
  console.error("Could not find the site-visit block in pulse.ts. FIX THIS TEST — do not delete it.");
  process.exit(1);
}
const fns = new Function(`${block[1]}\nreturn { siteVisitReasonLines, pendingVisitLines };`);
const { siteVisitReasonLines, pendingVisitLines } = fns();

let failed = 0;
function check(label, cond) {
  if (cond) console.log(`  ok    ${label}`);
  else {
    failed++;
    console.log(`  FAIL  ${label}`);
  }
}

// ── the measured Fanbe row: 2 outcomes, both not_reachable. Not a reason. ──
const thin = siteVisitReasonLines([{ outcome: "not_reachable", visits: 2 }]).join("\n");
check("two outcomes say how few", thin.includes("Only 2 outcomes are written down"));
check("two outcomes say too few", thin.includes("Too few to say why."));
check("two outcomes name no reason", !/not_reachable|Could not reach|%/.test(thin));

const one = siteVisitReasonLines([{ outcome: "price", visits: "1" }]).join("\n");
check("one outcome is singular", one.includes("Only 1 outcome is written down"));
check("a string count is still a count", one.includes("Too few to say why."));

check("nothing recorded prints nothing", siteVisitReasonLines([]).length === 0);
check("a zero row prints nothing", siteVisitReasonLines([{ outcome: "price", visits: 0 }]).length === 0);
check("missing input prints nothing", siteVisitReasonLines(undefined).length === 0);

// Enough rows to name a reason. The header still says how many were written
// down, and no percentage is invented on top of the count.
const enough = siteVisitReasonLines([
  { outcome: "price", visits: 6 },
  { outcome: "location", visits: 3 },
  { outcome: "booked", visits: 3 },
  { outcome: "family", visits: 2 },
  { outcome: "no_show", visits: 1 },
]).join("\n");
check("enough rows state the total", enough.includes("(15 written down)"));
check("enough rows name the biggest", enough.includes("• Rate too high: 6"));
check("enough rows name the next", enough.includes("• Wrong location: 3"));
check("a booked row is not a failure reason", !enough.includes("booked"));
check("only three reasons, the smallest stay off", !enough.includes("Did not come"));
check("no percentage", !enough.includes("%"));

const allBooked = siteVisitReasonLines([{ outcome: "booked", visits: 6 }]).join("\n");
check("all booked says so", allBooked.includes("6 written down") && allBooked.includes("booked"));
check("all booked invents no failure", !allBooked.includes("Why site visits don't happen"));

// ── pending visits: every overdue row, named. The flag is a mark, not a gate. ──
const pending = pendingVisitLines([
  { rep: "Ankita", lead: "Mukesh", daysWaiting: 62, needsManager: false },
  { rep: "Ankita", lead: "Rajbir", daysWaiting: 61, needsManager: true },
  { rep: "", lead: "Adv dhawan", daysWaiting: 91, needsManager: false },
  { rep: "Ankita", lead: "  ", daysWaiting: 10, needsManager: true },
  { rep: "Ankita", lead: "Ram Naresh Prasad", daysWaiting: 0, needsManager: false },
  { rep: "Shweta", lead: "Sonu", daysWaiting: null, needsManager: false },
]);
const pendingText = pending.join("\n");
check("header count is the named rows", pendingText.includes("(5)"));
check("oldest first", pending[2].includes("Adv dhawan") && pending[2].includes("91 days"));
check("no rep is said, not invented", pendingText.includes("No rep assigned — Adv dhawan"));
check("a flagged row is marked", pendingText.includes("Ankita — Rajbir · 61 days · needs a manager"));
check("an unflagged row is still listed", pendingText.includes("Ankita — Mukesh · 62 days"));
check("an unflagged row is not called a manager case",
  !pendingText.includes("Mukesh · 62 days · needs a manager"));
check("a blank lead is dropped", !pendingText.includes("10 day"));
check("under a day is not zero days", pendingText.includes("Ram Naresh Prasad · under a day"));
check("a missing day prints no number", /Shweta — Sonu$/.test(pendingText.split("\n").find((l) => l.includes("Sonu")) ?? ""));

const none = pendingVisitLines([{ rep: "Ankita", lead: "", daysWaiting: 40, needsManager: true }]);
check("no names means no count", none.length === 0);

// The queries that feed the blocks stay company-scoped. A service-role read
// with no company filter would put one tenant's leads on another's phone.
const intel = src.slice(src.indexOf('from("v_site_visit_intelligence")'), src.indexOf('from("v_site_visit_intelligence")') + 180);
const pend = src.slice(src.indexOf('from("v_pending_site_visit_outcomes")'), src.indexOf('from("v_pending_site_visit_outcomes")') + 280);
check("intelligence view is read", src.includes('from("v_site_visit_intelligence")'));
check("intelligence view is company scoped", intel.includes('.eq("company_id", companyId)'));
check("share_pct is not selected", !intel.includes("share_pct"));
check("pending view is read", src.includes('from("v_pending_site_visit_outcomes")'));
check("pending view is company scoped", pend.includes('.eq("company_id", companyId)'));
check("founder text calls both blocks", src.includes("siteVisitReasonLines(p.visitReasons)") && src.includes("pendingVisitLines(p.pendingVisits)"));

if (failed) {
  console.error(`\n${failed} failed. A founder reads this on a phone and cannot check it.`);
  process.exit(1);
}
console.log("\nAll site-visit pulse cases pass.");

// Sample, from the rows measured on 4 Oct 2026. Printed so a reviewer can
// read the message. Not an assertion — the checks above are.
const fanbePending = [
  ["Ankita", "Mukesh", 62],
  ["Ankita", "Rajbir", 61],
  ["Ankita", "YOGESH_RAJPUT_UP_16", 61],
  ["Ankita", "Arun", 61],
  ["Ankita", "Avhi", 60],
  ["Ankita", "Anuj", 59],
  ["Ankita", "vinod", 57],
  ["Ankita", "Govind", 56],
  ["Ankita", "Ajay", 56],
  ["Ankita", "Avni__112233", 55],
  ["Ankita", "Parmod kumar", 54],
  ["Ankita", "Munesh", 51],
  ["Ankita", "Kanhaiyalalsharma", 50],
  ["Ankita", "Ram Naresh Prasad", 14],
].map(([rep, lead, daysWaiting]) => ({ rep, lead, daysWaiting, needsManager: false }));
console.log("\n--- sample, Fanbe, 4 Oct measurement ---");
console.log(siteVisitReasonLines([{ outcome: "not_reachable", visits: 2 }]).join("\n"));
console.log(pendingVisitLines(fanbePending).join("\n"));
