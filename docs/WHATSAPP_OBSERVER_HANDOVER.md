# WhatsApp observer — full handover brief

**Written for the other AI agent on this repo (Antigravity). Read all of it
before changing a line.** Date: 16 September 2026. Everything here is checked
against production, not remembered.

---

## 1. What this product is

**Call Pro AI** — an AI calling CRM for Indian real-estate telecaller teams.

| Piece | Where | How it ships |
|---|---|---|
| Android app (Kotlin/Compose) | `android/` | APK build |
| Admin web (Next.js) | `admin/` → callproai.in | **Vercel, production from `main` only** |
| Database + edge functions | Supabase `rqgkzamuohdvttnkluzn` | functions redeploy **on push to `main`** |
| WhatsApp worker (Node/Baileys) | `services/baileys/` | **hand-uploaded zip to Hostinger** |

Worker URL: `https://pink-worm-375262.hostingersite.com`

---

## 2. Working rules you must not break

These are not style preferences. Each one was learned by breaking it.

### 2.1 Branch and PR
- Develop on `claude/telecaller-popup-funnel-80ic6f`. **Never push to `main`.**
- **ALWAYS LEAVE AN OPEN PR.** Pushing to the branch ships *nothing* — Vercel
  builds production only from `main` and edge functions only redeploy on a push
  to `main`. A branch push gets a Preview URL nobody opens.
- After every push, **check whether the branch's last PR was already merged**
  (it usually was) and open a **NEW** PR if so. Commits pushed after a merge are
  not in that merged PR and are not reachable from `main`.
- Never write a model identifier (`claude-*`, `gemini-*`, etc.) into a commit,
  PR, code comment or doc.

### 2.2 Migrations
- Sequential. **Next free number is `0200`** (0199 is the last used).
- Apply it live **and** commit the identical `.sql` to `supabase/migrations/`.
  The DB and the repo must never drift.
- Idempotent: `create ... if not exists`, `create or replace`, `drop policy if
  exists` before `create policy`.
- A function whose OUT columns change **cannot** be `create or replace`d —
  `drop function if exists <name>(<arg types>);` first, or you get
  `cannot change return type of existing function`.

### 2.3 Secrets
- Never commit tokens. Meta/CAPI tokens live in Supabase Vault
  (`capi_token_secret_id`, `page_access_token_secret_id`).
- `BAILEYS_SECRET` and `BAILEYS_INGEST_SECRET` live on Hostinger and in
  Supabase function secrets. **Both are currently pending rotation** — they were
  exposed in a screenshot. Do not print them anywhere.
- `whatsapp-observe` runs with **`verify_jwt` OFF by design** (the caller is a
  Node worker with a shared bearer, compared in constant time). Do not "fix"
  that. Do not turn `verify_jwt` off anywhere else to clear a 401.

### 2.4 Tenancy — the two rules that must never bend
- **Super admin (`ankitguitarmonk@gmail.com`) is cross-company, always.** Never
  pin a super-admin page, query or default to `profiles.company_id`. Every
  feature gets an all-companies view and/or a company picker.
- **Company-scoped rows never leak across companies.** A lead must never be
  owned by one company while assigned to another company's rep.

### 2.5 Voice of the product
Simple English, short words a telecaller already knows. Not Hindi, not
Hinglish — reps found romanised Hindi *harder*. Every screen explains itself in
one line. If a screen needs explaining twice, the screen is wrong.

---

## 3. What the WhatsApp observer does

A telecaller links their own WhatsApp to our worker **as a linked device**,
exactly like WhatsApp Web. The worker **watches and never sends**. Everything it
sees is POSTed to the `whatsapp-observe` edge function, which is the only writer
of `wa_observed_messages`.

```
rep's phone ──WhatsApp multi-device──► Baileys worker (Hostinger)
                                            │  batches
                                            ▼
                                  whatsapp-observe (edge fn)
                                            │
                                            ▼
                             wa_observed_messages + wa-media bucket
                                            │
                                            ▼
                admin/app/dashboard/platform/telecallers-activity  (super admin)
```

