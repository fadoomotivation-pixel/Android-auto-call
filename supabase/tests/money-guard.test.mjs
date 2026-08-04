/**
 * The money guard, tested against the source that actually ships.
 *
 * It extracts MONEY_CLAIM and moneySafe() out of pulse.ts at runtime rather
 * than keeping a copy here. A test with its own copy of the logic passes
 * forever while the real thing rots — and the whole reason this guard exists is
 * that a second, unchecked source of truth told the founder a customer had paid
 * when nobody had.
 *
 * It lives OUTSIDE supabase/functions/ on purpose. It sat in
 * functions/_shared/__tests__/ for about twenty minutes and took the Daily
 * Pulse down with it — see the commit message. Nothing that is not an edge
 * function may live under that directory.
 *
 *   node supabase/tests/money-guard.test.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../functions/_shared/pulse.ts"), "utf8");
const m = src.match(
  /const MONEY_CLAIM =\n([\s\S]*?);\n\nfunction moneySafe\(line: string, r: \{ bookings: number; revenue: number \}\): string \{\n([\s\S]*?)\n\}\n/,
);
if (!m) {
  console.error("Could not find the money guard in pulse.ts. If it was renamed, fix this test —\n" +
    "do not delete it: the guard is the only thing standing between an AI sentence and a\n" +
    "founder believing money arrived.");
  process.exit(1);
}
const moneySafe = new Function("line", "r",
  `const MONEY_CLAIM =\n${m[1]};\n${m[2]}`);

const NO_MONEY = { bookings: 0, revenue: 0 };
const REAL_BOOKING = { bookings: 1, revenue: 50000 };

// The first is verbatim the line that reached the founder on 4 Aug 2026, for a
// lead whose real state was site_visit with token_amount NULL.
const mustBlock = [
  "Yogesh Rajput booked a site visit for UP-16 and paid the token amount to hold the unit.",
  "Krishanpal Singh paid ₹50,000 today.",
  "Sonu Aazmi gave the token amount this morning.",
  "Rajbir made the down payment and blocked the unit.",
  "Arun signed the agreement at the site.",
  "Pooja transferred the advance for flat 302.",
  "Brijmohan handed over a cheque for the booking amount.",
  "Naseer completed the registration formalities.",
  "Sachin has booked the corner unit.",
  "Gopal paid a deposit to hold the unit.",
];

// Real progress with no money claimed. A guard that eats these makes the report
// useless, and a useless report gets switched off — which is a worse outcome
// than the bug it was built to fix. Every one of these is a real sentence the
// Pulse has sent.
const mustPass = [
  "Sonu Aazmi committed to a site visit within 2 days.",
  "Krishanpal Singh has visited but no feedback yet.",
  "Arun and Rajbir both said they will visit but did not fix a time.",
  "Yogesh Rajput booked a site visit for UP-16.",
  "Sonu Aazmi agreed to visit the site tomorrow at 11 AM with his brother for the 3BHK unit in Tower C.",
  "Abhay Kumar's callback time wasn't set—if we don't confirm today, he'll slip to next week.",
  "15 leads with no answer moved to Cold.",
];

let failures = 0;
const check = (name, cases, ctx, want) => {
  let bad = 0;
  for (const line of cases) {
    const got = moneySafe(line, ctx);
    const ok = want === "" ? got === "" : got === line;
    if (!ok) { bad++; console.log(`  ✗ ${line}`); }
  }
  failures += bad;
  console.log(`${name}: ${cases.length - bad}/${cases.length}`);
};

check("blocked when the CRM shows no money", mustBlock, NO_MONEY, "");
check("kept when no money is claimed      ", mustPass, NO_MONEY, "same");
check("kept when the CRM agrees           ", mustBlock, REAL_BOOKING, "same");

console.log(failures === 0 ? "\nPASS" : `\nFAIL — ${failures} case(s)`);
process.exit(failures === 0 ? 0 : 1);
