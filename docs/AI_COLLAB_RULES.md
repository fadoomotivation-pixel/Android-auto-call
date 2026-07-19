# Working rules for AI agents on this repo (read before you touch anything)

Two AI agents share this exact working folder and git tree: **Claude Code** and
**Antigravity**. You cannot see each other's chat. Follow these rules so the two
of you never conflict and the data stays correct. When in doubt, match what is
already here.

## 1. Git & branches
- **Never commit to `main`.** Work on the active feature branch
  `claude/telecaller-call-features-audit-ad3qqx`, push, open a **draft PR** to `main`.
- **Same folder = same working tree.** Before you start editing:
  `git fetch origin && git merge origin/main`. Do it again whenever the other
  agent pushes. Read files fresh from disk — the other agent's latest is there.
- After a PR merges, restart the branch from main:
  `git fetch origin main && git checkout -B <branch> origin/main`.
- Commit messages: imperative, explain WHY, conventional prefix
  (`fix(...)`, `feat(...)`, `ci(...)`, `copy(...)`, `refactor(...)`).
- **Never commit secrets** (GROQ key, Google client secret, service-role key,
  UrOperator token). They live in Vault / Vercel env / Supabase function secrets.
- **Never write a model id** (`claude-*`, etc.) into commits, PRs, code, or docs.
- Small, single-purpose PRs, verified green, then merge.

## 2. Verify before you push
- Android (`android/**`): the "Build Android APK" CI must be **green**. Red = read
  the Kotlin `e:` / Gradle error, fix, push again. No new work on a red build.
- Admin web (`admin/**`): run `npx tsc --noEmit` (CI does not gate this).
- Supabase (`supabase/**`): after you `apply_migration` / deploy a function,
  **boot-test it** (a cheap request that returns a normal 400/401, not a 500 crash)
  and verify data with a `select`.

## 3. Supabase migrations
- Sequential numbering. **Next number is `0086`** (last is `0085`).
- **Apply it live AND commit the identical `.sql` file** to `supabase/migrations/`.
  DB and repo must never drift.
- Make everything idempotent: `create ... if not exists`, `create or replace`,
  `drop trigger if exists ... ; create trigger ...`.
- Project ref is `rqgkzamuohdvttnkluzn` ONLY.

## 4. Edge functions
- Deploy via Supabase **and** keep `supabase/functions/<name>/index.ts` on disk
  identical to what you deployed.
- The recording/voice-note AIs share `_shared/summarize.ts`.

## 5. Database invariants — DO NOT BREAK (triggers enforce these; work WITH them)
- **A lead's `company_id` always follows its assigned rep's company.**
  Trigger `trg_sync_contact_company` (0079) forces it on insert/assign. Never try
  to set a contact's `company_id` to anything other than its rep's company.
- **No duplicate phone per company.** Trigger `trg_dedup_contact_by_phone` (0080)
  **silently skips** an insert whose phone (last 10 digits) already exists in that
  company — it never raises. So a bulk import may create fewer rows than input;
  surface a "X skipped as duplicate" count by diffing before/after, don't treat it
  as an error.
- **`contacts.last_contacted_at`** is stamped by a trigger on `call_logs` (0081).
  Don't set it by hand.
- **One pending follow-up per lead.** Move the existing one; don't stack a second.
  `follow_ups.updated_at` (0078) records the last touch — the recording AI uses it
  so it never overwrites a newer plan set by the rep or the voice-note AI.
- **Add note lines via the `append_contact_note(contact, line)` RPC** (0078) —
  atomic + dedup-safe. Never read-modify-write `contacts.notes`.
- **A call linked to a lead is never off-CRM.** `trg_link_call_to_contact` (0082)
  auto-links a call to the same-phone lead and (0083) clears `off_crm`. The
  `recording_crm_sweep()` job (0084, twice daily) also relabels stragglers and
  releases uploads stuck >6h so the phone re-attempts them. Recording capture is
  revenue-critical — never weaken this path.
- **Platform HQ is range-aware.** `super_hq(p_range)` / `super_hq_reps(company,
  p_range)` (0085) take `today` | `7d` | `30d` | `all` (default `today`).
- **Company isolation is absolute.** Company-scoped rows never cross companies.
  Only a `platform_admins` (super admin) row sees cross-company data, via the
  `super_hq*` RPCs and the super-admin RLS policies. Don't widen any RLS.

## 6. AI authority order (voice-note AI vs recording AI — never let them fight)
- Priority: **rep's manual action > voice-note AI (rep's own words) > recording AI
  (background suggestion).**
- The recording AI never changes a lead's stage (it only *suggests* a disposition);
  the voice-note AI and the rep set stages.
- Never downgrade a won lead (`booked` / `token_paid`).
- Budget/name/project/alt-phone are **fill-if-empty** only.
- **A call that didn't connect** (switched off, no answer, busy, cut) is a
  `callback` and bumps `attempts` — it is NEVER `dnc` / `not_interested` /
  `phone_invalid`. `phone_invalid` = a genuinely wrong number only.

## 7. Product & style
- Android: Kotlin + Jetpack Compose. `MainViewModel` uses `set { it.copy(...) }`.
- Design system: indigo `#4353B8` primary, warm charcoal ink, near-white canvas.
- **AI text the customer/rep reads = Hinglish, aap-form. UI chrome = professional
  English.** Keep WhatsApp green only on WhatsApp buttons.
- Leads buckets: **New (fresh only) → Today (called-today / due-today / visit-today)
  → Working → Pipeline → Booked → Closed.** Don't collapse these.

## 8. Coordination etiquette
- Stay in your lane. Antigravity owns the admin import UI (`ImportLeads.tsx`);
  Claude owns the app + edge functions + migrations unless agreed otherwise.
- Announce any cross-cutting DB/schema change in `docs/AGENT_SYNC.md` (add a dated
  entry at the top) so the other agent sees it.
- Never delete the other agent's file, service, permission, or migration.
