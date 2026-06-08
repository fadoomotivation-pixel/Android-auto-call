# SalesAutoCall — Admin Dashboard

Next.js (App Router) + Supabase. Lets a company admin/owner sign in and see
**what data is stored on the cloud**: salespeople, their productivity, the
imported contact lists, and every call log.

## Run locally

```bash
cd admin
cp .env.example .env.local      # already points at the SalesAutoCall project
npm install
npm run dev
# open http://localhost:3000
```

First time: click **"Create one"** on the login screen to register your company
and become its admin. Salespeople create their accounts in the Android app and
an admin links them to the company.

## Deploy to Vercel

1. Import this repo into Vercel and set the **Root Directory** to `admin/`.
2. Add the two env vars from `.env.example`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
3. Deploy.

## How auth & access works

- Auth is Supabase email/password. The session is kept in cookies via
  `@supabase/ssr` and refreshed in `middleware.ts`.
- **Row-Level Security** does the real enforcement: an admin only ever sees
  rows belonging to their own `company_id`. The dashboard never uses the
  service-role key, so even the browser bundle can't leak other companies' data.

## Pages

| Route | Shows |
|-------|-------|
| `/dashboard` | KPI cards: salespeople, contacts, calls, total talk time |
| `/dashboard/salespeople` | Per-person productivity (from `v_salesperson_stats`) |
| `/dashboard/contacts` | Imported contact lists + status |
| `/dashboard/calls` | Full call history with outcome, duration, SIM slot |
