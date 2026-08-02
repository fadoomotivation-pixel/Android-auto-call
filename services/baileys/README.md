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
