# Baileys worker — founder notifications only

A small always-on service that holds one logged-in WhatsApp account open so
Call Pro AI can push a founder's Daily Pulse to their phone.

## Why it is not an edge function

Baileys speaks the WhatsApp Web protocol: a live WebSocket, a Signal session and
rolling keys, all held in memory and only valid while the connection stays up.
Supabase edge functions are Deno and end with the request; Vercel is serverless.
Neither can hold a socket between two calls. This needs a process that stays
running — Railway, Render, Fly, or a $5 VPS.

## What it is for

**For:** the founder's own daily report, to the founder's own phone.

**Not for:** anything a customer sees. Baileys is an unofficial client; WhatsApp's
terms do not permit it and accounts get banned. Losing an internal reporting
number is an annoyance — losing the number your leads reply to is losing the
business. The CRM's customer-facing senders deliberately ignore the provider
setting so this can never happen by accident.

## Deploy

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
| `/status` | GET | `{ status, number, last_seen, error }` — `disconnected` \| `connecting` \| `qr` \| `connected`. |
| `/qr` | GET | Current QR as a data URL, or `null` when there isn't one to show. |
| `/send` | POST | `{ to, text }`. `to` is digits with country code, no `+`. Returns **503** when not connected, so the CRM queues and retries instead of claiming a success. |
| `/reconnect` | POST | Force a fresh connection attempt. |

## Operating notes

- **The QR expires in seconds.** The page re-polls; that is normal.
- **`logged out` needs a human.** When WhatsApp ends the session the worker stops
  retrying on purpose — reconnecting with dead credentials forever is the exact
  pattern that gets a number banned. Scan again.
- **Reconnects back off** from 2s to 5 minutes for the same reason.
- **The account is kept "offline"** (`markOnlineOnConnect: false`) so the
  founder's phone still shows a notification for these messages.
