# Call Pro AI — project memory

AI calling CRM for Indian real-estate telecaller teams. Android app (Kotlin/Compose)
+ Next.js admin at callproai.in (`admin/`, deployed on Vercel) + Supabase
(project `rqgkzamuohdvttnkluzn`: Postgres, edge functions in `supabase/functions/`,
migrations in `supabase/migrations/`).

## Non-negotiable rules

### Super admin = ALL companies, equally
- `ankitguitarmonk@gmail.com` is the **platform super admin** (row in
  `platform_admins`) — the owner of the whole platform, **not** merely the admin
  of the "ankit" company. The "ankit" company is only the HQ tenant their
  profile happens to sit in.
- **Every** web feature must treat the super admin as cross-company: an
  all-companies view and/or a company picker (`?company=` param or in-page
  select). NEVER silently pin a super-admin page, query, or default to
  `profiles.company_id` — that biases everything to "ankit" and hides the other
  tenants.
- Reference implementations: `admin/app/dashboard/leads/` (scopeCompany +
  companyFilter + in-modal import picker), `admin/app/dashboard/platform/hq/`.

### Company isolation
- Company-scoped rows (contacts, call_logs, telecallers, knowledge, tokens…)
  must NEVER leak across companies. Only the super admin sees/acts
  cross-company; a regular admin stays inside their own company always.
- A lead must never end up owned by one company while assigned to another
  company's rep.

### Secrets
- Never commit secrets/tokens. Meta/CAPI tokens live in Supabase Vault
  (per-company `capi_token_secret_id` / `page_access_token_secret_id`).

## Voice of the telecaller app
- **Simple English, not Hindi.** Short everyday words a telecaller already knows
  ("No answer", "Call back later", "Record voice note", "Stays in New"). Romanised
  Hindi/Hinglish reads worse than plain English here, and heavy or formal Hindi
  ("zaroori", "chuno", "rok kar save karo") is wrong — reps found it harder, not
  easier. Keep sentences short; one line per idea.
- **Every screen must explain itself.** Reps said the lead buckets "sometimes
  don't make sense", so each tab carries a one-line description of what's in it.
  Never leave a rule (why a lead moved, why a tab is empty) to be guessed.
- This app exists to make a telecaller's day easier — if a screen needs
  explaining twice, the screen is wrong, not the rep.

## One design system, and which one it is
- **Android: `ui/design/IosKit.kt` is canonical.** `Components.kt` and
  `BrandKit.kt` are what is left of two earlier kits and are being folded in.
  Before adding a component, check IosKit — there were already FOUR ways to
  draw a status pill (`StatusTag` 5 uses, `IosTag` 3, `IosChip` 3, `MetaTag` 1)
  and THREE ways to draw a section header (`IosNavBar` 3, `AccentHeader` 3,
  `IosLargeTitle` 2). Never add a fifth. `OutlinedPill` and `AppSurface` were
  deleted rather than kept "in case": an unused component in a design system
  is not a spare part, it is an invitation to make the next one.
  **Count usage with `\bName[ ]*[({]`, not `\bName(`** — Compose components are
  called with a trailing lambda and no bracket, and the shorter pattern reports
  a live component as dead. It said `GlassBox` had 0 uses; it has 3.
- **"Glass" and "Gradient" are not the language.** Flat surfaces, grouped
  lists, one hairline, system colours. If a new thing needs a gradient to look
  right, the thing is wrong.
