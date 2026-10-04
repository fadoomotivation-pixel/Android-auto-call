# Call Pro AI — how this product was built, and why it is shaped like this

Written for an AI assistant that is about to read this repository and suggest
changes. Read this and `CLAUDE.md` before proposing anything. `CLAUDE.md` holds
the rules; this file holds the reasons.

Nothing here is aspiration. Every number is a measurement taken from the
production database, and every rule exists because something broke.

---

## 1. What it is, in one paragraph

An AI calling CRM for Indian real-estate telecaller teams. A telecaller opens
the Android app in the morning with ~300 open leads, dials 100+ numbers a day
one-handed, and is usually mid-call while using the screen. The founder never
opens a dashboard; they read one WhatsApp message at 7pm. **Every design
decision in this product follows from those two sentences.**

Multi-tenant: one platform, many builder companies, one super admin
(`ankitguitarmonk@gmail.com`) who sees across all of them.

---

## 2. The four moving parts

| part | stack | where | deploys |
|---|---|---|---|
| Telecaller app | Kotlin / Jetpack Compose | `android/` | GitHub Actions → rolling release `android-latest`; the app self-updates |
| Admin CRM | Next.js App Router | `admin/` | Vercel, **production only from `main`** |
| Backend | Supabase — Postgres + 53 edge functions | `supabase/` | functions redeploy **only on push to `main`** |
| WhatsApp observer | Baileys worker on Hostinger | `services/baileys/` | **hand-uploaded by the founder**, not by CI |

216 migrations. The filenames are sentences, not ticket numbers, because the
schema is the product's memory: `0206_an_unanswered_buyer_lands_in_call_now`.

---

## 3. How it got here, in eras

**0001–0030 · A dialler.** Companies, profiles, contacts, call logs, campaigns,
RLS. Then SIP/cloud telephony (Uro, later CallerDesk) and call recording.

**0031–0060 · A CRM.** Funnel stages, territories, site visits, lead
assignment, the first analytics. `0055_sales_xray` — the first time the product
tried to say something about *why* deals were lost rather than counting them.

**0061–0080 · A brain.** RAG: `knowledge_chunks` + `match_knowledge`, a single
shared retrieval store with a global layer for platform-wide guidebooks. Call
recordings move to Drive/Storage with Whisper transcription.

**0081–0110 · Lead supply and the founder's report.** Facebook lead ingestion
(one central ad account routing to many companies by form), the Daily Pulse,
the notification outbox, `profiles.speaks_as` so generated Hindi matches the
rep's gender.

**0111–0160 · The lifecycle wars.** The hardest stretch. `status` (what
happened on the last call) and `stage` (how far the deal has come) were one
column and kept overwriting each other — a no-answer erased a qualification.
They were split, `lead_stages` became the single source of truth for labels,
colours and meaning, and stages were made unable to move backwards.
`v_lead_action_state` was born: **one clock that answers "what do I do next"**.

**0161–0200 · WhatsApp becomes evidence.** The Baileys observer lands. Then a
long run of painful discoveries, each one a migration:
- WhatsApp moved 1:1 chats to `@lid` addressing — the capture filter was
  matching `@s.whatsapp.net` only, so **every one-to-one chat was invisible**
  while group chats arrived fine.
- 345 attachments stored as zero because two gates in `whatsapp-observe`
  rejected media-only batches.
- Messages that failed to decrypt were dropped silently, so a rep whose every
  chat was broken looked exactly like a rep with no chats.
- `pushName` is the *sender's* name, so seven buyers were all named after the
  rep's own WhatsApp profile.
- The `wa-media` bucket had **no storage policy at all** and both call sites
  discarded the error, so "1/1 file downloaded" sat next to a file that could
  not be opened.

**0201–0216 · Telling the truth.** A watchdog, because a stopped worker still
read "connected" for fourteen hours. Then the current run: what buyers actually
said (`lead_memory`), what reps promised and did not do (`lead_promises`), a
follow-up writer that learns from replies (`followup_drafts`), and measuring
recordings instead of trusting a copied number (`audio_seconds`).

---

## 4. Feature map

### Telecaller app (`android/app/src/main/java/com/salesautocall/app/`)
- `ui/TelecallerScreens.kt` — home deck, Leads, **Follow-ups**. The biggest file
  and the heart of the product.
- `ui/LeadDetailScreen.kt` — one lead: calls, recordings, notes, the AI Coach
  card (Pitch · Objection · Message), the update sheet.
