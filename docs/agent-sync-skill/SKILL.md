---
name: dual-agent-sync
description: >
  Use for ANY change to this repo while a second AI agent (Claude Code or
  Antigravity) may be editing the same branch. Enforces the merge-first /
  build-verify / sync-log loop that prevents conflicts, broken builds, and
  duplicated work. Read docs/AGENT_SYNC.md before starting.
---

# Dual-Agent Sync Skill

## When to use
Any time you edit, commit, or push to `claude/fanbe-crm-android-app-wfjzcb`.

## The loop (every task)
1. **Merge first:** `git fetch origin && git merge origin/main`. Read the top entry
   of `docs/AGENT_SYNC.md`.
2. **Scope it:** one focused change; confirm the file isn't marked "IN PROGRESS".
3. **Edit** with complete imports and correctly-placed `@Composable`.
4. **Log it:** prepend an entry to `docs/AGENT_SYNC.md` (template at the bottom of that file).
5. **Push + draft PR.**
6. **Verify:** wait for "Build Android APK" CI on `android/**` changes. Green = safe;
   red = read the job log, fix the `e:`/Gradle error, push again. supabase-only / admin-only
   changes skip that CI — verify with `tsc` or by deploying.

## Ownership
- Claude Code: Supabase (`rqgkzamuohdvttnkluzn` only), edge functions, `admin/`, call/
  recording services, auth/session, AI features.
- Antigravity: in-app Compose UI **only when the user explicitly asks**.

## Known build-breakers
- Missing `import androidx.compose.material3.<Symbol>`.
- `@Composable` above the wrong `fun`.
- `AndroidManifest.xml` `<service>` conflict → KEEP BOTH SIDES (ManualCallService +
  AutoDialerService `phoneCall|microphone`, SipBackgroundService, SalesConnectionService,
  all permissions from both agents).

## Never
- Push to `main` directly. Commit secrets. Delete the other agent's service/permission/file
  to "clean up". Touch the Fanbe-CRM Supabase project.
