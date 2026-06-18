# Cloud calling via self-hosted PBX (FreeSWITCH or Asterisk)

The app is a real SIP softphone (linphone). It **registers** to your PBX, **makes** and
**receives** calls. The PBX **records every call server-side** (reliable — survives the
phone being backgrounded/killed) and posts the recording + call details to the CRM, which
stores it in **Google Drive** and runs the AI summary.

> Server-side recording is strongly preferred over phone-side recording: it captures 100%
> of calls regardless of phone state, and works for inbound calls received while the app is
> in the background.

## App settings (per telecaller)
Settings → Office line calling:
- **Extension** = the rep's SIP extension (e.g. `7777`) — must match `profiles.sip_agent_id`.
- **SIP password**, **SIP server** (your PBX IP/host), **Port** (`5060`).
- "Available for incoming calls" keeps the app registered in the background.

## CRM webhook (the PBX posts here on hangup)
```
POST https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/pbx-cdr
headers:
  x-pbx-secret:  <cdr_secret from Admin → Cloud calling (PBX)>
  x-pbx-call-id: <unique call uuid>      # idempotency
  x-extension:   <rep extension, e.g. 7777>
  x-direction:   out | in
  x-from:        <caller number>
  x-to:          <callee number>
  x-duration:    <seconds>
  x-started-at:  <ISO8601>
  Content-Type:  audio/wav   (or audio/mpeg)
body: <the recording file bytes>         # optional, but this is the point
```
Returns `{ ok, call_id, recording_file_id }`. Safe to retry (idempotent on `x-pbx-call-id`).

---

## FreeSWITCH
**1) Record every call** — in your dialplan, before the bridge:
```xml
<action application="set" data="RECORD_STEREO=true"/>
<action application="set" data="recording_path=/tmp/${uuid}.wav"/>
<action application="record_session" data="${recording_path}"/>
```
**2) Post on hangup** — set a hangup hook that runs a script:
```xml
<action application="set" data="api_hangup_hook=system /usr/local/bin/pbx_cdr.sh ${uuid} ${caller_id_number} ${destination_number} ${billsec} ${direction}"/>
```
**3) `/usr/local/bin/pbx_cdr.sh`:**
```bash
#!/usr/bin/env bash
UUID="$1"; FROM="$2"; TO="$3"; DUR="$4"; DIR="$5"
curl -sS -X POST "https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/pbx-cdr" \
  -H "x-pbx-secret: REPLACE_WITH_CDR_SECRET" \
  -H "x-pbx-call-id: $UUID" \
  -H "x-extension: $FROM" \
  -H "x-direction: ${DIR:-out}" \
  -H "x-from: $FROM" -H "x-to: $TO" -H "x-duration: $DUR" \
  -H "Content-Type: audio/wav" \
  --data-binary "@/tmp/${UUID}.wav"
rm -f "/tmp/${UUID}.wav"
```

## Asterisk
**1) Record every call** — in the dialplan before `Dial()`:
```
exten => _X.,1,MixMonitor(/tmp/${UNIQUEID}.wav)
 same => n,Dial(SIP/${EXTEN})
 same => n,Hangup()
```
**2) Post on hangup** — use the `h` extension:
```
exten => h,1,System(/usr/local/bin/pbx_cdr.sh "${UNIQUEID}" "${CALLERID(num)}" "${EXTEN}" "${CDR(billsec)}" "out")
```
(Same `pbx_cdr.sh` as above — it just curls the file to the webhook.)

---

## Don't get bitten by these
- **One-way / no audio = NAT.** Set FreeSWITCH `ext-rtp-ip`/`ext-sip-ip` (or Asterisk
  `externip` + `localnet` + `nat=yes`). The app deliberately disables STUN/ICE (assumes a
  direct/VPN path), so the PBX must advertise the right media IP.
- **Private PBX IP** (e.g. `10.10.10.3`) means every phone must stay on the VPN to call or
  receive. A public TLS endpoint avoids that.
- **Inbound depends on the app staying registered** in the background — keep battery
  optimization disabled for the app (see TESTING_CHECKLIST.md).
- Recordings land in the company's Google Drive (or the platform Drive) — the same place
  SIM-call recordings go; the AI summary fires automatically.
