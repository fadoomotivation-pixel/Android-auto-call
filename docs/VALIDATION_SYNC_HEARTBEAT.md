# Validation: money guard, sync heartbeat, call capture

Run this before the daily review is switched on for anybody.

It exists because of one day that nobody caught: a telecaller made roughly
fifteen calls between 1:40pm and 3:40pm, the CRM recorded **one**, and every
signal we had said the system was healthy — app checking in, device token
fresh, all crons green. The founder found it by picking up her phone and holding
it next to the dashboard. Nothing in here is hypothetical; each check is aimed
at a way that day could repeat.

**Two things are already verified and do not need a device.** Everything under
"On a real phone" does, and cannot be signed off from a laptop.

---

## Part 1 — Verified automatically (re-runnable)

### 1.1 Money guard · PASS

`moneySafe()` extracted from the shipping source (not a copy) and run against
27 cases:

| | |
|---|---|
| Blocked when the CRM records no booking and no revenue | **10 / 10** |
| Genuine progress kept when no money is claimed | **7 / 7** |
| Real wins kept intact when the CRM agrees | **10 / 10** |

The first blocked case is verbatim the line that reached the founder:

> Yogesh Rajput booked a site visit for UP-16 **and paid the token amount to
> hold the unit.**

**Regression over every narrative line ever sent** (7 lines, all from days when
no rep had a booking): **1 dropped, 6 kept.** The one dropped is the false
claim. That ratio is the whole test — a guard that eats real progress gets
switched off within a week.

Re-run: extract `MONEY_CLAIM` + `moneySafe` from
`supabase/functions/_shared/pulse.ts` and exercise the table above.

### 1.2 Heartbeat state machine · PASS

