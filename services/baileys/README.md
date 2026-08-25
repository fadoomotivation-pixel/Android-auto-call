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
rep's family, friends and salary conversations never reach the database. Only
300 characters of body are kept, because an admin needs to see that details went
out, not to read a rep's chats. That filter lives server-side on purpose: it
must not be something a worker can be reconfigured to skip.

### Observer environment

| Variable | Meaning |
| --- | --- |
| `INGEST_URL` | `https://<project>.supabase.co/functions/v1/whatsapp-observe` |
| `BAILEYS_INGEST_SECRET` | shared bearer, same value as the edge function's |
| `FLUSH_MS` | batch interval, default 15000 |

Set once, for the whole worker. Without them a telecaller session still connects
but has nowhere to report; it queues and warns rather than dropping messages on
the floor.

`OBSERVE_SALESPERSON_ID` is **gone.** It was the old one-process-one-rep switch,
and while it existed the only worker address an admin could type into the CRM
was the founder's — which is how a founder's WhatsApp ends up being watched
under a rep's name.

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
   - `AUTH_DIR` — set to a path **inside the app directory**, e.g.
     `/home/<user>/domains/<domain>/baileys-auth`. Do not use `/tmp`.
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
   | `AUTH_DIR` | recommended | Defaults to `/data/auth` in the image. |
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
