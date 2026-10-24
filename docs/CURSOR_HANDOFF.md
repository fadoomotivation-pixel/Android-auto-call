# Cursor — handoff from Claude Code (24 Oct 2026). Paste this as your first prompt.

You are joining **Call Pro AI** as a third AI engineer. Claude Code and Antigravity also work on
this repo. You cannot see their chats. This file tells you what the product is, what the last two
days changed and where, what is half-done, what we are trying to do next, and which mistakes have
already been made so you do not repeat them. **Read all of it before you edit anything.**
If something here disagrees with the code or the database, trust the code and the database, and
say so in your reply.

---

## 0. Read these first, in this order
1. `CLAUDE.md`: non-negotiable product rules. They override your defaults.
2. `docs/AGENT_SYNC.md`: the top 10 entries. This is how the AIs talk to each other. **Add an entry
   at the top after every change you make.** Use the same style: date, who, what was found, what
   changed, what is left.
3. `docs/AI_COLLAB_RULES.md`: database invariants (section 5) and AI authority order (section 6).
   Two lines in it are **out of date**. The branch name is now per agent (see section 3 below), and
   the next migration number is **0236**, not 0086.

---

## 1. The product in one minute
- **Customers:** Indian real-estate companies, each with a team of telecallers ("reps").
  - Companies with reps: Capital Brix (6), Manas property (3), Mayur Dholera (2), SN Developers (2),
    Fanbe (2), and ankit (2), the HQ tenant.
  - "Sunrise Infra (Demo data)" is a demo company. Never count it as a customer.
- **Android app** (`android/`, Kotlin + Jetpack Compose): what the reps use. It handles leads,
  calls, call recording upload, follow-ups and the AI coach.
- **Admin web** (`admin/`, Next.js): what founders and company admins use, at callproai.in, on
  Vercel.
- **Supabase project `rqgkzamuohdvttnkluzn`** has three parts:
  - Postgres plus RLS: `supabase/migrations/`.
  - Edge functions in Deno: `supabase/functions/`, with shared code in `supabase/functions/_shared/`.
  - pg_cron jobs and pg_net calls.
  - **Never touch any other Supabase project** (for example `sdmibpxecasgfyodqzow`).
- **WhatsApp worker** (`services/baileys/`, Node + Baileys 6.7.24):
  - It runs on **Hostinger**, and it is updated by the founder uploading a zip. You cannot deploy it.
  - It holds the founder/platform sending numbers (`/p/<name>`) and each rep's linked WhatsApp
    (`/s/<rep>`).
  - The live version is **2026.10.24-31**.
- **The user is the founder and platform super admin** (`ankitguitarmonk@gmail.com`). They write in
  Hinglish and want things decided and done ("think like CEO"). Reply in simple English.

---

## 2. Non-negotiable rules (short version; CLAUDE.md has the reasons)
1. **The super admin is ALL companies.** Every admin page needs an all-companies view and/or a
   company picker. Never default a super-admin query to `profiles.company_id`.
   - Copy the pattern in `admin/app/dashboard/leads/` (scopeCompany + companyFilter).
2. **Company isolation is absolute.** No contact, call, rep, knowledge or token data may cross
   companies. A regular admin only ever sees their own company. Never widen RLS.
3. **No secrets in git.** Keys live in Supabase function secrets, Supabase Vault or Vercel env.
   - Never print a secret in output.
   - Never write an AI model id (like `claude-…`) into commits, PRs, code or docs.
4. **Never turn `verify_jwt` off** to get past a 401. Never disable TLS checks.
5. **Telecaller app text:** simple English, not Hindi or Hinglish.
   - Short lines, one idea each.
   - Every screen explains itself in one line.
6. **Design:**
   - Android uses `ui/design/IosKit.kt` only. Do not add a fifth pill or header component.
   - Colours come from `AppColors`/`IosColors`, sizes from `AppType`.
   - Admin uses `app/globals.css` tokens only. In a `.tsx`, never write a hex colour, a raw px font
     size, or `rgba(255,255,255,…)`.
7. **Admin timestamps are in IST:** `toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })`.
   - Never pass `timeZone` to a NUMBER's `toLocaleString`. That breaks the Vercel build.
8. **Nothing may send WhatsApp from a rep's own number** except
   `follow-up-draft action:'send'`, after the rep pressed Approve.
   - Never pool WhatsApp LID maps across sessions.
