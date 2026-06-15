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
