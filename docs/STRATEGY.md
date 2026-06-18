# SalesAutoCall — Strategy & Architecture Memory

> Durable strategic context for both agents (Claude Code + Antigravity) and future
> sessions. Update when the competitive picture or a major architectural decision changes.
> (Operational/build rules live in `AGENT_SYNC.md`; this file is the "why" and the "landscape".)

## Mission
Dominate the Indian telecalling CRM space with a **mobile-first, AI-native, zero-telephony-cost** product that feels like a premium consumer app, not legacy B2B SaaS.

## Competitor analysis

| | **TeleCRM** | **Sell.Do** | **Callyzer** |
|---|---|---|---|
| Position | Generic SMB telecalling incumbent | Enterprise real-estate CRM | Lightweight call-tracking utility |
| Core | Cloud click-to-call, lead assignment, follow-ups, statuses | Inventory mgmt, ad-spend ROI, multi-level lead routing | SIM call tracking, team monitoring, duration analytics |
| Telephony | Cloud telephony | Expensive cloud (Exotel/Knowlarity) | SIM-based |
| WhatsApp | Bulk blasts + drip (automation-first) | Complex, web-based | None |
| AI | None/minimal | Basic lead scoring | None |
| UI/UX | Cluttered legacy web | Dense, table-heavy, steep learning curve | Basic, shallow |
| **Key weakness** | Chatting forces reps out to WhatsApp Web | High onboarding friction; desktop-first | No CRM depth (no WA/AI/scoring) |

## Our wedge (how we beat all three)
1. **Telephony:** natively intercept + log Android **SIM calls** (like Callyzer) but feed a full CRM (like Sell.Do/TeleCRM) — **bypassing expensive cloud telephony entirely**.
2. **UI/UX:** "Pro Max" glassmorphism design system — premium iOS-consumer feel, mobile-first.
3. **WhatsApp:** focus on a clean **2-way unified inbox**, not spammy bulk blasts (TeleCRM's trap).
4. **AI-native:** call summaries, auto-disposition, lead scoring + next-best-action, manager coach, in-app assistant — all on a free Groq tier.

## Architectural record — recent merges (accurate PR attribution)

- **PR #80 — Real-time WhatsApp Unified Inbox (Antigravity).** Split-pane chat (`WhatsAppInbox.tsx`) inside the Next.js admin, on top of the Meta Cloud API webhook + `whatsapp_messages` backend.
- **PR #81 — Security hardening, part 1 (Claude Code; migration `0027`).** Caught that `whatsapp_messages` was never in the `supabase_realtime` publication, so the "realtime" inbox received **zero live events** — fixed by adding it to the publication + `replica identity full`. Confirmed **RLS is enforced on `postgres_changes`** (no cross-tenant leak via the realtime channel). Added a **unique index on `wa_message_id`** + webhook upsert `ignoreDuplicates` for **idempotency** against Meta's delivery retries.
- **PR #82 — Android SIM call-log reconciliation (Antigravity).** Safety net for OEMs (MIUI/ColorOS) that kill foreground services and silently drop call logs: `READ_CALL_LOG` permission, `CallLogSyncWorker` (WorkManager) that reads the native `CallLog.Calls` provider, filters outgoing calls to CRM contacts, diffs against Supabase `call_logs`, and backfills gaps; plus a startup prompt to disable battery optimization.
- **PR #84 — Hardened call-log dedup, greedy bipartite matching (Antigravity).** The original reconciliation used a fuzzy 60s window that could swallow valid back-to-back calls to the same number (call → no answer → immediate redial). Replaced with greedy 1-to-1 matching: native calls processed chronologically (oldest first), each matched to the closest *unmatched* Supabase log within 120s (`matchedSupabaseIds` set). Exact tracking — no double-inserts, no dropped repeat calls. (Resolves the dedup watch-item below.)

- **PR #85 / #87 — Secrets → Supabase Vault (Claude Code).** WhatsApp + Facebook access tokens moved out of plaintext DB columns into Vault; plaintext columns dropped; `set_*_token` (admin-checked) / `get_*_token` (service-role-only) RPCs. Also found + fixed deploy drift: migration 0024 and `facebook-webhook` were committed but never deployed → FB lead capture had been fully dead.
- **PR #88 / #89 — Inbound lead-capture engine + welcome template (Claude Code).** Public token-gated `lead-capture` function: any website form/ad POSTs a lead → deduped → assigned to default rep → optional instant WhatsApp **welcome template**. Admin "🪝 Lead Capture" page for the URL/token/default-rep/template. Plus a clean multi-tenant **RLS audit** (passed) and the `docs/TESTING_CHECKLIST.md`.

> Note: the briefing labeled the Android reconciliation as "PR #81" — it was actually **#82**. #81 was the realtime/idempotency hardening.

## Launch roadmap (security-first, agreed split)
- **Claude (backend):** [in progress] secrets → Supabase **Vault** (`whatsapp_integrations.access_token`, `facebook_leads.page_access_token`); full **multi-tenant RLS audit**; then generic **`/webhooks/capture`** inbound-lead route + **welcome-template** plumbing (needs Meta-approved templates — business-initiated messages can't be free text).
- **Antigravity (frontend/Android):** keep hardening the foreground-service + reconciliation loop; UI/UX.

## Known follow-ups / watch-items
- ~~**Secrets stored plaintext** in DB~~ → DONE: WhatsApp (PR #85) + Facebook (PR #87) tokens moved to Supabase Vault; plaintext columns dropped; service-role-only reader RPCs.
- ~~**CallLog reconciliation dedupe is approximate**~~ → DONE in PR #84 (greedy bipartite 1-to-1 matching, 120s window).
- **Shared `GROQ_API_KEY`** across tenants — noisy-neighbor rate limits at scale.
- **WhatsApp business-initiated messaging** requires approved templates; only one bounded "welcome" automation pre-launch — no drip/bulk (protects Meta quality rating).