9. **One brain for knowledge:** `match_knowledge` / `knowledge_chunks`. Never build a second
   retrieval store.
10. **One prompt engine for the rep assistant:** `AssistantPrompts.kt` + `MainViewModel.tickAssistant`.
    Never add a second scheduler of pop-ups.

---

## 3. How work actually ships (people get this wrong)
- **Branches:**
  - Work on your OWN branch, e.g. `cursor/<short-topic>`, cut from `origin/main`.
  - Never push to `main`, and never push to anyone's `claude/*` branch.
- **Nothing is live until a PR is MERGED into `main`.**
  - Vercel deploys production only from `main`.
  - `.github/workflows/supabase-deploy.yml` redeploys ALL edge functions on a push to `main`
    (`supabase functions deploy --use-api`, no Docker).
  - A branch push only gives a preview nobody uses.
  - So every piece of work ends with: commit → push → **open a PR** → tell the founder to press Merge.
- **Migrations:**
  - Number them sequentially. The **next one is `0236_<what_it_does>.sql`**.
  - Make them idempotent: `if not exists`, `create or replace`, `drop … if exists` then create.
  - The MCP `apply_migration` usually **times out waiting for approval**. The founder then runs the
    SQL by hand in the Supabase SQL editor.
  - Because of that, `supabase_migrations.schema_migrations` does NOT list 0234 and 0235, even
    though both ARE applied. **Check that the objects exist; do not trust that table.**
  - Never re-run a migration "to be safe" without reading it.
  - Commit the exact SQL that was applied.
- **Android:**
  - There is no local SDK. CI (`.github/workflows/android.yml`) builds the APK on push.
  - A red build means fix it before anything else.
- **Admin:** run `cd admin && npx tsc --noEmit` and `npx eslint` before pushing.
- **Edge functions:**
  - Type-check with `deno check <file>`.
  - Pre-existing errors in `notify.ts`, `pulse.ts`, `voice-note-ai`, the summarize Blob typing and
    `recording-upload:246` exist on main too. They are not yours, but do not add new ones.
- **WhatsApp worker:** change `services/baileys/src/server.js` and bump the version string. The
  founder then uploads a new zip to Hostinger. Until they do, the old worker runs.
- **GitHub scheduled/dispatch workflows** run only from the repo's default branch,
  `claude/sales-app-auto-call-logging-Bb7e6` (not main).

---

## 4. What was done on 23–24 Oct 2026 (all merged to main; PRs up to #564)

### 23 Oct
1. **Edit a telecaller's name and login email** (admin).
   - Files: `admin/app/dashboard/salespeople/{EditTelecaller.tsx, actions.ts, page.tsx}`,
     `admin/app/dashboard/platform/telecallers/page.tsx`, `admin/lib/dashboard/loginEmails.ts`.
   - Email changes use `email_confirm: true`, because reps' inboxes often get no mail.
   - The deploy workflow switched to `--use-api`, because Docker pulls were rate-limited.
2. **Call Pro AI's own sending number on the same worker.**
   - The worker gained `/p/<name>/…` sender sessions.
   - Migration **0232**: `whatsapp_baileys.sender_session`.
   - Files: `supabase/functions/notify-provider/index.ts` (actions `platform_number`/`platform_qr`/
     `platform_unlink`), `_shared/wa-provider.ts` (`BaileysProvider(base, secret, session)`),
     `admin/app/dashboard/whatsapp/{PlatformNumber.tsx, PlatformSender.tsx}`.
   - The platform number is **+91 99997 50049**. **+91 70489 17300 is Capital Brix attendance only.**
