# Call Pro AI — project memory

AI calling CRM for Indian real-estate telecaller teams. Android app (Kotlin/Compose)
+ Next.js admin at callproai.in (`admin/`, deployed on Vercel) + Supabase
(project `rqgkzamuohdvttnkluzn`: Postgres, edge functions in `supabase/functions/`,
migrations in `supabase/migrations/`).

## Non-negotiable rules

### Super admin = ALL companies, equally
- `ankitguitarmonk@gmail.com` is the **platform super admin** (row in
  `platform_admins`) — the owner of the whole platform, **not** merely the admin
  of the "ankit" company. The "ankit" company is only the HQ tenant their
  profile happens to sit in.
- **Every** web feature must treat the super admin as cross-company: an
  all-companies view and/or a company picker (`?company=` param or in-page
  select). NEVER silently pin a super-admin page, query, or default to
  `profiles.company_id` — that biases everything to "ankit" and hides the other
  tenants.
- Reference implementations: `admin/app/dashboard/leads/` (scopeCompany +
  companyFilter + in-modal import picker), `admin/app/dashboard/platform/hq/`.

### Company isolation
- Company-scoped rows (contacts, call_logs, telecallers, knowledge, tokens…)
  must NEVER leak across companies. Only the super admin sees/acts
  cross-company; a regular admin stays inside their own company always.
- A lead must never end up owned by one company while assigned to another
  company's rep.

### Secrets
- Never commit secrets/tokens. Meta/CAPI tokens live in Supabase Vault
  (per-company `capi_token_secret_id` / `page_access_token_secret_id`).

## Operational notes
- **Floating AI Coach brain** (`rep-coach` fn): returns `{coaching, brief, tip}`
  and a `mode:"ask"` two-way Q&A (rep asks anything → grounded answer, saved to
  `coach_qa`). Daily `tip` cached in `coach_briefs` slot `'tip'`. The **shared
  winning brain** = `win-harvest` fn: when a lead reaches site_visit/booking it
  distils "what worked" into a **company-scoped** `knowledge_chunks` row
  (`source_kind='win'`, idempotent `source_id='win:<contact>'`), so
  `match_knowledge` teaches every rep in that company. Cron `win-harvest-2h`.
  Guidebooks: admin RAG page → `knowledge-ingest` (scope `global` = all
  companies, super-admin only; `source_kind='guide'`). ALL of it shares the ONE
  `match_knowledge` brain — never build a parallel retrieval store.
- **Facebook = ONE central business** (gokul, act 1254913623362544) advertising for
  MANY companies. Leads route to the right company by **form**
  (`facebook_lead_routes`, super-admin maps them on the Facebook page UI). Meta's
  webhook PUSH is unreliable (app Dev-mode delivers only test leads), so
  `facebook-poll` PULLS leads via Graph API on a 10-min cron (migration 0090) —
  it imports ONLY mapped forms, deduped, recent-window only. There is also an
  **Ad Manager built inside the CRM** — don't duplicate it.
- GitHub scheduled/dispatch workflows fire only from the repo's **default
  branch**, which is `claude/sales-app-auto-call-logging-Bb7e6` (NOT main).
  `amr-transcode.yml` must exist there; canonical copy lives on main.
- Admin timestamps must render IST: `toLocaleString("en-IN", { timeZone:
  "Asia/Kolkata" })` — but never pass `timeZone` to a NUMBER's
  `toLocaleString` (Intl.NumberFormat rejects it and the Vercel build fails).
- Some phones record SIM calls as `.amr` — not playable/transcribable. The
  amr-convert edge function + amr-transcode workflow convert AMR→MP3 (state
  tracked via `call_logs.summary_status`; `call_logs` has NO `extra` column).
- Two AIs (Claude Code + Antigravity) share this tree — see
  `docs/AI_COLLAB_RULES.md` and `docs/AGENT_SYNC.md` before big changes.
