# Baileys worker — founder notifications, and read-only rep observation

A small always-on service that holds one logged-in WhatsApp account open so
Call Pro AI can push a founder's Daily Pulse to their phone.

## Why it is not an edge function

Baileys speaks the WhatsApp Web protocol: a live WebSocket, a Signal session and
rolling keys, all held in memory and only valid while the connection stays up.
Supabase edge functions are Deno and end with the request; Vercel is serverless.
Neither can hold a socket between two calls. This needs a process that stays
running — Railway, Render, Fly, or a $5 VPS.

## What it is for

**One worker, many logins.** It holds a map of sessions: the founder's, and one
per telecaller. There is no "mode" env var any more — what a session may do is
decided by **which path started it**, so it cannot be misconfigured.

| Path | Whose session | May send? |
| --- | --- | --- |
| `/status` `/qr` `/reconnect` `/send` | the founder's | yes |
| `/s/<salesperson_id>/status` `/qr` `/reconnect` | one telecaller | **no — `/s/…/send` returns 403** |
| `/sessions` | every login at a glance | — |

Each session has its own auth directory: the founder keeps `$AUTH_DIR` itself —
deliberately, so an already-scanned founder login survives this change without a
rescan — and each telecaller gets `$AUTH_DIR/rep-<salesperson_id>`. One number
being logged out or banned cannot touch another. Telecaller sessions start
lazily, on the first request for that path.

### notify (the founder's session)

**For:** the founder's own daily report, to the founder's own phone. One
internal number, one recipient, one message a day.

**Never sends to a customer.** The CRM's customer-facing senders deliberately
ignore the provider setting so this cannot happen by accident.

### observe (any `/s/<salesperson_id>` session)

A telecaller's own WhatsApp, watched as a linked device. It **never sends** —
`/s/…/send` returns 403 — and the rep goes on messaging buyers by hand
from their own phone exactly as before. All this does is write down what
happened, so the admin's Daily Pulse stops pretending WhatsApp work does not
exist and "how many leads got the plot details" has an answer.

**The risk, stated plainly.** Baileys is an unofficial client and WhatsApp bans
accounts for it. In observe mode that risk now sits on numbers your buyers reply
to, not just an internal one. This was a deliberate call by the founder, made
with the trade-off understood. Two things make it the smaller half of the bet:
there is no automated sending from a rep's number — the pattern WhatsApp bans
fastest — and each rep has a separate session with a separate auth directory, so
one ban cannot take the floor down.

**What is never stored.** The CRM drops any message whose other party is not a
lead in that rep's own company — see `match_wa_contact` in migration 0167. A
rep's family, friends and salary conversations never reach the database. That
filter lives server-side on purpose: it must not be something a worker can be
reconfigured to skip.

**What IS stored, in full.** Lead conversations are kept whole, message by
message, and shown on that lead in the CRM. This was a 300-character preview
until migration 0170; the founder decided the company should be able to read
the thread with its own buyers, which is what every CRM does with a customer
email trail. Say this to the rep in plain words before they scan — they are
entitled to know that a conversation with a lead is company property and a
conversation with anyone else is not recorded at all.

### Observer environment

| Variable | Meaning |
| --- | --- |
| `INGEST_URL` | `https://<project>.supabase.co/functions/v1/whatsapp-observe` |
| `BAILEYS_INGEST_SECRET` | shared bearer, same value as the edge function's |
| `FLUSH_MS` | batch interval, default 15000 |

Set once, for the whole worker. Without them a telecaller session still connects
but has nowhere to report; it queues and warns rather than dropping messages on
the floor.

### What the observer captures — every one is a switch

This worker is uploaded by hand, so "turn that back off" must never mean
building a new zip and re-linking a rep. Each capability below is an
environment variable: set it and restart, no redeploy.

