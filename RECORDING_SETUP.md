# Call recording — setup

Recordings are stored on **your own Google Drive** (one account per company), kept
for **30 days**, then auto-deleted. Telecallers can hear their own; admins can hear
and delete the whole company's.

You only need to do this once.

## 0. On each telecaller's phone: enable in-app calling (important!)

Android 10+ blocks call-audio capture for normal apps — that's why SIM
recordings used to come out empty or missing. The fix is built into the app:
make **Call Pro AI the phone's default calling app**.

1. Open the app → **Dialer** (or **Calls**) tab → tap the **"Turn on in-app
   calling"** banner → confirm **Call Pro AI** as the default phone app.
2. That's it. From now on every SIM call — auto-dial, keypad, or call-back from
   Recent Calls — runs on the app's own call screen (no jump to the system
   dialer) and recording starts automatically when the call connects.

This also enables the in-app screen for **incoming** calls, which are now
logged into call history too.

## 1. Create a Google OAuth client
1. Go to <https://console.cloud.google.com/> → create/select a project.
2. **APIs & Services → Library →** enable **Google Drive API**.
3. **APIs & Services → OAuth consent screen:** set it up (External is fine), add
   your Google account as a **Test user** (so it works before verification), and add
   the scope `.../auth/drive.file`.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID →
   Web application.**
   - **Authorized redirect URI:** `https://<your-admin-domain>/api/gdrive/callback`
     (e.g. `https://android-auto-call.vercel.app/api/gdrive/callback`).
   - Copy the **Client ID** and **Client secret**.

## 2. Set the credentials in two places
**Vercel** (admin dashboard) → Project → Settings → Environment Variables:
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```
Redeploy.

**Supabase** Edge Function secrets (Dashboard → Project → Edge Functions → Secrets,
or `supabase secrets set`):
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
PRUNE_SECRET=<any-random-string>     # protects the retention job
```

## 3. Connect Drive (in the dashboard)
Sign in as **super admin** → **Recording storage** → **Connect Google Drive** next to
a company → approve. A "SalesAutoCall Recordings" folder is created and the company is
ready. Repeat per company.

## 4. Turn recording on
It's **on by default**. Admins can toggle it per company on the **Recordings** page.

## 5. (Optional) schedule the 30-day cleanup
Run the prune function daily with pg_cron (Supabase SQL editor):
```sql
select cron.schedule(
  'recording-prune-daily', '0 3 * * *',
  $$ select net.http_post(
       url:='https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/recording-prune',
       headers:=jsonb_build_object('x-prune-secret','<PRUNE_SECRET>')
     ) $$
);
```

## Notes
- **Cloud (SIP) calls** record reliably (both sides) → WAV.
- **SIM auto-dial calls** record best-effort via the mic with the speaker forced on →
  M4A. Quality/availability is device-dependent; if a device can't, the call still
  logs, just without audio.
- Storage math and trade-offs: see the plan. At 30-day retention your 4 TB covers
  hundreds of agents.
