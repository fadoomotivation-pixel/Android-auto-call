# Rep WhatsApp observer — what is live, and what is left

**Correction to an earlier version of this file.** It said merging to `main` does
not deploy edge functions. It does. `.github/workflows/supabase-deploy.yml` runs
`supabase functions deploy` on every push to `main` that touches
`supabase/functions/**` or `supabase/config.toml`, and it deploys **all**
functions, not just the changed ones. The evidence is in the dashboard: every
function's `entrypoint_path` starts `file:///home/runner/work/…`, which is a
GitHub Actions runner, and they all share one `updated_at`.

So there is nothing to deploy by hand. **Merging is deploying.**

## Already done

| | |
| --- | --- |
| Migration `0167` | `wa_rep_sessions`, `wa_observed_messages`, `match_wa_contact`, RLS, views — **applied** |
| Migration `0168` | `media_kind`, `'whatsapp'` activity type, breakdown columns — **applied** |
| Android | WhatsApp shows on the lead Journey with 💬 — merged, publishes from `main` |
| Admin | **WhatsApp → 📱 Telecaller WhatsApp** card — merged, Vercel deploys from `main` |
| `whatsapp-observe` | deployed, `verify_jwt = false`, refuses to boot without its secret |
| `_shared/pulse.ts` | the WhatsApp counts deployed with PR #435; the **stale-watcher** half ships with this PR |

Both tables are empty and nothing writes to them yet. The feature is inert until
a real telecaller scans a QR.

## 1. The deploy, and the one thing that could have broken it

`whatsapp-observe` was deployed by hand and therefore did **not** have an entry
in `supabase/config.toml`. The CLI reads that file and defaults anything missing
to `verify_jwt = true`, so the very next merge to `main` would have switched JWT
verification back on and the worker — which holds a shared bearer, not a JWT —
would have started getting `401` on every batch. Nothing would have errored: the
ingest would just have gone quiet, the dashboard would have read "Stale", and
nobody would have connected it to a deploy.

The entry is added in this PR, and the workflow's smoke test now includes
`whatsapp-observe`, so a version that cannot boot fails the deploy instead of
going live broken.

| Function | What changed | `verify_jwt` | Goes out |
| --- | --- | --- | --- |
| `whatsapp-observe` | the ingest endpoint | **false** | already live; config entry added so it stays false |
| `notify-provider` | `rep_status` / `rep_qr` / `rep_reconnect` | false | on merge |
| `pulse-broadcast` | the stale-watcher half of `_shared/pulse.ts` | false | on merge |
| `founder-alerts` | same shared import | false | on merge |
| `team-pulse` | same shared import | true (unchanged) | on merge |

`verify_jwt` **must be false** for `whatsapp-observe`: the caller is a Node
worker holding a shared bearer, not a signed-in user. The function compares that
bearer in constant time, so turning JWT off does not leave it open.

Without `BAILEYS_INGEST_SECRET` it answers **503 `ingest secret not
configured`** — deliberately a different code from the 401 a wrong bearer gets,
so the two are told apart at a glance. It does not refuse to boot, which means
a missing secret is quiet: the worker just queues. That is what the backlog
warning below is for.

The pulse functions are redeploys of unchanged files whose **shared import**
changed. The workflow deploys everything on every run precisely so that this
cannot be got wrong by hand: skip one and the report keeps building without the
WhatsApp line, no error, just a missing line — the hardest kind of half-deploy
to notice.

## 2. Set the secret

Supabase → Project Settings → Edge Functions → Secrets:

```
BAILEYS_INGEST_SECRET = <a long random string>
```

The same value goes on the worker. Rotating it means rotating both sides.

**This is the step that fails quietly**, so the CRM now tells you. The worker
holds anything it could not deliver and retries; a mismatched or missing secret
therefore looks exactly like health — WhatsApp connected, no error, zero
messages. The Telecaller WhatsApp card asks the worker for its queue depth when
it opens, and a backlog is written into the rep's row as:

> *N messages waiting — the CRM is not accepting this worker's reports. Check
> `BAILEYS_INGEST_SECRET` matches on both sides.*

If you see that line, the two sides disagree. Nothing is lost while it says so;
the worker is still holding the messages.

## 3. One worker, every login

There is **one** worker — the founder's, already running at
`https://pink-worm-375262.hostingersite.com`. It is no longer one process per
number. It holds a map of sessions and a telecaller is a **path** on it:

| Path | Whose | Can send? |
| --- | --- | --- |
| `/status` `/qr` `/reconnect` `/send` | the founder's, exactly as before | yes |
| `/s/<salesperson_id>/status` `/qr` `/reconnect` | one telecaller, watch-only | **no — 403** |
| `/sessions` `/health` | every login at a glance | — |

Each session gets its own auth directory — the founder keeps `$AUTH_DIR` itself
so the login already scanned there survives this change untouched, and each rep
gets `$AUTH_DIR/rep-<salesperson_id>`. One rep being logged out or banned cannot
reach the founder's session or anyone else's. `/s/…/send` refuses at the door
rather than leaving it to whoever wires the CRM up next.

**Nothing to rescan.** Deploying this does not disturb the founder's WhatsApp:
same address, same routes, same auth directory.

Environment on that one worker:

```
INGEST_URL            = https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/whatsapp-observe
BAILEYS_INGEST_SECRET = <same value as step 2>
AUTH_DIR              = /home/<user>/baileys-auth
BAILEYS_SECRET        = <the worker's own bearer, as before>
```

`OBSERVE_SALESPERSON_ID` is **gone.** It was the old one-process-one-rep switch,
and while it existed the only address an admin could type was the founder's —
which is precisely how a founder's WhatsApp ends up being watched under a rep's
name. Telecaller sessions are now observe-only by virtue of *which path* started
them, which cannot be misconfigured.

Rep sessions start lazily: nothing runs for a telecaller until the dashboard
asks for their QR. Restarting the worker does not lose a scanned login — the
auth directory survives — but it does mean the sessions come back on first
touch, so the dashboard's **Show QR** is also the "wake it up" button.

## 4. Add the rep in the dashboard

**Dashboard → WhatsApp → 📱 Telecaller WhatsApp → Add a telecaller.** Pick the
name and save. That is the whole form — the QR opens by itself, fetched through
`notify-provider` so the worker's bearer never reaches the browser. Have the rep
scan it: WhatsApp → Settings → Linked devices → Link a device.

Adding telecaller #2 is the same two clicks. No new server, no new address, no
redeploy.

**One limit, stated rather than discovered.** The card needs *this company* to
have a Baileys worker of its own — the address in Founder notifications above.
A tenant borrowing the platform's shared number has no worker to hang a rep
session on, and the card says so instead of saving a row that could never
connect. Today that is the HQ tenant only, which is where the first telecaller
is going anyway.

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
make it the smaller half of the bet: there is no automated sending from a rep's
number — the pattern WhatsApp bans fastest — and one auth directory per rep
means one ban cannot take the whole floor down.

Start with one number. Give it a week.

## What "live" means, and what it does not

Not live until **one real telecaller** has scanned, messaged a real lead, and
the number has appeared in **both** the Daily Pulse and the admin card. Until
then this is a deployed pipe with nothing in it.

Everything up to that last leg can be rehearsed without a handset:
`docs/WHATSAPP_OBSERVER_ACCEPTANCE.sql` proves the counting rules, the privacy
gate, idempotency and the view, in one transaction that rolls back. It cannot
prove the handset leg, and it says so.