| Variable | Default | What it does |
| --- | --- | --- |
| `CAPTURE_MEDIA` | **on** | Downloads voice notes, photos and documents instead of only naming them. Only ever stored for a **known lead** — an unmatched number keeps its counts and nothing else. |
| `MAX_MEDIA_BYTES` | `8388608` | Files past this are named but not fetched, so one long video cannot stall a history import. |
| `MAX_MEDIA_IN_FLIGHT` | `3` | Concurrent downloads. A history sync degrades to text-only rather than opening thousands of fetches at WhatsApp's CDN from a freshly-linked number. |
| `WATCH_EDITS` | **on** | Notices "delete for everyone" and edits, and keeps what the message originally said. Cheap, and the clearest signal a super admin gets. |
| `SYNC_CONTACTS` | **on** | Learns WhatsApp's display names, which is usually the only clue who an unknown number is. Names only — matching stays phone-number-only. |
| `WATCH_GROUPS` | **off** | Group chats. Off because a broker group is dozens of people who never agreed to be recorded in someone's CRM, and the volume is large. |
| `WATCH_PRESENCE` | **off** | Online/typing state of leads, for "ring them while they are holding the phone". Off because it is the only capability here that *talks to* WhatsApp rather than listening, and per-chat subscriptions from a new device are the shape of traffic that gets a number looked at. |

**Media needs the CRM side too.** The worker holds no Supabase key on purpose —
it hands files to `whatsapp-observe` as base64 and that function uploads them to
the private `wa-media` bucket. Deploy the edge function **before or with** this
worker; an older one ignores the new fields, so nothing breaks, media simply
does not appear.

`OBSERVE_SALESPERSON_ID` is **gone.** It was the old one-process-one-rep switch,
and while it existed the only worker address an admin could type into the CRM
was the founder's — which is how a founder's WhatsApp ends up being watched
under a rep's name.

## STOP UPLOADING ZIPS — connect the app to GitHub instead

The live worker is a **"Deployment from source files"**: someone uploads a zip by
hand, and Hostinger's Redeploy button only ever re-runs *that same zip*. Every
fix to this file has therefore needed a manual upload, and twice the symptom of
a stale worker was mistaken for a bug in the CRM.

Hostinger can deploy this directory straight from the repository. Do it once and
the problem is gone permanently:

1. **hPanel → the site → Deployments → new deployment from GitHub** (rather than
   from source files), pointing at this repo.
2. **Application root: `services/baileys`.** This repo is the whole product; the
   worker is one directory in it.
3. Node 20+, entry point `app.js` or `npm start`.
4. Leave the environment variables exactly as they are — they belong to the app,
   not the deployment, and survive the switch.
5. `AUTH_DIR` stays **unset**. See the warning below: setting it now would
   abandon the logged-in sessions.

Until that switch happens, every worker change means a fresh zip. Which build is
actually running is answerable without guessing:

```
curl https://<worker>/health
# {"ok":true,"sessions":2,"worker_version":"2026.08.26-4"}
```

If `worker_version` is not what the repo says, the box is behind and no amount
of debugging the CRM will explain the behaviour.

## Deploy on Hostinger (what we actually use)

Hostinger's **Web Apps** run a real long-lived Node process on a real
filesystem, which is exactly what this needs — and better than most container
hosts, where the session has to be kept on a separately mounted volume or it is
wiped on every deploy. Here the WhatsApp login survives a restart on its own.

1. **hPanel → Websites → Add website → Deploy Web App**, from this GitHub repo.
2. Set the **application root** to `services/baileys` — this repo is the whole
   product, and the worker is one directory inside it.
