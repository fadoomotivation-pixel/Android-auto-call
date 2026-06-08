# SalesAutoCall — Android app

Kotlin + Jetpack Compose. The salesperson app: **sign in → import a CSV/TSV
contact list → auto-dial the queue through the SIM → calls are logged and synced
to the cloud**.

## Open & build

This module ships source + Gradle config but **not** the `gradlew` wrapper JAR
(binary). Easiest path:

1. Open the `android/` folder in **Android Studio** (Koala or newer). It will
   download the Gradle wrapper and sync automatically.
2. Or from a machine with Gradle installed:
   ```bash
   cd android
   gradle wrapper            # generates ./gradlew + wrapper jar
   ./gradlew assembleDebug
   ```

The build is pre-wired to the **SalesAutoCall** Supabase project. To point at a
different project, set these in `android/local.properties` (or pass `-P`):

```
SUPABASE_URL=https://YOUR.supabase.co
SUPABASE_ANON_KEY=sb_publishable_xxx
```

## How it works

| Area | File |
|------|------|
| Supabase client | `data/Supabase.kt` |
| Auth + data access (RLS-gated) | `data/Repository.kt` |
| CSV/TSV parsing (header detection, column mapping, phone normalisation) | `data/CsvTsvParser.kt` |
| Sequential auto-dialer (foreground service) | `dialer/AutoDialerService.kt` |
| Live dial progress shared with UI | `dialer/DialerController.kt` |
| Screens (login / home / import / dialer / logs) | `ui/` |

### Auto-dial loop

The `AutoDialerService` runs as a **foreground service** (type `phoneCall`) and,
for each queued contact:

1. places an outgoing call via `ACTION_CALL` (optionally on a chosen SIM slot),
2. watches `TelephonyCallback` for the call going off-hook then back to idle,
3. infers an outcome from talk duration (`connected` vs `no_answer`),
4. writes a `call_logs` row and advances the contact's `status`,
5. waits the configured gap, then dials the next.

### Permissions

Requested at runtime: `CALL_PHONE`, `READ_PHONE_STATE`, `POST_NOTIFICATIONS`.

> **Outcome accuracy:** Android doesn't tell third-party apps whether an
> *outgoing* call was actually answered, so we use a talk-time heuristic. The
> salesperson can correct any call from the logs. For exact answer detection
> you'd implement an `InCallService` / become the default dialer — a larger,
> Play-restricted undertaking.

## Compliance

Auto-dialing must respect consent and local telemarketing / DND law. Contacts
marked `dnc` are never dialed. Distribute via sideload / MDM where Play Store
dialer restrictions don't apply, or justify the permissions in review.