- `dialer/` — `AutoDialerService` (power-dial a list), `ManualCallService`,
  `SimRecorder` (records SIM calls; falls back through three audio sources and
  verifies the stream is not silent), `NativeRecordingHarvester` (picks up the
  OEM recorder's files).
- `sip/`, `fcm/`, `update/` — cloud calling, push, self-update.
- `ui/AssistantPrompts.kt` — the rep assistant. Asks **three questions and
  nothing more**, one prompt on screen ever, 40-minute gap, 5/day cap.

### Admin (`admin/app/dashboard/`)
~35 pages. The ones that matter: `leads`, `recordings`, `whatsapp` (QR linking),
`rag` (guidebook ingestion), `pulse`, `platform/hq`,
`platform/telecallers-activity` (read any rep's whole WhatsApp as a chat app),
`facebook`, `xray`, `velocity`, `health`, `integrity`.

### Edge functions (53) — the ones with opinions
| function | what it is for |
|---|---|
| `focus-five` | the five leads most likely to move today, with an opener to say |
| `rep-coach` | the floating coach; `{coaching, brief, tip}` + two-way Q&A |
| `win-harvest` | a win becomes a company-scoped knowledge chunk every rep can use |
| `lead-memory` | one distilled memory per lead from calls **and** WhatsApp |
| `promise-watch` | what the rep promised on a recording; SQL decides if it was kept |
| `follow-up-draft` | the next WhatsApp message, in her words, judged by replies |
| `pulse-broadcast` | the 7pm founder report |
| `founder-alerts` | three kinds of news only: visit fixed, booking, payment |
| `whatsapp-observe` | ingest from the Baileys worker |
| `recording-upload` / `recording-url` | store and serve call audio |
| `facebook-poll` | pulls leads every 10 min (Meta's webhook is unreliable) |

---

## 5. The rules, and the scar behind each one

These are not preferences. Proposing any of them again is how this product
regresses.

**No post-call popup.** It cannot open in time — the phone's in-call screen owns
the foreground. The lead's Update button shakes instead.

**The Follow-up tab is three groups and one clock.** Never a fourth. Finishing a
callback books the next one, so a finished lead is instantly back in the tab
looking untouched — that is how a rep who had called everyone still read
"Follow-up 107" and stopped believing the number.

**One scheduler.** A second prompt engine is how this becomes spam and gets
swiped away unread.

**One retrieval store.** Everything shares `match_knowledge`. Never a parallel one.

**Simple English, not Hindi.** Reps found romanised Hindi *harder*. Short
sentences, one idea per line.

**Every screen explains itself.** Reps said the lead buckets "sometimes don't
make sense". Never leave a rule to be guessed.

**Never let a screen say a number it cannot stand behind.** This is the deepest
rule here, learned repeatedly: a dead worker that read "connected", a chat list
six days stale that looked healthy, a four-minute call that showed "4m 52s"
while holding one second of audio. **Silence must never look like success.**

**Off-CRM recordings are super-admin only**, and on a phone a recording plays
only for the telecaller who made that call.

**Company isolation is absolute.** Only the super admin is cross-company, and
every super-admin screen must be cross-company — never pinned to
`profiles.company_id`.

**Always leave an open PR.** A branch push ships nothing: Vercel and the edge
functions only deploy from `main`.

---

## 6. Where it actually stands (measured, not claimed)

```
542   leads            0   booked
11,825 calls on the busiest rep's account
  320  in her "Call now" at once
   52  numbers rung 4+ times that have never once been answered
  217  leads where a real recorded conversation happened
   82  of those discussed a site visit on the phone
   11  ever reached the site-visit stage
   70  of the 82 got no WhatsApp at all after that call
  952  SIM recordings marked ready in 30 days
  253  of them produced a transcript
```

Read that again: **the product works, the funnel does not.** The gap between 82
agreed visits and 11 that happened is the business problem this codebase is
currently pointed at.

---

## 7. Known gaps — do not re-discover these, build them

1. **No alert when WhatsApp capture dies.** A session was logged out on 25 Sep
   and the founder found out six days later by looking at a screen.
2. **The Daily Pulse reaches the rep, not the founder** — every founder
   subscriber row is `active: false`.
3. **952 existing recordings have never been measured.** `audio_seconds` only
   describes uploads from migration 0216 onward.
4. **The rep has no in-app list of uncaptured leads.** `v_wa_uncaptured_leads`
   exists and only the web reads it.
5. **`win-harvest` never reads WhatsApp** — it learns from call summaries alone.
6. **`lead_activities` holds no real words**, only "stage changed" rows.
7. **Meta CAPI is half-built**: no deal value on Booked, no `value`/`currency`
   on Purchase, no trigger on `stage`, no retry, no health view.
8. **No automatic WhatsApp send.** Drafts open the rep's own WhatsApp
   pre-filled; true one-tap send needs new worker code, which CI cannot deploy.

---

## 8. If you are an AI about to change this repo

- Read `CLAUDE.md`. Then read the last 20 merged PR descriptions — they are
  written as explanations, not changelogs, and they say why things were removed.
- **Measure before you build.** Every good change in this repo started with a
  SQL query. Several bad ones started with an assumption — including, in one
  session, mine: I read `recording_seconds`, told the founder the audio files
  were fine, and was wrong, because that column is a copy of the call duration
  and has never described the audio.
- Say "GUESS" when you are guessing. A confident wrong answer costs more here
  than no answer, because the founder acts on it.
- Migrations are applied to production **by hand**; the matching code ships by
  merging to `main`. Shipping one without the other is what makes a feature look
  half-broken.
- Two AIs share this tree. See `docs/AI_COLLAB_RULES.md` and `docs/AGENT_SYNC.md`.
