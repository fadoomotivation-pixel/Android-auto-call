# Configuration & Health — single source of truth

> Why this file exists: in June 2026 the entire call-recording + AI-summary pipeline was
> dead in production for months because **two secrets were never set** on Supabase, and
> nothing surfaced it. This file lists every secret each surface needs and gives copy-paste
> **health-check queries** so a missing/expired secret is caught in seconds, not months.

## The rule

**A feature is not "done" until it is verified end-to-end against the live Supabase
project, with the evidence written down.** Breadth without verification is how a 35-migration
product ends up with its core loop silently broken.

---

## Required secrets by surface

### Supabase → Edge Functions → Secrets
| Secret | Used by | If missing |
|---|---|---|
| `GOOGLE_CLIENT_ID` | `recording-upload`, admin OAuth | **Drive uploads fail → no recordings → no summaries** (the June 2026 outage) |
| `GOOGLE_CLIENT_SECRET` | `recording-upload`, admin OAuth | same as above |
| `GROQ_API_KEY` | `recording-upload`, `call-summary`, `lead-insights`, `manager-digest`, `assistant-chat` | No transcripts / summaries / AI scoring |
| `CRON_SECRET` | scheduled jobs (manager digest, auto punch-out) | Cron-triggered functions reject calls |
| `PRUNE_SECRET` | `recording-prune` | Old-recording cleanup can't run |

> `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected
> automatically by the Edge runtime — do **not** set them manually.

Set via CLI:
```
supabase secrets set GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… GROQ_API_KEY=… \
  CRON_SECRET=… PRUNE_SECRET=… --project-ref rqgkzamuohdvttnkluzn
```
…or Dashboard → Project Settings → Edge Functions → Secrets.

### Vercel (admin web) → Environment Variables
| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only |
| `GOOGLE_CLIENT_ID` | **must match the value set in Supabase** (same OAuth app) |
| `GOOGLE_CLIENT_SECRET` | **must match the value set in Supabase** |

> Critical: the admin completes the Google OAuth flow and stores the refresh token; the
> Supabase function later exchanges it. If the two surfaces use **different** Google
> credentials, refresh fails. Keep them identical.

---

## Health checks (run against the live DB)

**1. Is the recording → summary pipeline alive?**
```sql
select
  count(*)                                                          as calls,
  count(*) filter (where recording_status = 'ready')               as recordings_ok,
  count(*) filter (where recording_status = 'failed')              as recordings_failed,
  count(*) filter (where summary_status   = 'ready')               as summaries_ok,
  count(*) filter (where recording_error is not null)              as with_error
from call_logs
where created_at > now() - interval '7 days';
```
Healthy = `recordings_ok` and `summaries_ok` climb over time. If `recordings_failed > 0`,
read the reason:

**2. Why did recordings fail? (no more guessing — `recording_error` is populated)**
```sql
select recording_error, count(*) n
from call_logs
where recording_status = 'failed' and recording_error is not null
group by recording_error order by n desc;
```
A row saying *"GOOGLE_CLIENT_ID/SECRET not set …"* means the secrets above are missing.

**3. Is a Google Drive connected for every company that records?**
```sql
select c.name,
       (si.refresh_token is not null) as company_drive,
       (ps.refresh_token is not null) as platform_drive_fallback
from companies c
left join storage_integrations si on si.company_id = c.id
left join platform_storage ps on ps.id = true;
```
A company with neither its own Drive nor the platform fallback **cannot** store recordings.

---

## After any deploy — 60-second smoke test

1. Make one **cloud (SIP) call** from the app, talk ~20s, hang up.
2. Run health-check **#1**: the call should reach `recording_status = 'ready'` then
   `summary_status = 'ready'` within ~1–2 min.
3. If `failed`, run health-check **#2** and fix what the `recording_error` says.

(For the full human walkthrough, see `TESTING_CHECKLIST.md`.)
