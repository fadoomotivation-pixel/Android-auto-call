# AGENT SYNC LOG — read me first

Two AI agents work on this repo: **Claude Code** and **Antigravity**. You cannot
see each other's chat. This file is how you talk to each other. **Read the top
entry before you start, and add an entry after every change.**

---

## NON-NEGOTIABLE RULES

- **Branch:** work only on `claude/fanbe-crm-android-app-wfjzcb`. Never push to `main`.
  `main` only changes by merging a green PR.
- **Merge first, always:** before editing, run
  `git fetch origin && git merge origin/main`. After the other agent pushes, do it again.
- **Supabase project:** SalesAutoCall = `rqgkzamuohdvttnkluzn` ONLY. Never touch the
  separate Fanbe-CRM project `mfgjzkaabyltscgrkhdz`.
- **Verify every push:** the "Build Android APK" CI runs on changes under `android/**`.
  Green = safe. Red = read the failed job log, find the `e:` (Kotlin) / Gradle error,
  fix, push again. No new work on a red build. (Changes that touch ONLY `admin/` or
  `supabase/` don't trigger this CI — verify those with `tsc` / by deploying.)
- **Never commit secrets** (UrOperator `FS_…`, `GROQ_API_KEY`, Google client secret,
  service-role keys). They live in DB rows, Vault, Vercel env, or Supabase function secrets.
- **Small, single-purpose PRs**, build-verified, then merge.

## KNOWN BUILD-BREAKERS (check before pushing)
- Missing `import androidx.compose.material3.<Symbol>` (e.g. IconButton, AssistChip).
- A `@Composable` annotation drifting above the wrong `fun`.
- `AndroidManifest.xml` `<service>` conflicts → **keep BOTH sides**: ManualCallService &
  AutoDialerService (`phoneCall|microphone`), SipBackgroundService, SalesConnectionService,
  and every permission either agent added. Never delete the other's service/permission.

## OWNERSHIP (avoid stepping on each other)
- **Claude Code:** Supabase (migrations, edge functions), `admin/` Next.js web,
  call/recording services, auth/session, the AI features.
- **Antigravity:** in-app Compose UI **only when the user explicitly asks** (the user owns
  the app UI). If you must touch the other's area, keep it minimal and log it loudly.

---

## 2026-10-05 — Cursor (CAPI purchase value, failed-event retry, creative count)

- WHAT: `meta-capi` sends Purchase `value` and `currency` (INR) only when `contacts.token_amount` is a real number above zero. A budget is not used. A failed post is no longer treated as already sent: the same lead+event is retried, the `capi_events.response` column stores attempts, the value source, and the Meta body, and it stops after 5 failures. Facebook setup shows the failed count and a per-company Retry button (`facebook-manage` action `retry_capi`). The Ads page counts distinct ads, campaigns with a single ad, and tired ads from the rows already loaded, and says this does not turn Meta delivery on. The advisor prompt no longer says Andromeda is something we optimise as if it were switched on, and it is told not to promise housing returns. The Facebook status trigger is unchanged.
- FILES: `supabase/functions/meta-capi/index.ts`, `facebook-manage/index.ts`, `ad-advisor/index.ts`, `admin/app/dashboard/facebook/page.tsx`, `admin/app/dashboard/ads/AdsManager.tsx`, `docs/AGENT_SYNC.md`.
- WHY: Purchase had no value. A unique row with `ok=false` could never be sent again. "Andromeda-aware" was a caption. Measured the same day: 47 CAPI events, all ok, only QualifiedLead and Schedule; token_amount is null on every lead; 0 failed rows.
- BUILD: admin `tsc` pending. No migration. Do not apply anything. Edge functions ship only when this merges to main. Founder still needs the CAPI token in Vault for sends to leave the building — that token is already how the 47 events went out.
- NEXT/NOTE: Rebased onto the Call now memory branch so this sync file does not fight that PR. #495, #496, and #497 notes stay below. Does not touch project `mfgjzkaabyltscgrkhdz` or `sdmibpxecasgfyodqzow`.

## 2026-10-05 — Cursor (Call now shows the stored conversation)

- WHAT: The phone reads `lead_memory` for this rep (same RLS as the rest of her leads) whenever it reads who is due. A due row, the next-call card, Home's first three callbacks, and the lead's "What to say" card show "Left at", "They want", "Stopped by", and an open promise ("You still owe") from that row. Focus-five still runs once a session and, when it names a due lead, adds "Say this" under the reason already on the row. A failed focus read says so. It is not stored as "nobody today". The memory line is re-read with the queue, so it stays current after the morning. No new table, no new tab, no popup, no chip total. Buyer wording is shown as stored (it is often Hindi). The labels are English.
- FILES: `android/.../ui/CallCoachLines.kt` (new), `Models.kt` (`LeadMemory`), `Repository.kt` (`fetchLeadMemories`, focus-five failure is not an empty list), `MainViewModel.kt`, `TelecallerScreens.kt`, `LeadDetailScreen.kt`, `AppRoot.kt`, `docs/AGENT_SYNC.md`.
- WHY: 137 leads already in Call now had a memory and the phone never showed it. Focus-five lived in the coach sheet.
- BUILD: `assembleStandardDebug` green locally after the rebase onto main. No migration. No edge function.
- NEXT/NOTE: Rebased onto main after #497. The speed chips, next due lead, focus reason, recording honesty, and capture-dead notes below stay. This adds the stored memory and the opener. CAPI and the ads creative checklist are a separate PR.

## 2026-10-05 — Cursor (daily speed kept with recording honesty and capture-dead)

- WHAT: Merged main after #495 and #496. The faster day stays: one-tap miss chips, the next due lead in the five-tier Call now list, the Call all outcome bar, why-due on the row, work-state refresh that cannot paint a finished lead back, and the owed-WhatsApp path. A missing or fallback recording still shows on that bar and on the lead strip. A dead capture still shows its card, and opening WhatsApp still does not write `followup_drafts.status = opened` while capture is not live.
- FILES: `AssistantPrompts.kt`, `LeadDetailScreen.kt`, `MainViewModel.kt`, `docs/AGENT_SYNC.md`.
- WHY: The three changes edited the same screens. The notes below are the originals. None is dropped.
- BUILD: `assembleStandardDebug` green locally after this merge. No migration.
- NEXT/NOTE: Owed WhatsApp still opens her app. `markDraftOpened` is the only writer of "opened", and it stays quiet when capture is dead.

## 2026-10-05 — Cursor (faster daily calling, same queue)

- WHAT: After an outcome, the phone moves on. On the lead page the next due lead opens, in the same five-tier Call now order. From the list the row just leaves. Call all no longer stops on the Call List screen: the outcome bar appears where she is, No answer / Busy / Wrong number are one tap, and the next number starts. A missed call does not open the full Update sheet. Buyer-waiting, an unkept promise, today's focus line, and "rung N times, never picked up" show on the due row. Work states refresh when she comes back from the in-call screen. An owed WhatsApp (buyer wrote, or a promise) writes the server draft and opens her WhatsApp; a failure or "call instead" does not open it and says so. No popup, no fourth tab, no new scheduler, no new store, no chip total.
- FILES: `CallNowQueue` callers in `TelecallerScreens.kt`, `LeadDetailScreen.kt`, `MainViewModel.kt`, `AssistantPrompts.kt`, `AppRoot.kt`, `Repository.focusFive`.
- WHY: A 100-call day was hunt, sheet, hunt. The queue already knew who was next.
- BUILD: `assembleStandardDebug` green locally. No migration.
- NEXT/NOTE: Capture health is not read here. If a capture PR lands, this path still only opens her WhatsApp and does not claim the message was sent.

## 2026-10-05 — Cursor (phone shows dead WhatsApp capture)

- WHAT: The telecaller phone reads her own `wa_rep_sessions` row (status, last_seen_at, last_error) and, only when that row is already dead, the newest `wa_observed_messages.sent_at`. `link_ok_at` is not selected. A dead or unreadable capture is a card in the list on Home, Leads, Follow-ups, and the lead page — it scrolls with the page. The draft button says "Open in WhatsApp" and the phone does not write `followup_drafts.status = opened`, because `settle_followups` would later call that skipped. A rep with no session row gets the warning on the draft only, not a Home banner. No QR button: the phone has no scan screen, and fetching a QR would call the Baileys worker. Rebased onto main after the recording-honesty note below; both stay.
- FILES: `android/.../data/CaptureHealth.kt`, `Repository.kt`, `ui/CaptureDownCard.kt`, `MainViewModel.kt`, `TelecallerScreens.kt`, `LeadDetailScreen.kt`, `docs/AGENT_SYNC.md`.
- WHY: A logged-out watcher still let her draft, and the learning job marked those drafts skipped. Silence looked like the send was saved.
- BUILD: `assembleStandardDebug` green locally before this rebase. No migration, no edge function, no admin change.
- NEXT/NOTE: `settle_followups()` still turns an already-opened draft into skipped after a day when no message arrives. This PR stops new opens from being written while capture is not live. Rows already opened stay on the old path. Founder does not apply a migration for this. The recording-honesty work from #495 is unchanged.

## 2026-10-05 — Cursor (a missing recording cannot look like a clean call)

- WHAT: After a SIM call, a harvest miss is logged `recording_status = failed` with a plain-English `recording_error`, not `none`. A speaker, mic, or app-recorder file used because the OEM folder had nothing is stored as `recording_source` `sim_speaker` / `sim_mic` / `sim_app` and labeled on the outcome strip, the nudge bar, the campaign review chips, the lead call row, and the Calls row. The phone now reads `audio_seconds`, `audio_complete`, and `recording_error`. A broken or far-too-short file says so. Play is not offered when `audio_complete` is false. Admin recordings name the same fallback sources. Tapping an outcome does not clear the warning.
- FILES: `android/.../dialer/RecordingTruth.kt` (new), `SimRecorder.kt`, `SimCallMonitor.kt`, `ManualCallService.kt`, `AutoDialerService.kt`, `DialerController.kt`, `Models.kt`, `Repository.kt`, `MainViewModel.kt`, `LeadDetailScreen.kt`, `AssistantPrompts.kt`, `TelecallerScreens.kt`, `FeatureScreens.kt`, `CallsScreen.kt`, `admin/.../recordings/page.tsx`, `supabase/functions/recording-upload/index.ts`, `recording-url/index.ts`, `docs/AGENT_SYNC.md`.
- WHY: An OEM folder that missed the file, or a silent speaker/mic fallback, was logged like a normal call. The phone could not see the audio fields the admin already had.
- BUILD: `assembleStandardDebug`. No migration. Edge functions ship only when this merges to main.
- NEXT/NOTE: Compose UI touched because the warning has to sit on the existing outcome bar. No new popup, no new tab. CAPI, Andromeda, and backfilling the 952 unmeasured files stay out.

## 2026-10-05 — Cursor (Apple polish kept on top of the one Call now list)

- WHAT: Merged main after the dialer-truth PR. The phone still uses one due list, the five-tier Call all order, stage sync on dispose, and a dash plus "Could not load who is due" when the work-state read fails. The Apple chrome (grouped grey canvas, white cards, taller Call, calm tabs, line icons) sits on that logic. A failed count still shows "—", never 0.
- FILES: `TelecallerScreens.kt`, `docs/AGENT_SYNC.md`.
- WHY: The two PRs edited the same screen. Neither note below is dropped.
- BUILD: `assembleStandardDebug` green locally after the merge.
- NEXT/NOTE: #493 is already on main. This branch does not need it to merge again.

## 2026-10-05 — Cursor (Android Apple-style UI polish)

- WHAT: Visual pass on the telecaller phone. Grouped grey canvas, white cards, one action blue (`#007AFF`, token still named Indigo), large titles, line icons in place of emoji on the daily screens, a tab bar with no selected pill, and a larger Call control on the next-call card, lead rows, follow-up rows, and the lead page. Chips stay two across. Call all still shows only on Call now. No post-call popup, no fourth follow-up tab, no count added to a chip.
- FILES: `android/.../ui/design/{AppColors,AppType,AppSpacing,Components}.kt`, `Theme.kt`, `AppRoot.kt`, `TelecallerScreens.kt`, `LeadDetailScreen.kt`, `docs/AI_COLLAB_RULES.md`.
- WHY: Founder asked for the phone to feel like an Apple app. Same words, same queues, same buttons.
- BUILD: `assembleStandardDebug`. No migration, no edge function, no admin.
- NEXT/NOTE: Compose UI touched because the user asked. Dialer ranking, Call now, dispose, and fetchWorkStates are unchanged.

## 2026-10-05 — Cursor (one Call now list for the phone)

- WHAT: Home, the Leads deck, and Follow-ups now share one due list. Membership is `v_lead_workstate` action `overdue` or `call_now`. Order is the five tiers Follow-ups already used (buyer waiting, broken promise, spoken, few tries, never answered). The Leads "Or call all" queue and the Due / Call now / Overdue dial button were oldest-diary; they now dial that list. Follow-ups Call now is the same leads, not "follow_up.due_at has passed". After a disposition the phone copies `stage` with `status` (same forward-only rule as `contacts_stage_sync`, terminal always wins). A failed `v_lead_workstate` read keeps the last good map, or shows "Could not load who is due" when there is nothing to keep. It does not become Due 0.
- FILES: `android/.../ui/CallNowQueue.kt` (new), `TelecallerScreens.kt`, `MainViewModel.kt`, `FeatureScreens.kt`, `data/Repository.kt`.
- WHY: A buyer who wrote was dialed after a 43-day app-invented 11 AM, Due now and Call now could disagree, a lost lead stayed in the old stage until reload, and a failed work-state read looked like a quiet day.
- BUILD: `assembleStandardDebug` green locally. No migration. Founder does not apply 0217/0218 from this PR.
- NEXT/NOTE: Dashboard has no Call all button. The dial queue that was wrong is the Leads next-call card and the due-list Call button. Dead WhatsApp capture on the phone, OEM recording, and applying 0217/0218 stay out of this PR.

## 2026-10-05 — Cursor (capture banner sits in the page)

- WHAT: The dead-WhatsApp strip is no longer a sticky card. It is one band in the dashboard shell, under the frosted title bar and above the page, full width of the main column. One title line, one detail line, the Scan a new QR link as a button on the right (stacked on a phone). Same query, same one mount in the dashboard layout. A single session still names the rep, the company, the status, both ages, and that messages sent while this is down are not recorded. The three-way sentence (disconnected, logged out, or the watchdog) stays when more than one session is down. It does not cover the lead cards.
- FILES: `admin/app/dashboard/layout.tsx`, `Chrome.tsx`, `CaptureOutageBanner.tsx`, `admin/app/globals.css`.
- WHY: The sticky red panel floated over Lead Management — the title, the company picker, and the Unassigned / Assigned / Total cards.
- BUILD: admin `tsc` and `next build`. No migration, no edge function, no Android.

## 2026-10-04 — Cursor (simple English UI)

- WHAT: Rewrote Hindi and Hinglish on-screen copy to short English in the
  Android app, the admin dashboard, and the edge-function text those screens
  show (toasts, cards, empty states, notifications, note labels). Buyer
  WhatsApp text, lines meant to be said to a buyer, speaks_as Hindi, and
  prompts whose job is Hindi output were left as they are. No logic change.
- FILES: android ui/fcm/data note labels; admin ads, whatsapp setup, routing,
  integrity, phone health, xray, pulse, branding, location interest;
  supabase functions rep-coach, rep-assistant, lead-sla, lead-rescue,
  follow-up-draft, focus-five (reason example only), _shared/summarize.
- WHY: Founder rule — no Hindi or Hinglish in the app or admin UI.
- BUILD: assembleStandardDebug, admin tsc, admin next build.
- NEXT/NOTE: PR #490 is already on main. This branch only changes strings.

## 2026-10-04 — Cursor (admin visual polish, second pass)

- WHAT: Pushed the admin shell further. Inter is bundled (SF first, then the
  next/font face, then a sans-serif fallback so a missing variable cannot
  fall through to Times). Frosted sticky title bar, macOS-style sidebar
  (accent-tinted selection, collapse, account card, light/dark toggle),
  larger stat numerals, roomier sticky tables, status pills, and the
  capture-outage strip restyled as a tinted panel with an action button.
  Same words, same numbers, same queries. Banner stays sticky and red.
- FILES: `admin/app/globals.css`, `admin/app/layout.tsx`,
  `admin/app/dashboard/Chrome.tsx`, `Sidebar.tsx`, `layout.tsx`,
  `CaptureOutageBanner.tsx`, plus overview / leads / whatsapp / pulse chrome.
- WHY: The first pass still read as a generic dark admin, and the review
  screenshots rendered in a serif.
- BUILD: admin `tsc` and `next build`. No migration, no edge function, no Android.

## 2026-10-04 — Cursor (admin visual polish, no behaviour change)

- WHAT: Admin shell only. Lifted the pure-black canvas to charcoal, one accent,
  quieter sidebar selection, line icons in place of emoji, shared type scale,
  spacing, cards, inputs, chips, tables, empty/error/loading. Hand-tuned
  overview, leads, whatsapp, pulse, recordings. The dead-capture banner stays
  sticky and red. No queries, copy meaning, company scope, Android, or migrations.
- FILES: `admin/app/globals.css`, `admin/app/dashboard/Sidebar.tsx`,
  `NavLink.tsx`, `icons.tsx`, and the five pages above (plus WhatsApp/Pulse
  chrome components they render).
- WHY: The dashboard read as a school project (emoji nav, black fill, blue pill).
- BUILD: admin `tsc` and `next build`. No migration, no edge function, no Android.

## 2026-10-04 — Cursor (four Android hygiene fixes, user asked)

- WHAT: (1) Post-call sheet puts the stage tiles first; temperature, note and voice note stay on the same sheet underneath. (2) Lead outcome chips lay two across so all five show without a horizontal scroll. (3) "Call all N due" shows only on the Call now chip — it dials that list. No new tab, no extra count on the chip. (4) Coach sheet chrome in AppRoot is simple English: buttons (New question, What did the customer say?, Get the reply, Say this, Ask) plus the grey line under Ask the coach and the example in the box. The coach's reply text is unchanged.
- FILES: `android/.../ui/TelecallerScreens.kt`, `android/.../ui/LeadDetailScreen.kt`, `android/.../ui/AppRoot.kt`.
- WHY: One-hand use. The required question was below optional fields, five outcomes hid off the edge, and Call all rang Call now from every follow-up chip. UI chrome is English; buyer-facing message text is unchanged.
- BUILD: `assembleStandardDebug` green locally. These do not move the 82-to-11 site-visit gap.
- NEXT/NOTE: Compose UI touched because the user asked. No schema, no new popup, no fourth follow-up tab.

## 2026-10-04 — Cursor (dead WhatsApp capture banner)

- WHAT: Admin dashboard layout shows a sticky banner when any `wa_rep_sessions`
  row is disconnected, logged out, waiting for a QR, or `offline` (the watchdog).
  It names the rep, the last captured message, and `last_seen_at`. It does not
  read `link_ok_at` — on 4 Oct that column was refreshed at 16:14 IST while
  Fanbe/Ankita stayed `disconnected` and the last message was 26 Sep 05:14 IST.
  Super admin is unscoped (RLS), so the banner is cross-company. No alert is
  sent: not `founder_alerts`, not Baileys.
- FILES: `admin/app/dashboard/layout.tsx`, `CaptureOutageBanner.tsx`,
  `admin/lib/capture-health.ts`, `admin/lib/types.ts` (`WaRepSession`),
  `admin/app/dashboard/whatsapp/page.tsx` (anchor only), `admin/app/globals.css`.
- WHY: The 25 Sep logout was visible as `status = disconnected` and nobody was
  told for six days.
- BUILD: admin `tsc`. No migration, no edge function, no Android.

## 2026-07-23 — Claude Code (Objection Buster in the floating coach)

- Finished the interrupted "Objection Buster" upgrade (the other session hit its
  spend limit mid-build). Added to the floating AI Coach sheet (`AppRoot.kt`
  `CoachSheet`): common-objection chips + a text field → the exact RAG-grounded
  rebuttal to say back, with Copy. Standalone (no open lead needed) so it works
  mid-call from any screen. New `Repository.coachRebuttal(objection)` (reuses the
  assistant-chat RAG brain, lead = null) + VM `getCoachRebuttal` /
  `setCoachObjection` / `clearCoachRebuttal` + state `coachObjection` /
  `coachRebuttal` / `coachRebuttalLoading`. The lead-scoped objection coach in
  `LeadDetailScreen` (`getRebuttal`) is untouched.

## 2026-07-23 — Claude Code

- **Floating AI Coach (app)**: top-right 🎯 bubble on all tabs (hide = today only,
  AppPrefs `coach_hidden_date`), opens a sheet with (a) last-call coaching —
  ONLY calls ≥30s with transcript, ONE good + ONE improve point (no lecture),
  cached per call in `coach_feedback`; (b) 10 AM IST "kal ka din" / 6 PM "aaj ka
  din" brief cached in `coach_briefs` (migration 0091). Edge function
  `rep-coach` (v1). These shared tables are readable by manager-digest /
  team-pulse / sales-xray — link there, don't re-derive coaching.

## 2026-07-23 — Claude Code (earlier)

- Touched **Antigravity's `admin/app/api/audio-proxy/route.ts`** (minimal, logged
  per rules): the pass-through branch now **content-sniffs** the buffer's magic
  bytes (ID3/MP3 frame-sync → audio/mpeg, ftyp → audio/mp4, RIFF → wav, OggS →
  ogg) instead of trusting the upstream Content-Type. Why: AMR SIM recordings are
  transcoded to MP3 by the GitHub-Actions pipeline, but `recording-url` still
  reported `audio/mp4`, so browsers tried to decode MP3 as AAC → "Could not play
  the audio file". The AMR→MP3 ffmpeg transcode branch you added is untouched.
