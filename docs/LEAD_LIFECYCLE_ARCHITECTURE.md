# Lead lifecycle: architecture review and migration plan

Principal-architect review of the lead status model across the Supabase schema,
the Next.js dashboard and the Android telecaller app.

All figures are from production on **5 Aug 2026** — 784 contacts, data from
9 Jun 2026 onward. Every claim below is a query or a file:line, not an opinion.

> **Correction to the previous audit (`LEAD_STAGE_MODEL.md`, PR #374).** That
> document opened with "`contacts.status` is free text — no check constraint, no
> enum." **That is wrong.** I tested for a CHECK constraint, found none, and
> concluded free text without testing the column type. `contacts.status` is
> `contact_status`, an 18-value Postgres **enum**, `NOT NULL DEFAULT 'new'`.
> The conclusions in that doc still hold, but the root cause is the opposite of
> what I said: the problem is not the absence of a canonical list, it is that
> **the canonical list conflates two different concepts.** This document
> supersedes it.

---

## A. Executive summary

There *is* a canonical list. It is the wrong shape.

`contact_status` holds 18 values, and they are not all the same kind of thing.
Eleven describe **where the deal is** (`new`, `interested`, `site_visit`,
`negotiation`, `token_paid`, `booked`, `lost`, …). Seven describe **what
happened on the last call** (`queued`, `called`, `no_answer`, `busy`,
`wrong_person`, `callback`, `follow_up`). One column, two axes, and only one
can win — so writing the second erases the first.

That is not a naming problem. It is destroying data every day:

- **40.2% of all leads (315/784) currently store a call outcome in the stage
  column.** For those leads the system does not know where the deal is. Not
  "shows it confusingly" — does not know.
- **26% of every lead that ever qualified has been silently demoted.** 76 leads
  have reached Interested or Site Visit at some point; 20 of them now sit on
  `callback`/`follow_up`. One unanswered call overwrote the qualification.
- Because stage is unreliable, every consumer invented its own grouping to
  compensate: **13 Postgres functions, 14 edge functions and both clients** each
  hardcode their own idea of open/closed/won. They disagree.

The UI confusion the telecallers report is the *symptom*. The tabs look
overlapping because they are trying to render two axes on one row, from a column
that can only hold one.

**The fix is decomposition, not renaming.** Keep `status` and narrow its meaning
to *last disposition* — it is genuinely useful and every existing writer keeps
working. Add `stage` as a new column backed by a **lookup table** carrying
label, colour, order and semantics. Derive **action state** from
`follow_ups.due_at`; never store it. A database trigger keeps `stage` correct
from day one, so nothing has to be dual-written and rollback is `DROP COLUMN`.

---

## B. What is broken today

### B1 · The enum mixes lifecycle and action — the root cause

`contact_status`, in declared order:

| # | Value | Actually a… |
|---|---|---|
| 1 | `new` | stage |
| 2 | `queued` | **action** (dial queue) |
| 3 | `called` | **action** (outcome) |
| 4 | `no_answer` | **action** (outcome) |
| 5 | `busy` | **action** (outcome) |
| 5.5 | `wrong_person` | **action** (outcome) |
| 6 | `interested` | stage |
| 7 | `not_interested` | stage (terminal) |
| 8 | `callback` | **action** (a scheduled task) |
| 9 | `dnc` | stage (terminal) |
| 10 | `invalid` | data quality, not a stage |
| 11 | `follow_up` | **action** |
| 12 | `booked` | stage (won) |
| 13 | `lost` | stage (terminal) |
| 14 | `site_visit` | stage |
| 15 | `proposal` | stage |
| 16 | `negotiation` | stage |
| 17 | `token_paid` | stage |

Note `enumsortorder = 5.5` — a value inserted with `ALTER TYPE … ADD VALUE
BEFORE`. The declared order is accretion history, **not funnel order**:
`not_interested`(7) sits between `interested`(6) and `callback`(8);
`booked`(12) precedes `site_visit`(14). Any `ORDER BY status` produces
nonsense, and the enum's ordinality is unusable as progression.

### B2 · Stage regression is unguarded — the funnel drains

`supabase/functions/voice-note-ai/index.ts:445`

```ts
const locked = contact.status === "booked" || contact.status === "token_paid";
const wouldUndoWin = locked && !["booked", "token_paid"].includes(disposition);
if (!wouldUndoWin) {
  await admin.from("contacts").update({ status: disposition }).eq("id", contact.id);
}
```

Only `booked` and `token_paid` are protected. An `interested` or `site_visit`
lead whose next voice note is "no answer, call back" has its stage **overwritten
with `callback`**. The qualification is gone from `status` and survives only as
English prose in `lead_activities.detail`.

Measured: of the 76 leads that ever reached Interested or Site Visit, **20 now
sit on `callback`/`follow_up`.** This is the mechanism that produced 240
callbacks against 46 interested.

### B3 · Status history is prose, not data

```
detail: "Stage → Callback (from voice note)"      meta: null
```

821 `type='status'` rows in `lead_activities`, all display strings, `meta` always
null. **There is no machine-readable stage history**, so the demoted leads in B2
cannot be restored programmatically without parsing English — the exact
anti-pattern already ruled out on this project ("don't use display text as
application logic"). This is the hardest constraint on the migration.

### B4 · Conflicting definitions of the same concept

"Closed" / "won" / "open", each hardcoded independently:

| Location | Definition |
|---|---|
| `0020_manager_digests.sql:37` | closed = booked, lost, dnc, not_interested |
| `0051_assign_makes_lead_fresh.sql:26` | open = not in (booked, lost, not_interested, dnc) |
| `0100_geofenced_round_robin.sql:211` | open = not in (booked, lost, not_interested, dnc, **invalid**) |
| `0112_close_followups_on_lead_closed.sql:26` | closed = not_interested, lost, dnc, booked, **token_paid** |
| `focus-five/index.ts:24` | CLOSED = booked, lost, dnc, not_interested |
| `lead-insights/index.ts:22` | CLOSED = booked, lost, dnc, not_interested |
| `win-harvest/index.ts:28` | **WON = site_visit, negotiation, proposal, token_paid, booked** |
| `sales-velocity/index.ts:40` | ADVANCED = interested, site_visit, negotiation, proposal, token_paid, booked |
| `knowledge-sync/index.ts:92` | won = booked, token_paid |
| App `TelecallerScreens.kt:1355` | closedSet = lost, not_interested, dnc, invalid — **excludes booked** |

`token_paid` is *closed* in 0112 (its follow-ups get cancelled) and *open* in
0100 (still eligible for round-robin). The app's "Closed" tab excludes `booked`;
every backend definition includes it. **13 Postgres functions** and **14 edge
function files** reference these groupings.

### B5 · `win-harvest` is training the shared AI brain on non-wins

`win-harvest/index.ts:28` defines a win as reaching **site_visit**. Production:

| | |
|---|---|
| `knowledge_chunks` with `source_kind='win'` | **28** |
| Contacts ever at `booked` or `token_paid` | **0** |
| Contacts at `site_visit`/`negotiation`/`proposal` | 22 |

**All 28 "what worked" chunks in the shared brain were distilled from leads that
never closed.** Per `CLAUDE.md` these feed `match_knowledge` for every rep in
every company. The coach is teaching the tactics of getting a site visit and
calling them wins.

This is not necessarily reps failing to close — the dataset is 8 weeks old and
real-estate cycles are long. But `booked` and `token_paid` have **never been
written**, so the two terminal states are entirely unexercised in production and
`win-harvest`'s definition hides that fact rather than surfacing it.

### B6 · The app carries two taxonomies; the web carries a third

- `TelecallerScreens.kt:124` — `STAGES`, a 7-step funnel. **Home** counts with
  this (line 597).
- `TelecallerScreens.kt:1606` — tab buckets All/New/Today/Follow-up/Working/
  Pipeline/Booked/Closed. **Leads** counts with this.
- `admin/app/dashboard/leads/LeadManager.tsx:25` — `STATUS_FILTERS`, 9 chips.

Consequences, measured:

- **`closed` means opposite things in one file.** `Stage("closed", "Booked", …)`
  at line 136 is the **won** stage; the tab keyed `closed` at line 1457 is the
  **lost** pile.
- **6 leads are in Pipeline *and* Follow-up right now.** The mutual-exclusion fix
  applied to `Working` (line 1451) was never applied to `Pipeline`.
- **91 leads (11.6%) cannot be selected by any web chip** — `called` 45,
  `follow_up` 19, `dnc` 16, `no_answer` 11. Meanwhile 3 chips
  (`negotiation`, `token_paid`, `booked`) match zero rows.
- The web has **no status colours at all**; the app has 7. `admin/lib/dashboard/`
  has `format/health/metrics/modules/scope` and no `stage.ts`.

### B7 · Smaller, real

- **`follow_ups` has two completion sources**: `status` text (`pending`/`done`)
  and `completed_at`. They currently agree exactly (220/158, zero drift) — a
  redundancy to resolve before it becomes a bug, not a live defect.
- **94 leads carry a call outcome with `attempts = 0`** (50 `callback`, 42
  `called`, 2 `follow_up`) — dispositions set without a recorded dial.
- **`_shared/pulse.ts:133`** derives a count by regex over display prose:
  `leadsWhere(/(callback|follow[\s-]?up)/i)` against `m.detail`. The output
  sentence is correct, but the count is computed from UI text.
- **`invalid`** is a data-quality flag living in the lifecycle enum.

---

## C. Recommended canonical model

### C1 · Decision: hybrid — narrow the enum, add a lookup table

**Recommendation: lookup table for stage; keep the enum for disposition.**

| Option | Verdict |
|---|---|
| Extend the existing enum | **No.** Cannot carry label/colour/order/semantics; values cannot be removed or reordered (the schema already bears the `5.5` scar); both clients would keep hardcoding metadata — which *is* the current bug. |
| Replace with an enum + side metadata table | **No.** Two objects to keep in sync for one concept. |
| **Lookup table `lead_stages`, FK from `contacts.stage`** | **Yes.** FK gives the same integrity as an enum. One row set owns code + label + colour + order + semantics, so labels and colours cannot drift between app and web. Fetchable at runtime by both clients. Adding a stage is a data change, not a migration plus two app releases. |
| Drop `status` | **No.** "What happened on the last call" is real, useful, and written by many callers. Narrowing its meaning is free; removing it breaks everything. |

### C2 · `lead_stages`

| code | label | colour | sort | terminal | outcome | rep_visible | analytics |
|---|---|---|---|---|---|---|---|
| `new` | New | `#6A7B85` | 10 | no | open | yes | yes |
| `contacted` | Contacted | `#3E7F8A` | 20 | no | open | yes | yes |
| `interested` | Interested | `#C98A3E` | 30 | no | open | yes | yes |
| `site_visit` | Site visit | `#75629B` | 40 | no | open | yes | yes |
| `negotiation` | Negotiation | `#8A6D3B` | 50 | no | open | yes | yes |
| `token_paid` | Token paid | `#5A62C9` | 60 | no | open | yes | yes |
| `won` | Won | `#3E7F5A` | 70 | **yes** | **won** | yes | yes |
| `lost` | Lost | `#C0452C` | 80 | **yes** | **lost** | yes | yes |
| `dnc` | Do not call | `#5D6862` | 90 | **yes** | lost | yes | yes |
| `invalid` | Bad number | `#4A4A4A` | 99 | **yes** | excluded | **no** | **no** |

`won` replaces the overloaded `closed`/`booked` key. `invalid` is separated as a
data-quality terminal excluded from funnel analytics — today it silently
pollutes "lost".

### C3 · Mapping from the existing enum

| `contact_status` | → `stage` | → keeps as disposition |
|---|---|---|
| `new` | `new` | — |
| `queued` | `new` | `queued` |
| `called` | `contacted` | `called` |
| `no_answer` | `contacted` | `no_answer` |
| `busy` | `contacted` | `busy` |
| `wrong_person` | `contacted` | `wrong_person` |
| `callback` | `contacted` | `callback` |
| `follow_up` | `contacted` | `follow_up` |
| `interested` | `interested` | — |
| `site_visit` | `site_visit` | — |
| `proposal` | `negotiation` | `proposal` |
| `negotiation` | `negotiation` | — |
| `token_paid` | `token_paid` | — |
| `booked` | `won` | — |
| `not_interested` | `lost` | `not_interested` |
| `lost` | `lost` | — |
| `dnc` | `dnc` | — |
| `invalid` | `invalid` | — |

All 18 map. Nothing falls through.

**The 315 action-status leads all collapse to `contacted`.** That is honest — it
is genuinely all the column knows — but it means stage is *under-informative*
for 40% of the book on day one, and B3 says history cannot restore it. See F4.

### C4 · The monotonic rule — the behavioural fix that matters most

> **Stage never moves backwards except by explicit human action.**

A disposition write may only *advance* stage (`sort` increases) or leave it
unchanged. A `no_answer` on an `interested` lead sets
`disposition = 'no_answer'` and leaves `stage = 'interested'`. Only a rep
choosing "Not interested / Lost / DNC" in the UI may move a lead down.

Enforced in one trigger, not in every caller. Without this rule the new column
drains exactly as the old one did.

### C5 · Action state — derived, never stored

`v_lead_action_state`, one row per open lead:

| state | rule | rep meaning |
|---|---|---|
| `overdue` | `due_at < today 00:00 IST` | Late. Top of the list |
| `due_today` | `due_at::date = today IST` | Today's promises |
| `call_now` | `due_at <= now()` | Its time has come |
| `scheduled` | `due_at > now()` | A plan. Arrives on its own |
| `awaiting_visit` | `site_visit_at > now()` and no earlier `due_at` | Waiting on the visit |
| `no_next_step` | open stage, no pending follow-up | **The leak** |
| `none` | terminal stage | Complete |

Precedence: `overdue` → `call_now` → `due_today` → `awaiting_visit` →
`scheduled` → `no_next_step`. Mutually exclusive by construction.

`no_next_step` is the one genuinely new view: an open lead nobody has planned
anything for. Today it is invisible on both surfaces.

**"Today" is a date filter on this view. It is not a stage.**

### C6 · Canonical owner per concept

| Concept | Owner | Everyone else |
|---|---|---|
| Stage vocabulary, labels, colours, order, semantics | `lead_stages` table | reads |
| A lead's stage | `contacts.stage` (FK) | reads |
| Last call outcome | `contacts.status` (enum, narrowed) | reads |
| Whether a stage is open/won/lost | `lead_stages.outcome` | **replaces all 10 hardcoded lists in B4** |
| Next action & urgency | `v_lead_action_state` | reads |
| Follow-up completion | `follow_ups.completed_at` | drop `status` text (B7) |
| Counts for any bucket | `v_lead_workstate` | app, web, AI all query this |

---

## D. Mobile app UX recommendation

Classify first, as instructed:

| Today's tab | It is actually… | Verdict |
|---|---|---|
| All | no filter | keep, not as a peer chip |
| New | **lifecycle stage** | keep |
| Today | **action state** (date filter) | demote to filter |
| Follow-up | **action state** (three of them) | split onto the action row |
| Working | *neither* — stage + action mashed | **remove** |
| Pipeline | **analytics bucket** (group of stages) | demote to filter |
| Booked | lifecycle stage | keep, rename **Won** |
| Closed | lifecycle stage, mislabelled | **split** → Won / Lost |

### Two rows, each labelled with the question it answers

**Row 1 — "What to do now"** (action state; cross-cutting; the working list)

`Overdue` · `Call now` · `Due today` · `Scheduled` · `No next step`

Row 1 is the default landing view. Only `Overdue` + `Call now` may power-dial —
this preserves the existing rule in `CLAUDE.md` that the deck's count and the
dialer use *due* work only, never the whole tab.

**Row 2 — "Where the deal is"** (stage; mutually exclusive; sums to the book)

`New` · `Contacted` · `Interested` · `Site visit` · `Negotiation` ·
`Token paid` · `Won` · `Lost`

`DNC` and `Bad number` behind an overflow — they are real but not daily work.

The two rows compose: *Interested × Overdue* is one tap and is the highest-value
list in the product.

### Keep

The one-line explanation under every tab (`TelecallerScreens.kt:1635`) is
already correct and is the single best thing in the current UI. It survives
verbatim where the tab survives. The Follow-up three-way split (Call now / Done
today / Booked for later) is the correct model — row 1 generalises it.

### Speed

Both rows are counted from **one** query against `v_lead_workstate`, replacing
the eight per-tab `app.leads.count { … }` passes at lines 1607–1620 (each a full
scan of up to 900 leads, re-run on every recomposition).

---

## E. Web dashboard UX recommendation

30 pages, 28 sidebar links, no grouping. Classify:

| Class | Pages |
|---|---|
| **Operational** (act on a lead now) | `actions`, `leads`, `today`, `calls`, `contacts`, `recordings` |
| **Analytics** (understand the business) | `page.tsx` (Overview), `velocity`, `xray`, `reports`, `platform/hq` |
| **Configuration** | `automations`, `routing`, `pulse`, `whatsapp`, `facebook`, `capture`, `projects`, `content`, `rag` |
| **Platform / super-admin** | `platform/*`, `ads`, `apps` |
| **Diagnostics** | `health`, `integrity`, `attendance`, `coach`, `salespeople` |

Recommendations:

1. **Group the sidebar under those five headings.** 28 flat links is the real
   navigation problem; no page needs deleting to fix it.
2. **Chips must be generated from `lead_stages`**, not the hand-written
   `STATUS_FILTERS` list — this alone fixes the 91 unreachable leads and the 3
   dead chips, permanently.
3. **Add the action-state row to `/dashboard/leads`**, identical to mobile row 1.
   A manager and a rep should be looking at the same two axes.
4. **Adopt `lead_stages.colour` on the web.** It currently has no status colours;
   this is where rule 9 ("same colours") gets satisfied for free.
5. **Merge `/dashboard/today` into `/dashboard/actions`** — Today is a filter,
   the same demotion as mobile.
6. **`/dashboard/velocity` and `/dashboard/xray` become widgets on Overview**
   with drill-through, rather than two more top-level analytics pages.
7. **`admin/lib/dashboard/stage.ts`** — the single TS accessor, beside the
   existing `format.ts` / `health.ts` / `metrics.ts`.

---

## F. Migration plan

Design goal: **no dual-write, no flag day, and `DROP COLUMN` as rollback.**

Clients keep writing `status` exactly as they do today. A trigger derives
`stage`. Readers move over one at a time. Nothing has to be coordinated.

### F1 · Phase 1 — model, invisible (no UI change)

1. `lead_stages` table, seeded (C2). Readable by all authenticated users; writes
   super-admin only.
2. `contacts.stage text references lead_stages(code)`, nullable at first.
3. `lead_stage_for(status contact_status) → text` — the C3 mapping, one place.
4. Backfill: `update contacts set stage = lead_stage_for(status)`.
5. **Trigger `BEFORE INSERT OR UPDATE`** applying C3 *and the monotonic rule*
   (C4): stage may only advance unless the caller explicitly sets it.
6. `v_lead_action_state` (C5) and `v_lead_workstate` (stage + action + due_at).
7. Set `stage NOT NULL DEFAULT 'new'` once backfill verifies.

Nothing reads `stage` yet. Ship and observe for a week.

### F2 · Phase 2 — prove the counts before anyone sees them

A drift check comparing every existing hardcoded bucket against the new model,
run as a scheduled query for one week:

```sql
-- must return zero rows
select 'closed' as bucket, count(*) filter (where old) as old_n,
       count(*) filter (where new) as new_n
from (
  select status::text in ('booked','lost','dnc','not_interested') as old,
         s.outcome in ('won','lost') as new
  from contacts c join lead_stages s on s.code = c.stage
) t having count(*) filter (where old) <> count(*) filter (where new);
```

**Counts cannot be allowed to drift silently — this is the gate for Phase 3.**
Expect exactly two deliberate differences, and approve them explicitly:
`invalid` leaves "lost", and `token_paid` stops being "closed" (0112).

### F3 · Phase 3 — readers move, one surface at a time

Order chosen so the riskiest change is last and each step is independently
revertable:

1. Web chips + colours from `lead_stages` (visible, low risk, fixes 91 leads).
2. Edge functions + Postgres functions from hardcoded lists → `lead_stages.outcome`.
   **`win-harvest`'s `WON` becomes `outcome = 'won'`** (B5).
3. Analytics/reports onto `v_lead_workstate`.
4. **Android two-row UI last.** It is what nine telecallers see every morning,
   and it should not move until 1–3 have been stable for a week.

### F4 · The 315 ambiguous leads

They map to `contacted`, which is all the data supports. Do **not** guess a
richer stage from prose (B3). Two honest remedies:

- **Forward:** once C4 is live, stage stops being destroyed, and the book
  self-corrects as reps work.
- **Backward, optional and manual:** the 20 demoted leads in B2 are identifiable
  today. Present them to their rep as a one-time *"was this lead still
  interested?"* prompt through the existing `rep_prompts` engine
  (`AssistantPrompts.kt`) — never as a silent bulk `UPDATE`. 20 is a small
  enough number to ask about.

### F5 · Rollback

| Phase | Rollback |
|---|---|
| 1 | `drop trigger`, `drop column stage`, `drop view`, `drop table lead_stages`. No existing column touched. |
| 2 | Nothing to roll back — read-only checks. |
| 3 | Per-surface revert; `status` is still being written throughout, so any reader can go back to the old grouping. |

The migration is safe **because `status` is never stopped, renamed or rewritten.**
A rename would not be safe: 18 enum values across 13 Postgres functions, 14 edge
functions and two clients, with no way to remove an enum value afterwards.

---

## G. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Counts shift when `token_paid` stops being "closed" (0112) and `invalid` leaves "lost" | **High** — founder-facing numbers move | F2 gate makes both differences explicit and approved before any UI ships |
| `stage` is under-informative for 40% of leads on day one | **High** | Say so in the UI (`Contacted` is honest); C4 stops further loss; F4 handles the 20 recoverable |
| Trigger + explicit writes fight each other | Medium | One trigger owns the rule; explicit stage writes are allowed and win. Unit-test both paths |
| Two models live at once during Phase 3 | Medium | Both derive from `status`, so they cannot disagree; F2 proves it weekly |
| Reps confused by a two-row UI | Medium | The row headings *are* the explanation; keep the existing one-line hints; ship to one rep first |
| `win-harvest` reclassification empties the win brain | Medium | With `outcome='won'` there are currently **zero** wins, so harvesting stops until a real booking exists. That is correct, and the 28 existing chunks should be re-labelled `source_kind='progress'`, not deleted |
| Enum can never be cleaned up | Low, permanent | Accepted. `status` is narrowed in meaning, not in values |

---

## H. Implementation priority

Ranked by business impact, not by effort:

1. **Stop the funnel draining (C4 monotonic rule).** Every day without it,
   qualified leads become `callback`. Highest value, smallest change — a trigger.
   Can ship *before* anything else, against the existing column.
2. **Fix `win-harvest`'s WON (B5).** The shared AI brain is teaching site visits
   as wins to every rep in every company. One-line definition change.
3. **`lead_stages` + `stage` + views (F1).** Unblocks everything else.
4. **Web chips from the table (B6).** 91 leads currently unreachable by any filter.
5. **Pipeline ∩ Follow-up double-count (B6).** 6 leads today; the visible symptom
   the telecallers reported.
6. **Retire the 10 hardcoded open/closed lists (B4).**
7. **Android two-row UI (D).** Highest UX value, highest blast radius — last.
8. **Sidebar grouping (E1)**, `follow_ups.status` removal (B7).

Items 1 and 2 are each under twenty lines and are worth shipping this week,
independently of the rest.

---

## I. Final recommendation

**Several phased migrations, with a trigger-maintained derived column — not a
dual-write period, and not one big migration.**

Dual-write is the wrong tool here. It is for when two systems must both be
authoritative during a cutover. That is not this situation: `stage` is a
*function of* `status` plus a monotonic rule, so a trigger keeps it exact with
zero client changes. Asking the Android app, the web app and 14 edge functions
to write two columns in step would introduce precisely the drift the project is
trying to eliminate.

Concretely:

- **Migration 0143** — monotonic stage guard on the existing column (priority 1).
  Ships alone, immediately.
- **Migration 0144** — `lead_stages`, `contacts.stage`, `lead_stage_for()`,
  trigger, `v_lead_action_state`, `v_lead_workstate`, backfill.
- **Migration 0145+** — one per consumer group, retiring hardcoded lists.
- **Application PRs** — web chips, then edge functions, then Android, each behind
  its own review.

And the one thing I would not do: **do not rewrite `contacts.status` values, and
do not rename the enum.** Stage is derived from disposition, not a replacement
for it. Rewriting 784 rows of history into a new vocabulary risks every report in
the product and buys nothing the mapping does not already give.
