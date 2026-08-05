# One lead status model, shared by the app and the dashboard

Audit + recommendation. No code changed yet — this is the design to agree before
building, because it touches the phone, the web board and every report.

Numbers below are from production on 5 Aug 2026 (784 contacts).

---

## 1 · What is actually wrong

### 1.1 There is no backend enum to align to

`contacts.status` is **free text**. No check constraint, no enum type, no lookup
table:

```sql
select conname from pg_constraint
where conrelid='public.contacts'::regclass and contype='c'
  and pg_get_constraintdef(oid) ilike '%status%';
-- 0 rows
```

This is the root cause. Rule 2 of the brief says mobile tabs must map to "the
same backend enums used in dashboard reports, filters and automations." **No
such enum exists.** Every consumer invented its own grouping, and they disagree.

| Where | Knows how many status strings |
|---|---|
| Production data | **10** in use |
| Android app | **18** referenced |
| Web lead board | **9** filterable |

### 1.2 The app carries two different taxonomies, in one file

`TelecallerScreens.kt` defines both:

- **`STAGES`** (line 124) — a 7-step funnel: New · Contacted · Interested ·
  Site Visit · Negotiation · Token Paid · Booked. **Home** counts with this
  (line 597).
- **Tab buckets** (line 1606) — All · New · Today · Follow-up · Working ·
  Pipeline · Booked · Closed. **Leads** counts with this.

Same leads, two groupings, two screens of the same app. A rep who reads
"Contacted 240" on Home and then opens Leads finds no Contacted tab at all —
those leads are split across Follow-up and Working.

### 1.3 `closed` means two opposite things — in the same file

```kotlin
Stage("closed", "Booked", setOf("booked"), Green)   // line 136 — key 'closed' = WON
"closed" -> app.leads.filter { it.status in closedSet } // line 1457 — 'closed' = DEAD
// closedSet = lost, not_interested, dnc, invalid
```

The stage keyed `closed` is the **won** stage. The tab keyed `closed` is the
**lost** pile. And the app's Closed tab *excludes* `booked`, while **every**
backend definition of closed *includes* it:

| Definition | Set |
|---|---|
| `0020_manager_digests` | booked, lost, dnc, not_interested |
| `0051_assign_makes_lead_fresh` | booked, lost, not_interested, dnc |
| `0100_geofenced_round_robin` | booked, lost, not_interested, dnc, **invalid** |
| `0112_close_followups_on_lead_closed` | not_interested, lost, dnc, booked, **token_paid** |
| App `closedSet` | lost, not_interested, dnc, invalid — **no booked** |

Five definitions, five different sets. `token_paid` is *closed* in 0112 (its
follow-ups get cancelled) but *open* in 0100 (still eligible for round-robin).
"Closed" on the phone is not "closed" in any report.

### 1.4 Two tabs still double-count — measured, not theorised

The `Working` tab was fixed to exclude leads with a callback (line 1451 explains
why). **`Pipeline` was never given the same fix.** A site-visit lead with a
booked callback is in Pipeline *and* Follow-up:

```
pipeline_tab   22
followup_tab  275
in BOTH tabs    6      ← right now, in production
```

That is rule 5 broken, and it is exactly the "same lead in multiple tabs"
complaint.

### 1.5 The web board cannot select 91 leads

`STATUS_FILTERS` in `LeadManager.tsx` has 9 chips. Four live statuses have no
chip:

| Status | Leads |
|---|---|
| `called` | 45 |
| `follow_up` | 19 |
| `dnc` | 16 |
| `no_answer` | 11 |
| **Total unreachable** | **91** (11.6% of all leads) |

Meanwhile 3 chips (`negotiation`, `token_paid`, `booked`) match **zero** leads —
`booked` has never been used. The board offers filters for stages nobody is in
and hides 91 leads that exist.

### 1.6 There is no shared colour system