Six scenarios pushed through the **real** `v_device_sync_health` and
`v_rep_review_recipients` views inside a transaction, then rolled back
(verified: zero rows left behind, platform switch back to `false`, test
profile's phone unchanged).

| Scenario | `state` | `trustworthy` | Review sends? |
|---|---|---|---|
| Healthy, scan just completed | `ok` | ✅ | ✅ yes |
| READ_CALL_LOG revoked | `no_permission` | ❌ | ❌ no |
| No completed sync for 5h (OEM kill) | `stale` | ❌ | ❌ no |
| Recovered after permission restored | `ok` | ✅ | ✅ yes |
| Worker threw | `broken` | ❌ | ❌ no |
| No heartbeat at all (pre-APK) | `never_reported` | ❌ | ❌ no |

The last column is the one that matters: **a rep is never scored on a day the
CRM could not see.**

### 1.3 What is NOT covered

- **The money guard covers money only.** Invented non-commercial detail — "Arun
  visited the site but left without signing any document" — is not verified
  against anything. That is the generalized claim verifier, scheduled after
  reliable call sync.
- **The Kotlin is not compiled.** There is no Android SDK in the build
  environment used to write it. `Repository.reportSyncHealth()` follows the
  existing `device_tokens` upsert pattern exactly, but *it has never been
  compiled or run.* The first item below is therefore blocking.

---

## Part 2 — On a real phone

Each step says what to do, then the SQL that proves it. `<rep>` is the
telecaller's name.

```sql
select full_name, state, trustworthy, outcome, detail,
       native_seen, backfilled, device_model, app_version,
       last_run_at, last_ok_at
from v_device_sync_health where full_name ilike '%<rep>%';
```

The worker runs every 15 minutes, and immediately after any call ends. To force
it without waiting, end a call — that is the real trigger and a better test than
anything artificial.

### 2.1 It compiles and the APK installs — **BLOCKING**

Nothing below can be attempted until the build is green. If
`reportSyncHealth()` fails to compile, the whole heartbeat is absent and the
`never_reported` state will look correct while meaning nothing.

- [ ] `./gradlew assembleRelease` succeeds
- [ ] APK installs over the existing build without a data wipe

### 2.2 Healthy phone

- [ ] Sign in, grant all permissions, make one call to a CRM lead
- [ ] Within ~1 min: `state = ok`, `trustworthy = true`
- [ ] `device_model` and `app_version` are populated and correct
- [ ] `native_seen > 0`
- [ ] `backfilled` is **0 or 1** — see 2.6 if it is consistently high

### 2.3 Permission revoked → detected

- [ ] Settings → Apps → Call Pro AI → Permissions → **Call logs → Deny**
- [ ] Make a call from the phone's own dialler to a CRM lead
- [ ] `state = no_permission`, `trustworthy = false`, `detail` names the
      permission
- [ ] Phone Health shows the red row **and the exact settings path**
- [ ] Automation Center marks the rep "phone not reporting — will be skipped"

### 2.4 Recovery

- [ ] Re-grant Call logs
- [ ] Make one call
- [ ] `state` returns to `ok`, `trustworthy = true`, `last_ok_at` is fresh
- [ ] **The calls made while the permission was off are backfilled** — the
      7-day sweep should recover them. Confirm the count in `call_logs` matches
      the phone's own recents list for the day. This is the exact failure that
      started all of this; verify it by counting, not by trusting.

### 2.5 Survives a restart

- [ ] Force-stop the app, then reboot the phone
- [ ] Do **not** open the app. Make a call to a CRM lead
- [ ] Within 15 min the heartbeat updates and the call appears

WorkManager's periodic work survives reboot, but only if the OEM allows it —
which is 2.6.

### 2.6 OEM background restrictions

The app already asks for `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` on launch
(`MainActivity`), and on these vendors that is **not sufficient** — each keeps a
second, separate list.

Test on each handset actually in use. For each: apply the settings, force-stop,
reboot, leave the phone idle and locked for **3 hours**, then make one call.

| Vendor | Also switch on |
|---|---|
| **Xiaomi / Redmi** (MIUI, HyperOS) | Settings → Apps → Manage apps → Call Pro AI → **Autostart** ON; same screen → Battery saver → **No restrictions** |
| **Samsung** (One UI) | Settings → Battery → Background usage limits → **Never sleeping apps** → add Call Pro AI; Apps → Call Pro AI → Battery → **Unrestricted** |
| **OnePlus** (OxygenOS) | Settings → Battery → Battery optimisation → Call Pro AI → **Don't optimise**; Settings → Apps → App launch → Call Pro AI → **Manage manually**, enable all three |
| **Vivo** (Funtouch, OriginOS) | Settings → Battery → **High background power consumption** → allow Call Pro AI; i Manager → App manager → **Autostart** |
| **Oppo / Realme** (ColorOS) | Settings → Battery → App battery management → Call Pro AI → **Allow background activity**; **Startup manager** → enable |

- [ ] After 3 hours idle, `last_ok_at` is within the last 20 minutes
- [ ] If `state = stale` on any handset, that vendor needs its settings
      documented for the reps **before** the daily review is enabled there

Record the result per handset. A vendor that fails here is a vendor whose reps
must not be scored.

### 2.7 Founder Pulse tells the truth

- [ ] Open Automation Center → Daily Pulse → **👁 Preview only**
- [ ] The narrative contains no payment, token, booking or signature claim
      unless `contacts` genuinely shows `booked`/`token_paid` with an amount
- [ ] Cross-check the numbers block against
      `select status, token_amount from contacts where updated_at::date = current_date`
- [ ] Deliberate probe: set one lead to `booked` with a token amount in a
      **transaction you roll back**, preview, confirm the win line is allowed
      through — then roll back. Do not leave test state on a real lead.

---

## Part 3 — Rollout

1. Merge, confirm the Supabase deploy workflow goes green, and check
   `supabase/functions/_shared/pulse.ts` on `main` actually contains
   `moneySafe`. **A green deploy is not proof the fix shipped** — the money
   guard was reported as live once when the merge had taken an earlier head.
2. Build and distribute the APK.
3. Watch Phone Health for **24–48 hours**. Target before enabling the review:
   - every active telecaller reporting, none in `never_reported`
   - no handset in `stale` during working hours
   - `backfilled / native_seen` low for everyone — a high ratio means live
     capture is dead and the safety net is carrying the day
4. Only then set `platform_automation.rep_review_on = true`.
5. First evening: read what actually went out —
   `select counterparty, body from whatsapp_messages where kind = 'rep_review'
   order by created_at desc` — before a second night runs.