3. **Daily Pulse** (the founder's daily WhatsApp report).
   - The sending number is visible and pickable.
   - A founder can pick which telecallers their report covers: migration **0233**,
     `pulse_subscribers.include_reps`.
   - 2+ founders per company.
   - Files: `admin/app/dashboard/pulse/{AutoSend.tsx, page.tsx}`, `_shared/pulse.ts` (`forReps`,
     `sumTotals`), `pulse-broadcast/index.ts`.
4. **"Waiting for this message" fix** (worker v29). The worker now answers WhatsApp retry receipts
   (`getMessage` from a per-session `sent-cache.json`).
5. **Delivered/read ticks** (worker v30).
   - The worker reports `{delivery:[…]}` to `whatsapp-observe` (`applyDelivery`, forward-only).
   - Admin AutoSend shows "Sent" in grey for 10 minutes, then amber "not delivered".
6. **Weekly report card for every telecaller**, built from their recorded calls.
   - Migration **0234** (applied by hand): table `rep_week_reviews`, cron `rep-week-review-build`
     (Mondays).
   - Files: `_shared/weekreview.ts`, `rep-week-review/index.ts`, the weekly send in
     `pulse-broadcast/index.ts`, `admin/app/dashboard/coach/WeeklyCards.tsx`.
   - Patterns are counted in code, then ONE AI call per rep per week writes the feedback.
   - A point citing a call it was not given is dropped.
   - Under 3 recorded calls the card is numbers only.
   - **The Monday switch `platform_automation.rep_weekly_on` is still OFF.** The founder turns it
     on from AI Coach → Weekly report card.

### 24 Oct
7. **After the call, the WhatsApp is already written; the rep approves and it goes from HER number.**
   - Migration **0235** (applied by hand) adds:
     - `followup_drafts.source/call_id/sent_via/wa_message_id/edited`.
     - Trigger `call_logs_after_call_draft`. It fires when summary_status becomes 'ready' on a call
       of 45s or more that has a lead and a rep, unless the disposition is
       not_interested/lost/dnc. It calls `follow-up-draft {mode:'after_call'}` via pg_net.
     - Table `rep_personas`.
     - `wa_rep_sessions.lid_resolved_at/lid_resolved`.
     - Functions `rep_lead_lists`/`take_back_leads`.
     - Crons `rep-persona-nightly` and `wa-lid-resolve-hourly`.
   - `supabase/functions/follow-up-draft/index.ts`:
     - `compose()` writes the draft from the call summary plus the rep's persona.
     - `afterCall()` writes one draft per call and pushes a notification.
     - `sendApproved()` checks it is her draft, her lead and her connected session, then calls
       worker `/s/<rep>/send`. Otherwise it returns `fallback:true` and the app opens WhatsApp.
   - `supabase/functions/rep-persona/index.ts`: a nightly persona per rep (needs at least 5
     recorded calls in 21 days). A phrase is kept only if it really appears in her own messages.
   - Android:
     - `data/Repository.kt`: `pendingDraft`, `readyDrafts`, `sendDraft`.
     - `ui/MainViewModel.kt`: `approveDraft`, `loadReadyDrafts`.
     - `ui/LeadDetailScreen.kt`: an editable draft card with **Approve & send**.
     - `ui/TelecallerScreens.kt`: "WhatsApp ready" in Today's Plan.
   - Admin: `coach/RepPersona.tsx`.
8. **Take back a telecaller's lead list.** This came from Sagar: two scanned lists were mixing.
   - Admin → Leads → Assigned → pick a telecaller → "Take back a lead list".
   - Files: `admin/app/dashboard/leads/{TakeBackLists.tsx, LeadManager.tsx}`.
   - Leads go to Unassigned. Nothing is deleted.
9. **WhatsApp hidden numbers (LIDs).**
   - `supabase/functions/wa-lid-resolve/index.ts` asks the rep's own worker session which LID
     each of HER called leads has: up to 300 per run, resuming from `lid_resolved.next_offset`.
   - The worker saves the map per session in `AUTH_DIR/lid-maps/`.
   - Admin: `whatsapp/TelecallerWhatsApp.tsx` → "Match chats to leads".
   - Result for Nidhi: from 0 to 505 messages matched across 39 leads.
10. **AI keeps working when Groq's daily quota runs out** (PR #564).
    - `_shared/chat.ts` `withModels()` tries a provider's other models.
    - `_shared/groq.ts` treats a per-day 429 as "this model is spent".
    - `_shared/summarize.ts`: Whisper falls back to the turbo model, and the summary goes through
      the shared chain.

### Open right now
11. **PR #565 (not merged yet)**, in `_shared/chat.ts`:
    - Every AI attempt has a 45s deadline (`CHAT_TIMEOUT_MS`). A Gemini call had hung for 150s
      and killed the function.
    - **OpenRouter** is added as a 5th, dormant provider (`OPENROUTER_API_KEY`).
    - This handoff file is in the same PR.

---

## 5. Live state, checked 24 Oct evening
- Rep WhatsApp sessions: **Nidhi connected; Ankita disconnected.** Ankita must re-scan the QR on her
  phone. That is a founder/rep action, not code.
- `followup_drafts`: 1 after-call draft and 1 button draft are waiting. There are 3 personas and
  1 weekly review.
- Crons `rep-week-review-build`, `rep-persona-nightly` and `wa-lid-resolve-hourly` are active.
- `platform_automation.rep_weekly_on = false`.
- Recorded calls in the last 21 days: Fanbe's Ankita 509 and Nidhi 404, Manas's Shweta 13, and
  Capital Brix's Tani 6. Everyone else has 0. Reps without recordings get numbers-only cards and no
  persona until recording is on.
- Sagar (Capital Brix): his phone has not synced since 22 Oct, and his calls this week were all
  off-CRM. The fix is on the phone (log in, allow permissions), not in code.

---

## 6. What we are trying to do now: run the AI for free, without depending on Groq alone

### The problem
- Most AI features used ONE free Groq key: about 100k tokens per day per model.
- With ~100 recorded calls a day (summary + after-call WhatsApp + weekly card + persona + coach),
  it runs out by afternoon. Then summaries fail and drafts are skipped.
  - On 24 Oct, 5 summaries failed and the first after-call draft died on "429 tokens per day".

### How the code is built for this (do not rebuild it)
- `supabase/functions/_shared/chat.ts` is the **one** multi-provider chain.
  - `chatJson(system, user, {temperature, only, prefer})` returns `{text, provider}` and throws
    with every error.
  - `askJson<T>(system, user, temperature)` never throws and returns `{data, error, model}`. It
    is the same shape as `groqJson` in `_shared/groq.ts`, so switching a caller is one word.
- Providers: mistral, groq, gemini, cerebras, openrouter.
  - The default order is `mistral → groq → gemini → cerebras → openrouter`.
  - `CHAT_ORDER` (a Supabase secret) changes the order with no deploy.
- Each provider takes several comma-separated keys: `GROQ_API_KEY`, `MISTRAL_API_KEY`,
  `GEMINI_API_KEY`, `CEREBRAS_API_KEY`, `OPENROUTER_API_KEY`.
  - Model names are env-overridable too: `GROQ_MODEL`, `MISTRAL_MODEL`, `GEMINI_MODEL`,
    `CEREBRAS_MODEL`, `OPENROUTER_MODEL`.
- **Health check:** `chat-shim-check`.
  - `{}` shows how many keys are configured.
  - `{"probe":true,"only":"gemini"}` tests ONE provider on its own. Do this for every new key.
    A plain probe only proves the first provider works.
- Transcription (Whisper) is still Groq only, in `_shared/summarize.ts` and `voice-note-ai`.
  Whisper's allowance is separate from text and has not been the bottleneck.

### Provider status on 24 Oct
| Provider | State | What fixes it |
|---|---|---|
| Groq | Works. Each model has its own 100k/day, and the chain walks gpt-oss-120b → gpt-oss-20b → qwen3.8-27b | — |
| Mistral | 403 on large ("tier"), then 429 rate-limited. Free tier is very small | — |
| Gemini | Key set, but the call **hangs**: no answer in 150s | Founder makes a NEW key at aistudio.google.com and replaces `GEMINI_API_KEY` |
| Cerebras | Key set, but every model answers **402 payment required** | Founder makes a new free account/key at cloud.cerebras.ai and replaces `CEREBRAS_API_KEY` |
| OpenRouter | Wired in #565, no key yet | Optional `OPENROUTER_API_KEY`. 50 free requests/day, or 1,000/day after a one-time $10 top-up |

### Free-AI recommendation (best first)
1. **Google Gemini Flash (AI Studio key)**: free with no card, strong at Hindi/Hinglish.
   - It can also take audio, so later it could transcribe and summarise a call in one request.
   - The free daily limit is reported anywhere from ~250 to 1,500 requests. Check it in AI Studio.
   - **On the free tier Google may use what you send to improve its products.** These are
     customers' calls. That is the founder's call to make, not yours. Do not hide it.
2. **Cerebras free**: reported ~1M tokens/day on open models, text only. Some sources say it is
   now a trial only. Verify with a probe.
3. **Groq**: keep it. It is fast and works, just capped.
4. **OpenRouter `:free` models**: a spare. Some free model hosts log prompts.
5. **Mistral free**: already there, tiny.
6. Not free but best for Hindi speech: **Sarvam AI**, ₹30 per audio hour. Cloudflare Workers AI
   has a small free Whisper allowance (10k neurons/day). Neither is wired; do not add them unless asked.

### The next coding task (do this only when the founder says go)
About 17 edge functions still `fetch("https://api.groq.com/...")` directly, or use `groqJson`.
New free keys do NOT help them. Move them onto the shared chain:
- **JSON callers** (they send `response_format: {type:"json_object"}`, or use `groqJson`). Switch to
  `askJson` / `chatJson`:
  - `amr-convert` (chat part only)
  - `promise-watch` (leave its `/models` diagnostic alone)
  - `lead-insights`, `lead-memory`, `sales-velocity`, `win-harvest`, `sales-xray`, `focus-five`,
    `rep-coach`, `second-chance`, `ad-advisor`
  - `training-picks` (uses `groqJson` and `currentModel` from `_shared/groq.ts`)
- **Plain-text callers** (no JSON mode):
  - `lead-brief`, `assistant-chat`, `manager-digest`, `rag-ask`, `rep-assistant`
  - `chat.ts` has no text-mode helper yet. Add ONE (`chatText`/`askText`, same chain, no
    `response_format`, Gemini without `responseMimeType`) rather than forcing JSON on them.
- **Interactive callers** (`rep-assistant`, `assistant-chat`, `rag-ask`): pass
  `prefer: ["groq", "gemini", "cerebras", "mistral", "openrouter"]`. Speed is the feature there,
  and Mistral first is slow.
- **Keep each function's existing guards:**
  - `rep-coach` makes at most ONE fresh AI call per request (the `spent` guard).
  - `knowledge-ingest` works in batches.
  - The edge CPU/wall budget is ~150s, and a 546 means you blew it.
- **Keep the error visible.** Every caller must return or store the provider error, never swallow
  it into a null. In Sept a retired Groq model silently killed all AI for two weeks.
- Leave Whisper on Groq unless asked.
- Leave `rate-limit-probe` alone; it is a diagnostic.
- Test it:
  - `deno check` each touched function.
  - After merge, probe with `chat-shim-check` and call one real function per type.
  - Read the response for `model`/`provider`.

---

## 7. Traps that have already cost us time
- Counting Compose component usage: use `\bName[ ]*[({]`, not `\bName(`. Trailing lambdas hide
  calls.
- `call_logs` has NO `extra` column. AMR recording state lives in `call_logs.summary_status`.
- `trg_dedup_contact_by_phone` **silently skips** a duplicate phone insert (returns 201 with 0 rows).
  Bulk inserts return fewer rows than you sent. That is normal, so report "already in your company".
- A lead's `company_id` follows its rep's company (trigger). Never set it against that.
- One pending follow-up per lead. Move it, never stack a second.
- Add contact notes via `append_contact_note()`. Never read-modify-write `contacts.notes`.
- `lead_activities.type` has a fixed list. 'reassigned' is NOT allowed; we used 'system'.
- pg_net's default timeout is 5s. Pass `timeout_milliseconds` when you call a slow function from SQL.
- Vercel builds sometimes fail on a transient Google Fonts fetch in `next/font`. Redeploy the same
  commit before you "fix" anything.
- The Follow-up tab chip and the home "Due now" count ONLY "Call now" leads. Never put the row total
  back. Read CLAUDE.md.
- After a SIM call the popup does NOT open (the Update button shakes instead). Do not "fix" that by
  restoring the modal.
- Two AIs share this repo. `git fetch origin main` and rebase before you start, and again before
  you push. Read files fresh from disk.

---

## 8. Done means
1. The code is changed and type-checked (deno / tsc / CI APK green).
2. Committed with a message that says WHY, then pushed to your own branch.
3. A PR to `main` is open. Tell the founder in one line what to press.
4. Any migration SQL is given to the founder to run in the SQL editor and committed as the same
   file.
5. A new entry is at the top of `docs/AGENT_SYNC.md`.
6. Your reply says plainly what is live, what is waiting on a merge, and what is waiting on the
   founder. Never say "done" for something that is only on a branch.