The app assigns 7 stage colours. The web board assigns **none** — statuses are
plain text chips. `admin/lib/dashboard/` has `format.ts`, `health.ts`,
`metrics.ts`, `modules.ts`, `scope.ts` and **no `stage.ts`**. Rule 9 ("same
colors") currently has nothing on the web side to align to.

### 1.7 What is already right

Rule 4 is **already met** on mobile — every tab carries a one-line explanation
(line 1635). Those lines are good and should survive the refactor:

> *"Never called. The moment you dial one, it moves to Follow-up."*

The Follow-up three-way split (Call now / Done today / Booked for later) is also
correct and is the model the rest of this design copies.

---

## 2 · The core confusion: two questions wearing one set of tabs

The tab row answers two unrelated questions at once, which is why leads seem to
be in several places:

| Question | Today's tabs | Nature |
|---|---|---|
| **Where is the deal?** | New, Working, Pipeline, Booked, Closed | Lifecycle. One value. Changes slowly. |
| **What do I do now?** | Today, Follow-up | Work state. **Derived from the clock.** Changes hourly. |

A lead is *always* both. `site_visit` **and** *due at 4pm* is not a
contradiction — it is one lead with a stage and a task. Forcing both onto one
row guarantees overlap, which is precisely rule 6's point about "due today".

**Recommendation: two axes, drawn separately and labelled as such.**

- **Axis A — Stage.** Stored, mutually exclusive, same enum everywhere.
- **Axis B — Action state.** Derived from `follow_ups.due_at` vs now. Never
  stored, never a stage.

---

## 3 · The shared model

### Axis A — Stage (9 values, covers all 18 known strings)

| Stage | Label | Maps from `status` | Colour |
|---|---|---|---|
| `new` | New | `new`, `queued` | slate `#6A7B85` |
| `contacted` | Contacted | `called`, `no_answer`, `busy`, `wrong_person`, `callback`, `follow_up` | sea `#3E7F8A` |
| `interested` | Interested | `interested` | amber `#C98A3E` |
| `site_visit` | Site visit | `site_visit` | plum `#75629B` |
| `negotiation` | Negotiation | `negotiation`, `proposal` | bronze `#8A6D3B` |
| `token_paid` | Token paid | `token_paid` | indigo `#5A62C9` |
| `won` | Won | `booked` | green `#3E7F5A` |
| `lost` | Lost | `lost`, `not_interested`, `invalid` | terracotta `#C0452C` |
| `dnc` | Do not call | `dnc` | slate `#5D6862` |

All 18 strings map; nothing falls through. `won` replaces the overloaded
`closed` key. `Pipeline` becomes a **named group** of stages
(`site_visit`, `negotiation`, `token_paid`) for reports — not a stage.

### Axis B — Action state (3 values, derived)

| State | Rule | Meaning to a rep |
|---|---|---|
| `call_now` | `due_at <= now`, **or** open lead with no follow-up at all | This is the work |
| `scheduled` | `due_at > now` | A plan. Arrives on its own |
| `no_next_step` | Open stage, no follow-up, already handled | **The leak** — talked to them, booked nothing |

`won`, `lost` and `dnc` have no action state. This is the existing Follow-up
split, generalised — and `no_next_step` is the one genuinely new view: today
those leads are invisible.

**"Today" is a date filter on axis B, not a stage** (rule 6).

---

## 4 · Recommendations, in the shape asked for

### Which tabs remain

`New` · `Interested` · `Site visit` · `Negotiation` · `Token paid` — unchanged
meaning, now stage-only and mutually exclusive.

### Which merge

| Merge | Into | Why |
|---|---|---|
| `Working` | `Contacted` + `Interested` | "Working" is not a lifecycle position — it meant "talked, nothing booked", which is a stage **plus** an action state. Vague label, rule 10. |
| `Follow-up` | Action row: `Call now` + `Scheduled` | It was three jobs under one name. The split already exists inside the tab — promote it. |
| `Closed` | Split → `Won` and `Lost` | One label currently covering the best and worst outcomes, and disagreeing with every report. |

### Which become filters instead of tabs

| Was a tab | Becomes |
|---|---|
| `Today` | Date filter on the action row (rule 6) |
| `Pipeline` | Stage-group filter over site_visit / negotiation / token_paid |
| `All` | Stays, but as "no filter" rather than a peer tab |

### Which labels change

| Now | To | Why |
|---|---|---|
| Closed (= lost) | **Lost** | Says what it holds |
| Booked | **Won** | `booked` the status vs "booked a callback" is a live ambiguity in this app |
| Working | *(removed)* | Undefinable without the action axis |
| Contacted | **Contacted** *(unchanged, but now reachable)* | Home already shows it; Leads never did |
| — | **No next step** | New. Names the leak |

### How the two are linked

**Put the model in the database, not in two codebases.**

1. **`lead_stages` lookup table** — `key`, `label`, `colour`, `sort`,
   `statuses text[]`, `is_open`. Seeded with the 9 rows above. One row set owns
   labels, colours and membership, so they cannot drift (rules 1, 9).
2. **`lead_stage(status) → key`** — one SQL function. Every view, report and
   automation calls it instead of hardcoding a set. Replaces the five
   conflicting "closed" lists with `is_open = false`.
3. **`v_lead_workstate`** — one row per lead: `stage`, `action_state`,
   `due_at`. Both clients read counts from here, so a tab count on the phone and
   a filter count on the web are the *same query*.
4. **`admin/lib/dashboard/stage.ts`** — reads the table, exports typed helpers.
   Sits beside `format.ts` / `health.ts`, matching the pattern already
   established.
5. **`LeadStage.kt`** — the app fetches and caches the same table. A unit test
   asserts the local fallback matches the server rows, so a drift fails CI
   rather than shipping.

**A check constraint on `contacts.status`** should land with it. Free text is
how an unmapped status would silently belong to no tab.

---

## 5 · Risk, and what I would *not* do

- **Do not renumber or rewrite `contacts.status` values.** The stage is derived
  from status, not a replacement for it. Rewriting 784 rows of history to a new
  vocabulary risks the reports, and buys nothing the mapping does not.
- **`booked` has zero rows.** Before shipping a `Won` tab, confirm whether reps
  are using `token_paid`/`site_visit` as the terminal state and `booked` is
  simply never set. If so, the funnel's top is decorative and that is a separate
  (bigger) finding.
- **`invalid` is grouped into `lost`** here, matching the app today. It is
  arguably bad-data rather than a lost deal; worth a decision.
- Migrating the five hardcoded "closed" lists to `is_open` changes behaviour in
  `0112` (token_paid currently closes follow-ups) — that one needs a deliberate
  call, not a mechanical replace.

## 6 · Sequence

1. `lead_stages` table + `lead_stage()` + `v_lead_workstate` + status check
   constraint. No UI change; verify counts match today's tabs first.
2. Web: `stage.ts`, colour the board, add the 4 missing chips.
3. App: two labelled rows, keep the one-line hints, delete `Working`, split
   `Closed`, demote `Today` and `Pipeline` to filters.
4. Migrate reports/automations off hardcoded sets onto `is_open`.

Steps 1 and 2 are safe and independently shippable. Step 3 is the visible change
and should go out after the counts are proven identical.