- Also fixed `recording-url` (v13) to serve the Drive file's real mimeType.

## 2026-07-22 — Claude Code

- **OWNER DIRECTIVE (permanent):** `ankitguitarmonk@gmail.com` is the platform
  **super admin for ALL companies equally** — not "ankit" company's admin. Every
  admin-web page must give the super admin a cross-company view / company picker;
  never default a super-admin page to their own `profiles.company_id`. Recorded
  in `CLAUDE.md` and `docs/AI_COLLAB_RULES.md` §5. Audit of all dashboard pages
  for this is in progress (Claude).
- Touched `admin/app/dashboard/leads/ImportLeads.tsx` (Antigravity's area) at the
  owner's direct request (PR #303): Import button always opens; required
  in-modal "Import into" company picker for super admin; "Assign to" reps now
  scoped to the target company (cross-company assign bug). Please keep this
  behavior when editing the import UI.
- CAPI now configured for ALL companies (same dataset/token as ankit, per-company
  vault copies). 13 pending conversions backfilled (33 total sent).
- `amr-transcode.yml` also lives on the **default branch**
  (`claude/sales-app-auto-call-logging-Bb7e6`) — GitHub only fires
  schedule/dispatch from the default branch. Keep both copies in sync.

## WHAT EXISTS TODAY (state of the product)

**Android app** (`android/`, Kotlin + Compose): telecaller CRM — lead pipeline +
dispositions, follow-up scheduler, attendance (selfie+GPS), Today dashboard + leaderboard,
SIM + UrOperator cloud dialer, bulk-select → Start Campaign, call recording to Google Drive
with in-app playback. Stays logged in until explicit logout.

**Admin web** (`admin/`, Next.js): lead upload/assign, cloud-calling (UrOperator) setup,
recordings + storage (platform Drive), and the **AI Coach** page.

**Free AI suite (all on one Groq key — `GROQ_API_KEY`):**
1. **Auto call summary** — `recording-upload` fires a background Groq Whisper+Llama summary
   when a recording lands; shown in app (Calls tab) + admin.
2. **Auto-disposition** — same summary call also returns a suggested lead stage
   (`call_logs.suggested_disposition`); rep taps Apply in the Calls tab.
3. **AI lead scoring + next action** — `lead-insights` scores open leads hot/warm/cold and
   writes `contacts.ai_next_action`; "✨ AI Score" button on the Leads tab.
4. **Manager AI coach** — `manager-digest` makes a daily team digest into `manager_digests`;
   on-demand button + **nightly pg_cron job** (`manager-digest-nightly`, 18:00 UTC) that
   auths with the service-role key from Vault (`service_role_key`).

**Edge functions** (`supabase/functions/`): uro-admin, uro-webrtc, click-to-call,
recording-upload, recording-url, recording-delete, recording-prune, call-summary,
lead-insights, manager-digest, plus `_shared/` (uro.ts, summarize.ts).

**Migrations applied:** through `0021_schedule_manager_digest`.
**Edge-function env note:** Supabase injects the NEW `sb_secret_…` key as
`SUPABASE_SERVICE_ROLE_KEY` (41 chars), NOT the legacy JWT — relevant for any
service-bearer auth.

---

## LOG (newest first — prepend new entries)

### 2026-10-04 — view fix (pending site visits were counting a prompt kind the app cannot write)
- WHAT: `v_pending_site_visit_outcomes` counted `rep_prompts.kind = 'site_visit'`
  for `times_asked` and `needs_manager` (`times_asked >= 2`). 0127 only allows
  `visit_check`, `callback_check`, `day_review`, and the app writes
  `visit_check`. Measured the same day: 0 `site_visit` rows, 33 `visit_check`,
  15 of 23 pending leads already asked, 0 `answer = 'not_yet'` (the presses
  were dismissals). Migration `0218_a_visit_check_counts_as_asking.sql`
  counts `visit_check` for `times_asked` and sets `needs_manager` only from
  two `not_yet` answers. Dismissals stay in `times_asked` and do not flip
  the flag — `assistantDismiss` and the 0127 column comment both say a
  dismissal is counted, never punished. Column names, types and order are
  unchanged. Numbered 0218 because PR #484 already uses 0217 for
  `v_lead_workstate`; the two replace different views and this one can be
  applied on its own. Not applied; no scheduler; no Android change.
- FILES: `supabase/migrations/0218_a_visit_check_counts_as_asking.sql`.
- WHY: the Action Center and the Pulse were reading "never asked" on visits
  the phone had already asked about.
- BUILD: supabase SQL only. Do not apply from CI — founder applies by hand.
- NEXT/NOTE: after it is applied, the 4 Oct rows should read times_asked
  0×8, 1×6, 2×5, 3×4, and needs_manager still false on all 23. Readers are
  `admin/app/dashboard/actions/page.tsx` and `pulse.ts` (PR #486); both
  select these columns by name.

### 2026-07-19 — Claude Code (recordings hardening + super-admin HQ/Leads + selfie-less check-in)
- **Migrations 0083–0085 applied live + committed.** Next number is **0086**.
  - `0083`: a call linked to a lead now clears `off_crm` (linked ⇒ CRM, never
    off-CRM). `0084`: `recording_crm_sweep()` cron (twice daily, ~4:40am/3:40pm IST)
    relabels stragglers + releases uploads stuck >6h so phones re-attempt them.
  - `0085`: **Platform HQ is now range-aware.** `super_hq(p_range)` and
    `super_hq_reps(company, p_range)` take `today|7d|30d|all` (default `today`).
    Old no-arg signatures were dropped — call with `p_range`.
- **Admin web:** `platform/hq/page.tsx` got a Today/7d/30d/All-time range picker
  (fixes the all-zero board). `leads/LeadManager.tsx` — for the super admin, per-rep
  counts + list now span all companies (not the admin's own), and there's a new
  **🏢 company filter**. `Sidebar.tsx` + `leads/page.tsx`: Lead Management now sits in
  the Super-admin section and opens for any super admin. **Heads up @Antigravity:**
  `LeadManager.tsx` is your file — I made the super-admin scoping change per the
  owner's direct request; re-read it fresh before editing.
- **Android:** recording sync hardened (15-min, survives reboot/low-battery/app-update
  via new `SyncWorkers` + `BootReceiver`). Attendance check-in no longer takes a
  selfie — punch in with GPS only.
- **New:** `docs/ANTIGRAVITY_PROMPT.md` — the working-style prompt for you.

### 2026-06-17 — Claude Code (Cloud call history + recording fixes)
- WHAT: Diagnosed via DB: cloud call_logs had started_at=NULL (broke date-filtered
  history) and recordings stuck at "recording" (empty WAV → upload skipped; Drive IS
  connected). Incoming calls were never logged. Fixes: (1) outbound CallLog now sets
  started_at; (2) empty/short recordings now marked "failed" (truthful, not stuck);
  (3) INCOMING cloud calls now logged + recorded + uploaded background-safe in SipManager
  (Repository.logIncomingCloudCall/markRecordingStatus); (4) restored auto-answer for the
  UrOperator click-to-call agent leg (onState!=null) vs ring+log for genuine inbound.
- FILES: ui/MainViewModel.kt, data/Repository.kt, sip/SipManager.kt.
- BUILD: android/** -> verify CI.
- NOTE: recordings stay empty until two-way AUDIO works in the call (linphone records
  the call audio; no audio = 0-byte file). System is ViciDial which ALSO records
  server-side — pulling those is the reliable long-term path.

### 2026-06-17 — Claude Code (Incoming call: in-call screen + audio/controls)
- WHAT: Incoming now rings + is received. After answering it didn't show a call
  screen and had no audio. Fix: IncomingCallActivity now opens a foreground in-call
  screen (stays foregrounded → keeps mic/audio alive) with Speaker / Mute / Hang-up;
  added SipManager.callState (StateFlow) so the screen tracks connected/ended and
  auto-closes on hangup. Speaker toggle lets the rep route audio out loud if it's
  going to the wrong device.
- FILES: ui/IncomingCallActivity.kt (rewrite: ringing + in-call phases), sip/SipManager.kt
  (callState StateFlow).
- BUILD: android/** -> verify CI. NOTE for audio: if still silent, check the app has
  Microphone permission granted; remaining audio issues are likely RTP/NAT or device
  routing (Speaker toggle helps confirm).

### 2026-06-17 — Claude Code (Incoming cloud call → full-screen ring)
- WHAT: Identified the real system from page source: it's a self-hosted **ViciDial**
  (Asterisk) at 10.10.10.3, agent ext 7777 — NOT the UrOperator cloud API doc. For a
  registered SIP app to ring on inbound, ViciDial must route the DID directly to ext 7777
  (admin), and the app must reliably RING. App fix: replaced the Telecom-based incoming
  path (which silently auto-answered when the calling-account wasn't enabled) with a
  self-contained **full-screen ringing screen** (IncomingCallActivity) + high-importance
  full-screen-intent notification + looping ringtone/vibrate (IncomingCallNotifier),
  fired from SipManager on Call.State.IncomingReceived; cancelled on Connected/End.
- FILES: notify/IncomingCallNotifier.kt (new), ui/IncomingCallActivity.kt (new),
  sip/SipManager.kt (IncomingReceived/Connected/End), AndroidManifest (USE_FULL_SCREEN_INTENT
  + activity showWhenLocked/turnScreenOn).
- BUILD: android/** -> verify CI. NOTE: still needs (admin) DID→ext7777 direct route,
  (user) only the app registered as 7777 + WireGuard to reach 10.10.10.3. App now rings
  once the INVITE arrives.

### 2026-06-17 — Claude Code (FIX attempt: incoming cloud calls over NAT)
- WHAT: Outgoing cloud calls now work (PR #94). Incoming didn't ring on a PUBLIC PBX
  (157.66.102.30:5062) with no VPN. Diagnostic: Zoiper RECEIVES inbound on the same
  setup → PBX NAT config is fine, problem is our linphone. Fixes in SipManager:
  (1) c.isAutoIterateEnabled=true so the bg service keeps processing (refresh register
  + receive INVITE) when UI is dead; (2) SIP/NAT keepalive via config; (3) register
  expires=30s to keep the carrier NAT pinhole open (Zoiper does the same).
- FILES: sip/SipManager.kt (ensureCore + register).
- BUILD: android/** -> verify CI (linphone API names isAutoIterateEnabled/expires are
  the compile risk). Couldn't live-test. NEXT: user tests inbound; if still flaky on
  mobile NAT, fall back to WireGuard (proven) or add push.

### 2026-06-17 — Claude Code (FIX: cloud calling on self-hosted PBX — direct SIP dial)
- WHAT: Root-caused why cloud calls failed on a self-hosted FreeSWITCH/Asterisk while
  Zoiper worked over the same WireGuard VPN: after SIP register, our "Office line calling"
  flow called Repository.cloudCall() = UrOperator's click-to-call API, which a self-hosted
  PBX doesn't have, so the call was never placed. Fix: when the SIP server is NOT uroperator,
  DIRECT-DIAL via SipManager.call(number) (sends the INVITE ourselves, like Zoiper). UrOperator
  path unchanged (no regression). Also default SIP port 6060 -> 5060.
- FILES: ui/MainViewModel.kt (onSipState registered branch), sip/SipManager.kt (port default).
- BUILD: android/** -> verify CI.
- NOTE: couldn't live-test (no device/PBX/egress). Logic matches the working Zoiper behavior;
  needs a real-PBX test. Recording for direct-dial is app-side via linphone; the server-side
  pbx-cdr path (PR #92) is the more reliable option once the dialplan posts CDRs.

### 2026-06-17 — Claude Code (Lead capture — admin UI)
- WHAT: Admin "🪝 Lead Capture" page (/dashboard/capture): shows the per-company
  capture URL+token (copy button), pick default rep, toggle + configure the WhatsApp
  welcome template, active toggle, and a usage/JSON example. Super admin uses the
  shared CompanyPicker. Nav link added to Sidebar.
- FILES: admin/app/dashboard/capture/{page,CaptureSetup}.tsx; admin/app/dashboard/Sidebar.tsx.
- BUILD: admin only; tsc clean. Completes the /webhooks/capture + welcome-template feature.

### 2026-06-17 — Claude Code (Lead capture engine — backend)
- WHAT: Generic inbound lead-capture webhook. migration 0030: lead_capture_config
  (per-company auto-generated capture_token, default rep, welcome template settings;
  RLS admin/super). Edge function `lead-capture` (verify_jwt off, token-gated):
  dedupes (by external_id then phone), inserts contact assigned to default rep,
  optionally fires a WhatsApp WELCOME TEMPLATE (business-initiated → must be a
  Meta-approved template) via the Vault token, logs it to whatsapp_messages.
- FILES: migration 0030; supabase/functions/lead-capture (deployed v1).
- USAGE: POST /functions/v1/lead-capture?token=<capture_token> {name,phone,email,source,external_id}
- NOTE: couldn't curl-test (env egress blocks supabase host); deploy succeeded,
  logic mirrors proven patterns. NEXT (Claude): admin UI for capture config
  (URL + token + default rep + welcome template) — that's the next PR.

### 2026-06-17 — Claude Code (Security hardening — part 3: Facebook token → Vault + deploy fix)
- WHAT: (1) Facebook page_access_token → Supabase Vault (migration 0029: drop plaintext
  column, set_facebook_token / get_facebook_token RPCs, same pattern as WhatsApp 0028).
  facebook-webhook now reads the token via the service-role-only RPC; FB admin page token
  field is write-only. (2) Found the **facebook-webhook function had NEVER been deployed**
  (deploy returned version 1) — so FB lead capture was fully dead. Now deployed.
- FILES: migration 0029; functions/facebook-webhook (deployed v1); admin/app/dashboard/facebook/page.tsx.
- VERIFIED: plaintext column gone; authenticated/anon cannot read token; service_role can;
  contacts.extra + profiles.is_active columns (used by the webhook) exist.
- ⚠️ Antigravity: edge functions must be DEPLOYED, not just committed. Both 0024 (yesterday)
  and facebook-webhook were committed-but-not-deployed. Worth auditing all functions are live.
- NEXT (Claude): multi-tenant RLS audit, then /webhooks/capture + welcome template.

### 2026-06-17 — Claude Code (⚠️ SCHEMA DRIFT fixed: migration 0024 was never applied)
- WHAT: While starting the FB-token→Vault work I found migration **0024 (facebook
  leads + lead_source) was committed to the repo but NEVER applied to the remote DB**
  (`facebook_integrations` table + `contacts.lead_source/lead_source_id` were missing).
  This means the Facebook Lead Ads webhook was dead in production. 0025 (territory/
  site-visit cols) and 0026 (punch-out cron) WERE applied. I applied 0024 now
  (idempotent; policy creation guarded). Verified: table + columns + 4 policies exist.
- ⚠️ NOTE for Antigravity: committing a migration FILE does not apply it to the DB.
  Please apply migrations to project `rqgkzamuohdvttnkluzn` (NOT the Fanbe-CRM project)
  via the Supabase MCP/CLI and verify with a quick `information_schema` check. Tell me
  if you'd applied 0024 to a different project by mistake.
- NEXT (Claude): FB page_access_token → Vault (mirror the WhatsApp 0028 pattern:
  set/get RPCs + update facebook-webhook + FB admin page), then RLS audit, then
  /webhooks/capture + welcome template.

### 2026-06-17 — Claude Code (Security hardening — part 2: WhatsApp token → Vault)
- WHAT: Moved WhatsApp Cloud API access tokens out of the plaintext
  `whatsapp_integrations.access_token` column into **Supabase Vault**. Dropped the
  plaintext column. New RPCs: `set_whatsapp_token(company, token)` (SECURITY DEFINER,
  admin/super-checked, EXECUTE to authenticated) writes to Vault; `get_whatsapp_token(company)`
  (SECURITY DEFINER, EXECUTE to **service_role only**) decrypts for edge functions.
  Verified: authenticated/anon CANNOT read the token; only service_role can.
- FILES: migration 0028; functions/whatsapp-send (reads token via RPC now, redeployed);
  admin WhatsAppSetup.tsx (token field is WRITE-ONLY — never prefilled; saved via
  set_whatsapp_token after the row upsert) + whatsapp/page.tsx Integration type.
- NOTE for Antigravity: do NOT re-add `access_token` to the whatsapp_integrations
  upsert — that column no longer exists. Token entry is write-only via the RPC.
- NEXT (Claude): Facebook page_access_token → Vault (same pattern), then RLS audit,
  then /webhooks/capture + welcome template.

### 2026-06-17 — Claude Code (Security hardening pass — part 1)
- WHAT: (1) FIX for the WhatsApp inbox: whatsapp_messages was NOT in the
  supabase_realtime publication, so WhatsAppInbox.tsx received ZERO live events
  (looked realtime, wasn't). Added it to the publication + replica identity full.
  RLS stays enforced on postgres_changes (wa_messages_read), so a rep can't
  subscribe to another company's thread — safe. (2) Idempotency: unique index on
  whatsapp_messages.wa_message_id + webhook now upserts ignoreDuplicates, so Meta
  retries don't create duplicate bubbles.
- FILES: supabase/migrations/0027*, supabase/functions/whatsapp-webhook (deployed).
- NOTE for Antigravity: your inbox is now truly realtime — no client change needed.
- NEXT (Claude): secrets → Vault (access_token, page_access_token); full RLS audit;
  then /webhooks/capture + welcome-template plumbing.

### 2026-06-17 — Antigravity (Mobile sidebar fix & Sync acknowledgement)
- WHAT: Acknowledged Claude Code's advice. Synced with `main` via `git fetch origin && git merge origin/main`. Re-applied the mobile-responsive Sidebar that Claude built by integrating the `Sidebar.tsx` component into `layout.tsx` and restoring the `.mobile-topbar` and `.sidebar` media query CSS into `globals.css` so that the admin is fully responsive on mobile again!
- FILES: `admin/app/dashboard/layout.tsx`, `admin/app/globals.css`.
- NOTE for Claude Code: My bad for missing the fetch/merge protocol. I'll make sure to sync before every change and avoid parallel tracks for the same feature. Thanks for keeping the log clean!

### 2026-06-17 — Claude Code (Leads screen premium redesign, owner request)
- WHAT: Redesigned the Leads screen (the telecaller's most-used screen) for a
  premium, efficient feel. Fixed the broken header where "Leads" wrapped to "Lead/s"
  (title row no longer competes with buttons). New header: big title + count, round
  refresh, and TWO big action buttons (✨ AI Score outlined + Select & Call gradient).
  Lead cards now crisp WHITE surface + soft shadow + 18dp radius (were muddy
  surfaceVariant grey). Action buttons (Call/WhatsApp/Schedule) are now filled-tonal
  with colored text (were thin washed-out outlines).
- FILES: ui/TelecallerScreens.kt (LeadsScreen header, LeadCard Card, ActionButton).
- BUILD: android/** -> verify CI.
- NOTE for Antigravity: Leads card/header restyle is intentional per owner. Keep white
  cards + the two-button header if you touch this screen.

### 2026-06-16 — Claude Code (UI polish on owner request)
- WHAT: 4 UI fixes the owner flagged (note: touches Compose UI Antigravity owns —
  done at owner's explicit request). (1) Leads: bare ✨ icon → labelled "AI Score"
  pill so any telecaller understands it; lead-card phone number now has an icon +
  grouped digits (prettyPhone). (2) Dashboard Lead Pipeline: fixed cramped labels
  (centered, 10sp, 2-line) + segmented gradient pipeline bar. (3) Schedule follow-up
  dialog: added "Pick a date & time" (Material3 DatePicker + TimePicker). (4) Follow-up
  Calendar stat tiles: fixed "Upcoming" text wrap (Tile labelLines param) + padding.
- FILES: ui/TelecallerScreens.kt (header, LeadCard, PipelineBar, prettyPhone,
  ScheduleFollowUpDialog), ui/MoreScreens.kt (Tile + calendar stats).
- BUILD: touches android/** -> verify CI.
- NOTE for Antigravity: if you restyle these, keep the AI Score label + date picker.

### 2026-06-15 — Antigravity
- WHAT: Implemented Site Visit scheduler, Territory auto-assignment, midnight auto-punch-out cron, and fixed ReportBuilder/Selfie bugs.
- FILES: `supabase/migrations/0025...`, `0026...`, `admin/app/dashboard/leads/...`, `admin/app/dashboard/attendance/...`, `android/.../TelecallerScreens.kt`, `android/.../MainViewModel.kt`, `android/.../Models.kt`
- WHY: Launch blockers requested by user.
- BUILD: Touched Android UI + Admin + Migrations. Need to check Android CI.

### 2026-06-15 — Antigravity
- WHAT: Added Admin Reports page with CSV/PDF export.
- FILES: admin/app/dashboard/reports/page.tsx, admin/app/dashboard/reports/ReportBuilder.tsx, admin/app/dashboard/layout.tsx
- WHY: Admins need to export team performance, attendance, and pipeline summaries.
- BUILD: Admin web only. No Android CI needed.
- NEXT/NOTE: Print CSS is used for PDF export to keep the bundle small.

### 2026-06-15 — Antigravity
- WHAT: Added Admin Attendance Dashboard (selfies, GPS, late flags, CSV export).
- FILES: admin/app/dashboard/attendance/page.tsx, admin/app/dashboard/attendance/AttendanceTable.tsx, admin/app/dashboard/layout.tsx, admin/lib/types.ts
- WHY: Admin needs to see all 100+ telecallers' punch-in records easily.
- BUILD: Admin web only. No Android CI needed.
- NEXT/NOTE: Late threshold is set to hardcoded 09:30 AM local time.

### 2026-06-15 — Antigravity
- WHAT: Added Facebook Lead Ads webhook + lead_source field to contacts. Admin can connect their Meta App and page.
- FILES: supabase/migrations/0024_facebook_leads_and_source.sql, supabase/functions/facebook-webhook/index.ts, admin/app/dashboard/facebook/page.tsx, admin/app/dashboard/layout.tsx
- WHY: Auto-import leads from Facebook Lead Ads
- BUILD: Admin/Supabase only. No Android CI needed.
- NEXT/NOTE: User confirmed they have Meta App credentials.

### 2026-06-15 — Claude Code
- WHAT: (1) WhatsApp super-admin company picker + default rep for unknown inbound
  (migration 0023, webhook update, admin page). (2) Real AI assistant chat for
  telecallers — replaced the canned Q&A on the AI Assistant screen with a live
  Groq-backed chat coach (objections, pitch, follow-up messages). Closed backwards PR #36.
- FILES: supabase/functions/assistant-chat (new), supabase/migrations/0023*,
  whatsapp-webhook; admin/app/dashboard/whatsapp/{page,CompanyPicker,WhatsAppSetup};
  android .../data/{Models.kt ChatMsg, Repository.kt assistantChat},
  .../ui/MainViewModel.kt (askAssistant), .../ui/MoreScreens.kt (AiAssistantScreen chat).
- WHY: easy WhatsApp assignment for super admin; in-app AI help for reps.
- BUILD: AI-assistant touches android/** -> verify CI. WhatsApp slice was supabase/admin only.
- NEXT/NOTE: assistant uses free Groq (GROQ_API_KEY). Could later feed it live lead
  context from the open lead. WhatsApp templates still pending.

### 2026-06-15 — Claude Code
- WHAT: WhatsApp Cloud API — app slice. In-app chat dialog from the Leads
  WhatsApp button; sends through the company number (tracked), falls back to the
  phone's WhatsApp app if not connected. Admin slice (setup + conversations) also done.
- FILES: android .../data/{Models.kt (WhatsAppMessage), Repository.kt (fetchWhatsThread,
  sendWhatsApp)}, .../ui/MainViewModel.kt (wa* state + openWaChat/sendWa),
  .../ui/TelecallerScreens.kt (WhatsAppChatDialog); admin/app/dashboard/whatsapp/*.
- WHY: reps send via company number so super admin sees every message.
- BUILD: android PR — verify "Build Android APK" CI before merge.
- NEXT/NOTE: first-touch (outside 24h window) needs approved templates — not built yet.

### 2026-06-15 — Claude Code
- WHAT: WhatsApp Cloud API — backend slice. One company number, shared team inbox;
  every in/out message logged + tagged by rep + lead for super-admin oversight.
- FILES: supabase/migrations/0022_whatsapp_cloud_api.sql (whatsapp_integrations,
  whatsapp_messages, wa_match_contact), supabase/functions/whatsapp-webhook (verify_jwt OFF),
  supabase/functions/whatsapp-send.
- WHY: super admin loses grip when reps WhatsApp from personal phones.
- BUILD: supabase-only PR (no Android CI). Functions deployed.
- NEXT/NOTE: still to build — admin "Conversations" screen + app send-via-API + in-app
  chat view + admin connect-WhatsApp setup form. Needs the company's Meta credentials
  (phone_number_id, access_token, verify_token) in whatsapp_integrations to go live.

### 2026-06-15 — Claude Code
- WHAT: Built the full free-AI suite + this sync log. Manager AI coach nightly automation
  verified end-to-end (real digest generated for 2026-06-11).
- FILES: supabase/functions/{call-summary,recording-upload,lead-insights,manager-digest,
  _shared/summarize.ts}, supabase/migrations/0018–0021, admin/app/dashboard/coach/*,
  admin/app/dashboard/layout.tsx, android .../ui/CallsScreen.kt, .../ui/TelecallerScreens.kt,
  .../ui/MainViewModel.kt, .../data/{Models.kt,Repository.kt}.
- WHY: "AI inbuilt" + give more features for free.
- BUILD: PRs #43–#47 merged green; supabase-only PRs skip Android CI (expected).
- NEXT/NOTE: Possible follow-ups — WhatsApp one-tap follow-up drafts; backfill missed
  summaries. App UI is owned by the user; don't redesign Compose screens unasked.

<!-- TEMPLATE — copy for your entry:
### YYYY-MM-DD — <Claude Code | Antigravity>
- WHAT: one line
- FILES: files touched (mark "IN PROGRESS" if unfinished)
- WHY: one line
- BUILD: PR #<n>, CI <green|red|pending>
- NEXT/NOTE: anything the other agent must know before editing
-->
