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

## 2026-10-05 — Cursor (one Call now, and a quiet failure says so)

- WHAT: Call now is one list everywhere it is named: overdue or call_now, via callNowContacts. The Leads Call now tile, its Call button, Home's due count, the three plan rows, and "+N more" all use that list. Overdue stays a late slice and says those people are already in Call now. Leads and pending follow-ups page past the old 500 and 300 caps. Opening WhatsApp while capture is not live still opens WhatsApp, does not mark the draft opened, and toasts draftWarning. Retry is no-answer or busy inside the due set, not brand-new leads. The drawer opportunities number is Call now, or a dash when that read failed with nothing kept. The Calls tab that was Follow-up is No answer. A lead call with a harvest miss stays on the recordings list; an unlinked call that matches a lead phone is linked, and a failed link does not drop the row. Booked and Lost from the visit prompt set the stage and leave Call now immediately, and come back if the write is rejected.
- FILES: CallNowQueue.kt, TelecallerScreens.kt, MainViewModel.kt, Repository.kt, CallsScreen.kt, AppRoot.kt, ManualCallService.kt, CaptureHealth.kt, docs/AGENT_SYNC.md.
- WHY: The same words were counting two queues, a 500-row window hid older new leads, and a cleared draft looked like a saved send.
- BUILD: assembleStandardDebug. No migration. Do not apply one.
- NEXT/NOTE: No post-call popup, no fourth Follow-up tab, no second reminder scheduler, no separate knowledge store, no count on the Follow-up nav chip, no capture-down banner, no Hindi. This note replaces the older sync notes.