Why it exists: reps do most of their selling on WhatsApp, and none of it reached
the CRM. A rep who spent the morning on WhatsApp read as a rep who did nothing.

### Key files
| File | Role |
|---|---|
| `services/baileys/src/server.js` | the whole worker, one file, ~2000 lines |
| `supabase/functions/whatsapp-observe/index.ts` | the ingest and the privacy gate |
| `supabase/functions/_shared/wa-provider.ts` | CRM → worker calls |
| `supabase/functions/notify-provider/index.ts` | keeps the worker bearer server-side |
| `admin/app/dashboard/platform/telecallers-activity/` | the super-admin screens |
| `admin/app/dashboard/whatsapp/TelecallerWhatsApp.tsx` | link / QR / pair-code UI |

---

## 4. Every bug found and fixed, in order

This is the important section. **Most of these looked identical from the
outside — "the rep scanned and nothing came" — which is why the same rep was
asked to scan four times for four different bugs.** Do not re-diagnose from
symptoms; check the data.

| # | Bug | What it looked like | Fix | Worker |
|---|---|---|---|---|
| 1 | Credential-resurrection race: a reset deleted the auth dir, but a live orphan socket wrote the old creds straight back | "Connected" with no QR | generation-suffixed auth dirs, `dead` flag, listeners off **before** `end()` | v9–v13 |
| 2 | `AUTH_DIR` inside the per-deployment folder | every upload logged the rep out | default to `~/.callpro-wa-auth` | v14 |
| 3 | `migrateLegacyAuth` used `if (!entry.isFile()) continue` | skipped every `rep-<id>/` folder — the deploy meant to stop logouts would have caused them | recursive `copyInto` | v14 |
| 4 | `fetchLatestBaileysVersion()` **does not throw** on failure — it returns the bundled, year-stale version with `isLatest: false` | WhatsApp refused the handshake, `428` before any QR | full resolver ladder: env → live (checking `isLatest`) → jsdelivr → disk cache → bundled reported as UNKNOWN | v15 |
| 5 | `515 restartRequired` treated as a failure and parked behind `backoffMs`, which had doubled to the 5-min ceiling | phone stuck on "Logging in…" | its own branch, 250 ms, no error recorded — **515 is the mandatory second half of pairing** | v15 |
| 6 | Client identity flipped between pairing and the post-pair restart | WhatsApp refused the reconnect | pin identity to `identity.json` | v16 |
| 7 | `WATCH_GROUPS` defaulted false | every group dropped | default true | v16 |
| 8 | **`markOnlineOnConnect: false`** — Baileys turns this into `sendPresenceUpdate('unavailable')`, telling WhatsApp the device is unreachable | **no live message ever arrived, for any rep, in the life of the feature** | `MARK_ONLINE` flag, default true (Baileys' own default) | **v17** |
| 9 | `healthOf()` derived from traffic, not from the connection | "Never connected — have the rep scan" about a live device | `link_ok_at` + a 4-min heartbeat; worker status takes precedence | v17 |
| 10 | Grid items default to `min-height: auto`, so `overflow-y: auto` never engages | no scroll, newest messages unreachable, empty state invisible, auto-scroll silently failing | `min-height: 0`; container queries because the sidebar leaves ~840px | — |
| 11 | **Every listener began `if (!jid.endsWith("@s.whatsapp.net")) return;`** | WhatsApp moved accounts to **LID addressing** (`<id>@lid`), so **every one-to-one chat was discarded on arrival**. Groups are `@g.us` and survived — hence "only group chats" | accept `@lid`; resolve the number from `key.senderPn` / `key.participantPn`, the contact list, and `chats.phoneNumberShare`; keep unresolved ones flagged `peer_is_lid` | **v20** |
| 12 | History sync read only `h.messages`, ignoring `h.chats` and `h.contacts` | a year of imported chat with every name blank | read all three | v20 |
| 13 | A failed decryption arrives as `messageStubType: CIPHERTEXT` with an empty body — and was dropped by `if (!text.trim() && !kind) return;` | host log full of `Bad MAC` while the dashboard showed a clean empty screen. **"No chats" and "every chat arrived locked" looked identical** | keep the row, flag `decrypt_failed`, report totals on `/status`, red banner + 🔒 bubble | **v21** |
| 14 | `pushName` is the **sender's** name, taken as the peer's in every case | seven different buyers all labelled with the rep's own WhatsApp name; a group renamed itself after whoever spoke last | inbound 1-to-1 only; group subject from metadata; `sender_name` added | **v22** |
| 15 | The address book and group list arrive **only on a fresh link**, in the initial app-state sync — Baileys runs it only while `syncState === Syncing`, so a worker reconnecting on existing credentials skips it | four uploads in a row reconnected perfectly and knew nobody's name | ask explicitly on every connect: `groupFetchAllParticipating()` + `resyncAppState()` | **v23** |
| 16 | `jidDigits` stripped non-digits, mangling legacy group ids (`919991804787-1578638344` → `9199918047871578638344`) | that group's name filed under an id matching none of its 526 messages | keep the local part intact for `@g.us` | **v24 (uncommitted)** |

### And on the ingest side
| Bug | Effect | Fix |
|---|---|---|
| **Two** media gates requiring `contactId` (`if (b64 && contactId && kind)` and `if (!row \|\| !row.contact_id ...)`) | 345 photos and PDFs arrived and **none** was stored — they were all in groups, and a group can never match a lead | both lifted; the privacy decision is taken once, for the conversation, not again for its files |
| The early-return guard ignored `media` and `lidmap` | a drainer batch carrying only files was rejected at the door | both added to the guard |
| `peer_name` written per message row, collapsed with `max()` | the name a buyer appeared under changed with whichever message sorted highest | `wa_peer_names`: one row per number per rep, with a source; **`book` always beats `push`** |
| Failures were never reported, only successes | a file that was too big or expired left the row untouched, which the panel rendered as "still downloading" forever | `media_status` + `media_error`, reported for every outcome |

---

## 5. Things that are TRUE and cost days to learn

Do not re-litigate these.

1. **`fetchLatestBaileysVersion()` never throws.** A blocked network looks
   exactly like success. Check `isLatest`.
2. **515 is not an error.** WhatsApp always drops the socket right after a fresh
   scan. Reconnect immediately or the phone sits on "Logging in…".
3. **The `browser` identity is registered with the device.** A reconnect
   claiming a different identity is not the device that paired. Only the desktop
   identity (`["Mac OS","Desktop","14.4.1"]`) gets a full history archive.
4. **Bad MAC has no repair.** Only a fresh pairing mints new Signal keys. But
   measure before you act on it — today it is **1 message out of 1,149**, not
   the wall it looked like.
5. **WhatsApp deletes media from its servers after about a month.** WhatsApp Web
   cannot open an old photo either. A missing old file is not our bug.
6. **The history sync only arrives on a FRESH LINK.** A worker restart, however
   clean, gets nothing. This is the *only* remaining reason to ask a rep to scan.
7. **`whatsapp-observe` must keep `verify_jwt` off.**
8. **`call_logs` has no `extra` column.** Some phones record SIM calls as `.amr`;
   the amr-convert function + amr-transcode workflow handle those.
9. **A scan that "failed" usually worked.** One scan once delivered **13,305
   messages across 351 people covering 31 Aug 2025 → 15 Sept 2026**. Every later
   "the scan didn't work" was us throwing the data away after it arrived.

---

## 6. Where it stands right now (verified 16 Sept 2026, 19:05 IST)

Worker **v23** is live on Hostinger. Heartbeat healthy (under 4 minutes old).
All PRs through #471 are merged, so the CRM side is fully deployed.

```
live messages            1,149
  one-to-one                35   across 9 people   ← all from today 13:00 IST
  groups                 1,114
locked (Bad MAC)             1
attachments                380
  stored                    32   (everything recent; the rest predate capture)
group names               23/23  ← v23 fetched every one
person names (address book)   0  ← resyncAppState returned no contacts
archived (the old capture) 13,305  (hidden, not deleted — `archived_at`)
```

One-to-one capture begins **in the hour v20 was uploaded** (12:59 IST) and not a
minute before. That is the LID bug, proven.

### Open problems — this is your work

**A. No new messages for five hours, with a healthy heartbeat.**
Last message 13:47 IST; it is now 19:05 IST; the socket reports connected and
the heartbeat is fresh. The rep's phone is certainly not idle. Either the socket
is alive but no longer subscribed to message notifications, or messages are
arriving and being dropped somewhere that leaves no trace. **Start by making the
drop visible** — `/status` already carries `dropped`, `undecryptable` and
`lids_known`; read them before touching code.

**B. The address book never arrives.** `resyncAppState()` runs without error and
yields 23 group subjects but zero person contacts, so a buyer still shows as
`917056208162` instead of the name the rep has saved. Worth checking whether the
contact collection needs `isInitialSync: true`, or whether contact names only
ever come with a fresh link's history sync.

**C. Worker v24 is uncommitted.** The legacy-group `jidDigits` fix (row 16
above) is in the working tree, not yet committed, pushed or uploaded.

**D. Pending, unrelated:** rotate `BAILEYS_SECRET` / `BAILEYS_INGEST_SECRET`;
re-link the founder's own WhatsApp sender (the Daily Pulse is not going out).

---

## 7. How to verify anything here yourself

```sql
-- the live capture at a glance
select count(*) live,
       count(*) filter (where not is_group) direct,
       count(distinct peer_phone) filter (where not is_group) people,
       count(*) filter (where decrypt_failed) locked,
       count(*) filter (where media_path is not null) files,
       max(sent_at) last_message
from public.wa_observed_messages where archived_at is null;

-- is the worker actually alive?
select status, now() - link_ok_at heartbeat_age, now() - last_seen_at data_age
from public.wa_rep_sessions;

-- when did one-to-one capture start, by hour IST?
select date_trunc('hour', sent_at at time zone 'Asia/Kolkata') hr,
       count(*) n, count(*) filter (where not is_group) direct
from public.wa_observed_messages
where archived_at is null group by 1 order by 1;
```

Worker build check, before any upload:

```bash
cd services/baileys && node --check src/server.js
BAILEYS_SECRET=x BAILEYS_INGEST_SECRET=y INGEST_URL=http://localhost/x \
  node -e "import('./src/server.js').then(()=>process.exit(0))"
```

Admin build: `cd admin && npx next build` (must compile — Vercel gates on it).

---

## 8. What NOT to do

- **Do not ask the rep to re-scan as a first move.** Four scans have already
  been spent on bugs no scan could touch. Scan only when the data proves the
  link itself is the problem, or when you specifically want the history sync.
- **Do not build a self-updating worker** that accepts pushed code. That is an
  arbitrary-code-execution endpoint on the box holding WhatsApp credentials.
- **Do not build a second retrieval store.** Everything shares one
  `match_knowledge` brain.
- **Do not add a second prompt scheduler.** The rep assistant is one engine
  (`AssistantPrompts.kt` + `MainViewModel.tickAssistant`), three questions, one
  prompt on screen ever.
- **Do not restore the post-SIM-call modal.** It cannot open in time; the
  Update button shakes instead, on purpose.
- **Do not print a confident cause you have not checked.** This panel has
  already shipped three explanations that turned out to be false — "nothing is
  broken, re-scanning will not help", "WhatsApp had already deleted this file",
  and a "Downloading…" that was decided from a clock. Each one sent a human
  down the wrong road for a day. If you do not know, say the symptom and stop.
