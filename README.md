# SalesAutoCall

A sales productivity platform with three parts:

| Part | Tech | What it does |
|------|------|--------------|
| **`android/`** | Kotlin + Jetpack Compose | Salesperson app. Import contacts from **CSV/TSV**, **auto-dial sequentially through the SIM**, log every call, and sync to the cloud. |
| **`admin/`** | Next.js + Supabase | Web dashboard for admins/owners to see each company, its salespeople, contacts, call logs and productivity stats — i.e. *what data is stored on the cloud*. |
| **`supabase/`** | Postgres + RLS | Cloud backend. Multi-tenant schema: every company's data is isolated, salespeople see only their own assignments. |

## How it fits together

```
 ┌────────────────────┐        ┌──────────────────────┐
 │  Android app       │        │  Admin web dashboard │
 │  (salesperson)     │        │  (company admin)     │
 │  • import CSV/TSV  │        │  • view companies    │
 │  • auto SIM dialer │        │  • view salespeople  │
 │  • call logging    │        │  • view contacts     │
 └─────────┬──────────┘        │  • view call logs    │
           │                   │  • productivity KPIs │
           │                   └──────────┬───────────┘
           │   Supabase JS / supabase-kt  │
           ▼                              ▼
        ┌────────────────────────────────────┐
        │        Supabase (Postgres)         │
        │  companies · profiles · contacts   │
        │  import_batches · call_logs        │
        │  Row-Level Security per company    │
        └────────────────────────────────────┘
```

## Cloud project

A dedicated Supabase project (**SalesAutoCall**, isolated from any other data) backs this app.

- **Project URL:** `https://rqgkzamuohdvttnkluzn.supabase.co`
- **Anon / publishable key:** `sb_publishable_jbinu2H4JrpqAUp_3Prdpw_8pZzE58N`

> These keys are *public* by design (safe to ship in client apps). All access is gated by Row-Level Security. The **service-role** key is never committed and is only needed for server-side admin scripts.

## Data model (cloud)

- **companies** — one row per business/tenant.
- **profiles** — one per user, role = `admin` | `salesperson`, linked to a company.
- **import_batches** — record of each CSV/TSV upload (file name, row counts).
- **contacts** — the call list. Assigned to a salesperson, has a `status`.
- **call_logs** — every call: who, which contact, outcome, duration, SIM slot, timestamps.
- **v_salesperson_stats** — view powering the admin productivity KPIs.

See [`supabase/migrations/`](supabase/migrations) for the full schema and RLS policies.

## Getting started

1. **Backend** — already provisioned. To reproduce on a fresh project, run the SQL in `supabase/migrations/` in order (Supabase SQL editor or CLI).
2. **Admin dashboard** — see [`admin/README.md`](admin/README.md). `npm install && npm run dev`.
3. **Android app** — see [`android/README.md`](android/README.md). Open `android/` in Android Studio.

## ⚠️ Auto-dialing & Play Store note

Fully automated sequential dialing uses the `CALL_PHONE` permission and a foreground service that places the next call when the previous one ends (detected via call-state changes). This is powerful but:

- Some devices/OEMs restrict programmatic dialing.
- Google Play restricts apps that use the **default-dialer / call-log** permissions; an auto-dialer is typically distributed **outside Play (sideload / MDM / enterprise)** or must justify the permissions in review.
- Always get **prior consent** of the person being called and comply with local telemarketing / DND (Do-Not-Call) regulations.

The app marks contacts as `dnc` (do-not-call) and skips them.
