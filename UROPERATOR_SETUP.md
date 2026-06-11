# Cloud calling — UrOperator setup guide

This is the **one page** the UrOperator admin and the company admin need. No
Android knowledge required — everything is configured from the **web admin
dashboard** (`admin/`). The Android app picks up the settings automatically.

```
UrOperator (provisions)        SalesAutoCall admin web            Android app
─────────────────────────      ────────────────────────────      ──────────────
tenant + FS_ token       ──►   paste in Cloud calling page  ──►   📞 Cloud call
agents (extensions)      ──►   assign ext to each telecaller ──►  rings agent → customer
DIDs (phone numbers)     ──►   assign caller-ID per agent
```

---

## Part A — UrOperator admin (the phone-system side)

Do these in the **UrOperator dashboard** (`api.uroperator.com`). The app cannot
create these for you — agent creation requires an Admin JWT that only the
UrOperator dashboard has.

1. **Create the tenant** for this client (e.g. tenant id `9`, "Ankit-demo").
2. **Issue an API token** (`FS_…`) scoped to that tenant. Note its expiry.
3. **Create the agents** (SIP extensions, e.g. `1001`, `1002`) — one per
   telecaller. Each gets a SIP username + password.
4. **Provision the DIDs** (outbound caller-ID numbers, e.g. `+916272490051`).
5. Hand the company admin: **token**, **tenant id**, **SIP server + port**
   (default `sip.uroperator.com:6060`, UDP), the **agent extensions**, and the
   **DID numbers**.

> The token must be sent with header `X-API-Token: FS_…` (never
> `Authorization: Bearer`). The app does this for you.

The app talks to these UrOperator endpoints (all documented & live):

| Purpose | Endpoint |
|---|---|
| Health / token check | `GET /api/status`, `GET /api/token/info` |
| Agent SIP credentials | `GET /api/sip/registration-info` |
| List DIDs | `GET /api/caller-ids` |
| Place a call (ring agent, bridge customer) | `POST /api/click-to-call` |
| Live calls / hangup / recording / spy | `GET /api/freeswitch/calls`, `POST /api/freeswitch/{hangup,recording,spy}` |

---

## Part B — Company admin (the app side, all on the web)

1. Sign in to the **SalesAutoCall admin dashboard** and open **☁️ Cloud calling**.
2. **Step 1 — UrOperator account:** paste the **FS_ token**, **tenant id**,
   **default DID**, and the **SIP server/port/transport** UrOperator gave you.
   Click **Save settings**, then **Test connection** — you should see
   `Connected ✓` with your tenant + token expiry.
3. **Step 2 — Assign extensions & numbers:** click
   **Load agents & numbers from UrOperator** to pull the real extensions/DIDs,
   then for each telecaller pick their **agent extension** and **caller ID**.
   (Optional: set a per-agent SIP server override for a rep on a private PBX.)
   Click **Save** on each row.

That's it. Each telecaller's **📞 Cloud call** button now rings their phone via
their assigned extension and shows the assigned number to the customer — nothing
to configure on the phone.

---

## How it works under the hood (for engineers)

- Settings are stored in Supabase: `company_integrations` (token + SIP config,
  one row per company) and `profiles.sip_agent_id` / `caller_id` / `sip_server`
  / `sip_port` (per telecaller). See migrations
  [`0009`](supabase/migrations/0009_company_integrations.sql),
  [`0013`](supabase/migrations/0013_uro_sip_config.sql).
- The **FS_ token is never exposed to the browser or the phone.** Three edge
  functions read it via the service role and call UrOperator server-side:
  - [`uro-admin`](supabase/functions/uro-admin/index.ts) — powers **Test
    connection** and the agent/DID dropdowns (`test` / `agents` / `caller-ids`).
  - [`uro-webrtc`](supabase/functions/uro-webrtc/index.ts) — returns the
    salesperson's SIP credentials so the app's softphone can register.
  - [`click-to-call`](supabase/functions/click-to-call/index.ts) — places the
    call, resolving the agent extension + caller-ID from the profile.
- **Deploy the functions** (once, or after edits):
  ```bash
  supabase functions deploy uro-admin uro-webrtc click-to-call
  ```
  They need the standard `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` env (already present on the project).
- **Apply the migration** before first use:
  ```bash
  supabase db push    # or run supabase/migrations/0013_uro_sip_config.sql
  ```

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Test connection fails | Wrong/expired token, or token not for this tenant. Re-paste the `FS_` token. |
| `USER_NOT_REGISTERED` on call | The agent hasn't registered a softphone yet — open the app and start a cloud call so it registers, or check the extension/password in UrOperator. |
| Agent dropdown is empty | No agents created on UrOperator yet (Part A, step 3). |
| Call connects but no number shows | Set a **caller ID (DID)** for that agent, or a company **default DID**. |
| `404 Cannot GET /api/client/webrtc` | That endpoint isn't deployed by UrOperator yet; the app falls back to `/api/sip/registration-info`. No action needed. |