3. **Node 20 or newer.** Baileys uses modern crypto APIs and will not start on 18.
4. Entry point: `app.js` (already here) or `npm start` — both land in the same place.
5. Environment:
   - `BAILEYS_SECRET` — a long random string. The service refuses to start
     without one, because the worker's URL is public and an unprotected `/send`
     is a "send WhatsApp as this company" button.
   - `AUTH_DIR` — **only on a brand-new worker.** Set it to a path inside the
     app directory, e.g. `/home/<user>/domains/<domain>/baileys-auth`. Never
     `/tmp`. **On a worker that is already logged in, do not add it and do not
     change it** — unset, it defaults to `./auth`, which is where the existing
     session lives. Pointing it somewhere new means an empty folder and a
     needless QR rescan, and it is not obvious that is what happened.
   - `PORT` — leave it alone; Hostinger sets it and the server reads it.
6. Note the app's URL (e.g. `https://something.hostingersite.com`) — that is the
   worker address you paste into Call Pro AI.

Then: **Dashboard → WhatsApp → Founder notifications → Baileys (Experimental)**,
paste the URL and the same secret, Save, and scan the QR.

Two Hostinger-specific things to watch:

- **Shared plans can idle a process out.** If the app sleeps, the WhatsApp
  socket drops and reconnects when it wakes; the outbox holds the report and
  retries every five minutes, so a sleeping worker delays the pulse rather than
  losing it. `/health` exists to be pinged if you want to keep it warm.
- **Outbound is over wss:443**, the same port a browser uses, so the usual
  shared-hosting port restrictions do not apply.

## Deploy anywhere else

1. Point your host at this directory (it has a Dockerfile).
2. Set the environment:

   | Variable | Required | Notes |
   |---|---|---|
   | `BAILEYS_SECRET` | yes | Long random string. The service refuses to start without it — an open `/send` is a "send WhatsApp as this company" button. |
   | `AUTH_DIR` | recommended | Defaults to `/data/auth` in the image, `./auth` outside it. Set it once, on first deploy. Changing it later abandons the logged-in session and forces a rescan. |
   | `PORT` | no | Defaults to 8080. |

3. **Mount a persistent volume at `/data`.** Without one the session is wiped on
   every deploy and the founder has to rescan the QR each time.

4. In Call Pro AI: **Dashboard → WhatsApp → Provider → Baileys (Experimental)**,
   paste the service URL and the same secret, then scan the QR that appears.

## API

Everything except `/health` needs `Authorization: Bearer $BAILEYS_SECRET`.

| Route | Method | Purpose |
|---|---|---|
| `/health` | GET | Liveness for the platform. Unauthenticated, reveals nothing. |
| `/status` | GET | Founder session: `{ status, number, last_seen, error }` — `disconnected` \| `connecting` \| `qr` \| `connected`. |
| `/qr` | GET | Founder QR as a data URL, or `null` when there isn't one to show. |
| `/send` | POST | Founder only. `{ to, text }`; `to` is digits with country code, no `+`. Returns **503** when not connected, so the CRM queues and retries instead of claiming a success. |
| `/reconnect` | POST | Force a fresh connection attempt on the founder session. |
| `/sessions` | GET | Status of every live session. |
| `/s/<id>/status` | GET | One telecaller's session, same shape as `/status`. |
| `/s/<id>/qr` | GET | A scannable **HTML page** by default, so a rep can just open the link; `?format=json` for the dashboard. Starts the session if it isn't running. |
| `/s/<id>/reconnect` | POST | Start or restart that telecaller's session. |
| `/s/<id>/send` | any | Always **403**. A telecaller's number sends by hand, from their own phone. |

The bearer normally goes in `Authorization`. For the HTML QR page only, it may
arrive as `?k=<secret>` — a rep opening a link on a phone cannot set a header.
That query form unlocks nothing else, and never `/send`.

## Operating notes

- **The QR expires in seconds.** The page re-polls; that is normal.
- **`logged out` needs a human.** When WhatsApp ends the session the worker stops
  retrying on purpose — reconnecting with dead credentials forever is the exact
  pattern that gets a number banned. Scan again.
- **Reconnects back off** from 2s to 5 minutes for the same reason.
- **The account is kept "offline"** (`markOnlineOnConnect: false`) so the
  founder's phone still shows a notification for these messages.