- **Colours come from `AppColors` / `IosColors`; sizes from `AppType`.** The
  app palette is Apple's system colours. Tailwind's reds and greens (#EF4444,
  #DC2626, #16A34A, #15803D) had leaked in, including onto the in-call Answer
  and End buttons — on the one screen a rep looks at with the phone to their
  face, the green and red must be the ones their own dialler uses.
- **Admin: `app/globals.css` is the system.** Ten type steps named as Apple
  names them (caption2 … large-title), four weights, one red/green/amber/blue.
  A size that is not on that list is not a size. Never write a hex, a raw px
  font size, or `rgba(255,255,255,…)` in a `.tsx` — the last one is a white
  film that vanishes in light mode, and 54 headings were invisible that way.

## Operational notes
- **The Follow-up tab is three groups, one clock** (`LeadsScreen`): **Call now**
  (`due_at` ≤ now, or no time ever booked), **Done today** (rep recorded an
  outcome today, next call is later), **Booked for later** — mutually exclusive,
  and due always beats done. The tab chip AND the home deck's "Due now" count
  **only Call now**; the other two carry their counts on their own collapsed
  headers. Finishing a callback books the NEXT one, so a finished lead is
  instantly back in the tab looking untouched — that is how a rep who had called
  everyone still read "Follow-up 107" and stopped believing the number. Never put
  the row total back on the chip, and never power-dial anything but Call now.
- **Floating AI Coach brain** (`rep-coach` fn): returns `{coaching, brief, tip}`
  and a `mode:"ask"` two-way Q&A (rep asks anything → grounded answer, saved to
  `coach_qa`). Daily `tip` cached in `coach_briefs` slot `'tip'`. The **shared
  winning brain** = `win-harvest` fn: when a lead reaches site_visit/booking it
  distils "what worked" into a **company-scoped** `knowledge_chunks` row
  (`source_kind='win'`, idempotent `source_id='win:<contact>'`), so
  `match_knowledge` teaches every rep in that company. Cron `win-harvest-2h`.
  Guidebooks: admin RAG page → `knowledge-ingest` (scope `global` = all
  companies, super-admin only; `source_kind='guide'`). ALL of it shares the ONE
  `match_knowledge` brain — never build a parallel retrieval store.
  `knowledge-ingest` embeds in BATCHES (`offset`/`batch`, client loops till
  `done`) — a whole book at once blew the edge CPU budget (HTTP 546). `rep-coach`
  makes at most ONE fresh Groq call per request (`spent` guard) for the same
  reason. Last-call coaching returns an honest 1-5 `rating`; when the call is
  good it gives NO `improve` (empty) — only motivate, never a forced suggestion.
  Keep the brain clean: win-harvest skips leads with nothing learnable; don't
  double-ingest the same guide (idempotent `source_id`).
- **Facebook = ONE central business** (gokul, act 1254913623362544) advertising for
  MANY companies. Leads route to the right company by **form**
  (`facebook_lead_routes`, super-admin maps them on the Facebook page UI). Meta's
  webhook PUSH is unreliable (app Dev-mode delivers only test leads), so
  `facebook-poll` PULLS leads via Graph API on a 10-min cron (migration 0090) —
  it imports ONLY mapped forms, deduped, recent-window only. There is also an
  **Ad Manager built inside the CRM** — don't duplicate it.
- **The rep assistant** (`AssistantPrompts.kt` + `MainViewModel.tickAssistant`):
  the app asks the rep three questions and nothing more — "did they come to the
  site (and how close are they, 0-100)", "that callback is late, did you call
  (and if not, why)", and one 7pm day review. Answers land in `rep_prompts` and
  `contacts.close_probability` (migration 0127, view `v_rep_discipline`). ONE
  prompt on screen ever, 40-min gap, 5/day cap, one question per lead per day
  including dismissals, working hours only, never over a call/dialler/sheet. If
  you add a prompt, add it to that engine — a second scheduler is how this turns
  into spam and gets swiped away unread.
- **The weekly report card** (`_shared/weekreview.ts`, `rep-week-review`, sent by
  pulse-broadcast Monday 10 AM): numbers + feedback from the rep's own recorded
  calls. Patterns are counted in code; ONE AI call per rep per week writes the
  did-well / to-fix points, and a point citing a call it wasn't given is
  dropped. Built early Monday into `rep_week_reviews` so preview = what the rep
  gets. Under 3 recorded calls it is numbers only — never fake feedback.
- **After a real call the WhatsApp is already written** (0235 trigger →
  `follow-up-draft` `mode:'after_call'`, one per call). The rep sees it on the
  lead (and in Today's Plan), edits it, taps **Approve & send**, and it goes
  from HER linked WhatsApp via worker `/s/<id>/send` — the only caller, after
  checking her draft/her lead; throttled per number. Not linked → the app opens
  WhatsApp instead. Never let anything else send from a rep's number.
  Drafts write in her voice: `rep_personas` (nightly, from her recordings and
  her own messages; phrases kept only if she really wrote them).
- **WhatsApp hides most numbers (LIDs).** `wa-lid-resolve` asks WhatsApp,
  through the rep's session, for the LIDs of leads SHE called (≤300, batched),
  and the worker keeps the map on disk. Never pool LID maps across sessions.
- **After a SIM call the popup does NOT open** (`AppPrefs.getPostCallPopup`,
  default off). It cannot open on time — the phone's in-call screen owns the
  foreground — so the lead's Update button shakes (`Modifier.nudgeShake`) and a
  bar sits above the bottom nav until the call has an outcome. Cloud calls keep
  the instant sheet. Don't "fix" the shake by restoring the modal.
- **ALWAYS LEAVE AN OPEN PR. Pushing to the branch ships nothing.** Vercel
  deploys to **production only from `main`**, and Supabase edge functions only
  redeploy on a push to `main` — a branch push gets a Preview URL nobody uses.
  So work is not delivered until there is a PR the founder can press Merge on.
  After every push, check whether the branch's last PR was already merged
  (it usually was) and **open a NEW one** if so; never assume commits pushed
  after a merge are reachable. Migrations applied by hand to production are the
  exception — those are already live — but the admin UI and edge functions that
  read them are not, and shipping one without the other is what makes a
  half-working feature look broken.
- GitHub scheduled/dispatch workflows fire only from the repo's **default
  branch**, which is `claude/sales-app-auto-call-logging-Bb7e6` (NOT main).
  `amr-transcode.yml` must exist there; canonical copy lives on main.
- Admin timestamps must render IST: `toLocaleString("en-IN", { timeZone:
  "Asia/Kolkata" })` — but never pass `timeZone` to a NUMBER's
  `toLocaleString` (Intl.NumberFormat rejects it and the Vercel build fails).
- Some phones record SIM calls as `.amr` — not playable/transcribable. The
  amr-convert edge function + amr-transcode workflow convert AMR→MP3 (state
  tracked via `call_logs.summary_status`; `call_logs` has NO `extra` column).
- Two AIs (Claude Code + Antigravity) share this tree — see
  `docs/AI_COLLAB_RULES.md` and `docs/AGENT_SYNC.md` before big changes.
