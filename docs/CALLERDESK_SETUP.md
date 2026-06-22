# CallerDesk integration — setup & operations

Replaces the UrOperator SIP softphone with **CallerDesk**, a click-to-call PSTN
bridge. CallerDesk rings the agent's own mobile, bridges the customer, and
**records the call on its servers**, then POSTs a webhook back to us. This removes
the in-app SIP/WebRTC audio path entirely and fixes recordings at the source.

## How a call flows

```
App → callerdesk-call (edge fn) → CallerDesk click_to_call_v2
        │                               │
        │ (pre-creates call_logs row    ├─ rings AGENT mobile (calling_party_a)
        │  with provider_call_id)       ├─ then dials CUSTOMER (calling_party_b)
        │                               ├─ bridges + RECORDS server-side
        ▼                               ▼
   call_logs row ◄──── callerdesk-webhook ◄──── CallerDesk "call report" webhook
   (status, duration, recording_url, AI summary via Groq)
```

## What was built (this PR)

- **Migration `0036`** — `company_integrations.call_provider`, `callerdesk_deskphone`,
  `callerdesk_webhook_token`, Vault-backed `callerdesk_authcode` (`set_/get_callerdesk_authcode`);
  `call_logs.provider_call_id` + `recording_url`; `callerdesk_events` raw-audit table.
- **`callerdesk-call`** edge function — authenticated; places the bridge call.
- **`callerdesk-webhook`** edge function — public, token-scoped; records result +
  pulls the recording into the existing Groq summary pipeline.
- All three are **deployed** to the live project and **verified end-to-end** (the
  matched outbound path updates the call row: status, duration, recording URL).

## One-time setup (per company)

1. **Authcode (API key)** — store it in Vault via the RPC (run as a company admin
   or platform admin; never hard-code it):
   ```sql
   select set_callerdesk_authcode('<COMPANY_UUID>', '<YOUR_CALLERDESK_AUTHCODE>');
   ```
2. **Deskphone + provider switch:**
   ```sql
   update company_integrations
     set callerdesk_deskphone = '<YOUR_VIRTUAL_NUMBER>', call_provider = 'callerdesk'
     where company_id = '<COMPANY_UUID>';
   ```
3. **Agent mobiles** — every telecaller needs their 10-digit mobile on their profile
   (this is `calling_party_a`); also whitelist those numbers inside CallerDesk if your
   plan requires it:
   ```sql
   update profiles set phone = '<10_DIGIT_MOBILE>' where id = '<AGENT_UUID>';
   ```
4. **Webhook** — in CallerDesk Dashboard → **API & Integration → Webhooks**, set the
   "call report" event URL to (company-scoped by its token):
   ```
   https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/callerdesk-webhook?token=<callerdesk_webhook_token>
   ```
   Each company's token is in `company_integrations.callerdesk_webhook_token`.

## Placing a call

`POST /functions/v1/callerdesk-call` (with the user's auth JWT):
```json
{ "customer_phone": "9876543210", "contact_id": "…?", "campaign_id": "…?", "call_log_id": "…?" }
```
Returns `{ ok, call_log_id, provider_call_id, provider_response }`. The agent's phone
rings; they answer and talk. The webhook fills in the result a few seconds later.

## ⚠️ First real call — confirm the field names

CallerDesk's exact webhook field names vary by account/plan. The webhook is built to
tolerate many names AND to store every payload raw. After your **first real call**, run:
```sql
select payload from callerdesk_events order by created_at desc limit 1;
```
Check that the extractor caught the call id, recording URL, duration and status. If a
field uses a name we didn't anticipate, add it to the `pick([...])` lists in
`callerdesk-webhook` and redeploy. (Nothing is ever lost — the raw payload is retained.)

## Verify the pipeline

```sql
select phone, direction, duration_seconds, recording_status, recording_url, summary_status
from call_logs where recording_source = 'callerdesk' order by created_at desc limit 10;
```
Healthy = `recording_status = 'ready'`, a `recording_url`, and `summary_status = 'ready'`.

## Still to do (follow-ups, not in this PR)

- **Android app switch:** point the outbound "cloud call" action at `callerdesk-call`
  and remove the SIP/Linphone registration for `call_provider = 'callerdesk'` companies.
  The agent answers on their native dialer — no in-app audio. (Needs on-device testing.)
- **Admin UI:** a CallerDesk panel (authcode / deskphone / webhook URL) in
  `cloud-calling`, replacing the UrOperator fields.
- **Recording playback:** have the web/app player use `recording_url` directly for
  CallerDesk calls (instead of the Drive-backed `recording-url` function).
- **Inbound routing:** assign inbound CallerDesk calls to a rep (today they're retained
  as raw events only, since `call_logs.salesperson_id` is required).
- **Retire** UrOperator (`uro-*`, SIP config) and SIM recording once CallerDesk is proven.
