# SalesAutoCall — Privacy Policy

_Last updated: 2026-06-08_

SalesAutoCall ("the app") is a business-to-business sales-productivity tool used
by a company's own sales agents. This policy explains what data the app handles
and why. **You must host this page at a public URL** (e.g. your admin site at
`/privacy`) and replace the placeholders below before publishing.

- **Provider:** `[Your Company Legal Name]`
- **Contact:** `[privacy@yourcompany.com]`

## What we collect

| Data | Purpose | Stored where |
|------|---------|--------------|
| Salesperson account: name, phone, email | Authentication, attributing activity | Supabase (cloud) |
| Imported contacts: name, phone, email, company, notes | The list the agent calls | Supabase (cloud) |
| Call logs: phone dialed, timestamps, duration, outcome, SIM slot | Productivity reporting for the agent and their company admin | Supabase (cloud) |

The app **does not** record or upload call audio, does not read your device's
existing contacts or call history, and does not use the data for advertising.

## Permissions

- **Phone (`CALL_PHONE`)** — to place outbound calls to the imported business contacts.
- **Phone state (`READ_PHONE_STATE`)** — to detect when a call ends so the next
  call can be queued and the call logged. The app does not log call content.
- **Notifications** — to show auto-dial progress in a foreground notification.

## Data sharing & storage

Data is transmitted over encrypted HTTPS/TLS to our cloud backend (Supabase) and
is isolated per company using row-level security. We do not sell personal data or
share it with third parties except our infrastructure provider (Supabase) acting
as a data processor.

## Consent & Do-Not-Call

Agents must only call people who have consented and must comply with applicable
telemarketing / Do-Not-Call (DND) regulations. Contacts marked "DNC" are never
dialed.

## Retention & deletion

Company admins can delete contacts and account data from the dashboard. To
request deletion of your personal data, contact `[privacy@yourcompany.com]`.

## Children

The app is intended for business use by adults and is not directed at children.

## Changes

We may update this policy; the "Last updated" date will change accordingly.
