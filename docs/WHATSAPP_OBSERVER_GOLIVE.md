# Rep WhatsApp observer — what is live, and the four things left

Merging to `main` ships the Android app and the admin site. It does **not** ship
Supabase edge functions: those deploy on their own, and nothing in CI does it.
That is why a feature can be merged, green, and still not exist in production.

## Already done

| | |
| --- | --- |
| Migration `0167` | `wa_rep_sessions`, `wa_observed_messages`, `match_wa_contact`, RLS, views — **applied** |
| Migration `0168` | `media_kind`, `'whatsapp'` activity type, breakdown columns — **applied** |
| Android | WhatsApp shows on the lead Journey with 💬 — merged, publishes from `main` |
| Admin | **WhatsApp → 📱 Telecaller WhatsApp** card — merged, Vercel deploys from `main` |

Both tables are empty and nothing writes to them yet. The feature is inert until
step 2 below.

## 1. Deploy the edge functions

Supabase Dashboard → Edge Functions, or `supabase functions deploy` from a
machine with the CLI.

| Function | Why | `verify_jwt` |
| --- | --- | --- |
| `whatsapp-observe` | **new** — the ingest endpoint | **OFF** |
| `pulse-broadcast` | imports the changed `_shared/pulse.ts` | leave as is |
| `founder-alerts` | imports the changed `_shared/pulse.ts` | leave as is |
| `team-pulse` | imports the changed `_shared/pulse.ts` | leave as is |

`verify_jwt` **must be off** for `whatsapp-observe`: the caller is a Node worker
on a VPS holding a shared bearer, not a signed-in user. The function refuses to
start without `BAILEYS_INGEST_SECRET` and compares the bearer in constant time,
so turning JWT off does not leave it open — but forgetting the secret does.

The three pulse functions are redeploys of unchanged files whose **shared
import** changed. Skip them and the report keeps building without the WhatsApp
line, silently — no error, just a missing line, which is the hardest kind of
half-deploy to notice.

## 2. Set the secret

Supabase → Project Settings → Edge Functions → Secrets:

```
BAILEYS_INGEST_SECRET = <a long random string>
```

The same value goes on every worker. Rotating it means rotating both sides.

## 3. One worker, one rep

Start with **one telecaller for a week.** If that number survives, add the rest.
One process per rep, each with its own `AUTH_DIR` — a shared session directory
means one ban takes the floor down.

```
OBSERVE_SALESPERSON_ID = <profiles.id of that rep>
INGEST_URL             = https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/whatsapp-observe
BAILEYS_INGEST_SECRET  = <same value as step 2>
AUTH_DIR               = /home/<user>/baileys-auth-<rep>
BAILEYS_SECRET         = <the worker's own bearer, as before>
```

Setting `OBSERVE_SALESPERSON_ID` puts the worker in observe mode: `/send`
returns 403, and it only listens. The worker refuses to start in this mode
without `INGEST_URL` and `BAILEYS_INGEST_SECRET`.

## 4. Add the rep in the dashboard

**Dashboard → WhatsApp → 📱 Telecaller WhatsApp → Add a telecaller.** Pick the
name, paste the worker address, save. Then open the worker's address and have
the rep scan the QR from their own WhatsApp.

Tell them first, in plain words: only messages with **this company's leads** are
saved. Family, friends and anything personal are dropped before they reach the
CRM, by `match_wa_contact` on the server. That is true, it is enforced
server-side rather than promised, and a rep is entitled to hear it before they
scan anything.

## Checking it works

```sql
-- Is the worker reporting? stale = nothing heard for two hours.
select rep, status, last_seen_at, stale from public.v_rep_whatsapp_health;

-- Today, per rep.
select * from public.v_rep_whatsapp_daily
where day_ist = (now() at time zone 'Asia/Kolkata')::date;
```

`stale` is the one to watch. A watcher that died at 11am reads exactly like a
rep who sent nothing, and only one of those is the rep's fault.

## The two numbers worth reading

`leads_given_details` and `leads_who_replied`.

Everything else can be inflated by sending more. Details needs an actual PDF,
image, video or link — a voice note deliberately does not count, or the metric
would reward the easiest thing a telecaller can do. Replies need the **buyer**
to act, which is why that column is the honest one.

## The risk, on the record

Baileys is an unofficial WhatsApp client and accounts get banned for it. In
observe mode that risk sits on numbers your buyers reply to. This was a
deliberate decision by the founder with the trade-off understood. Two things
make it the smaller half of the bet: there is no automated sending — the pattern
WhatsApp bans fastest — and one process per rep means one ban cannot take the
whole floor down.

Start with one number. Give it a week.
