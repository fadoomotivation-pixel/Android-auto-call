-- "✓ Sent" was our own optimism, not WhatsApp's answer.
--
-- Tonight the founder's pulse showed a green tick and a timestamp, and nothing
-- arrived on the phone. Nothing was broken in the send: Meta returned HTTP 200
-- and a real message id. But look at what Meta's own body actually says:
--
--     {"messages":[{"id":"wamid.…","message_status":"accepted"}]}
--
-- ACCEPTED. Not sent, not delivered. Meta takes the message, answers 200, and
-- only later decides whether it may actually be handed over — and when it may
-- not (the 24-hour free-text window being the usual reason) it says so in a
-- STATUS WEBHOOK, never in the reply to the send. We were writing "sent" the
-- moment we got a message id, so the one failure mode this feature was always
-- going to hit was the exact one we rendered as success.
--
-- Proof that we are blind rather than merely wrong: across the whole platform
-- whatsapp_messages holds two rows, both 'sent', and not one 'delivered',
-- 'read' or 'failed' has ever been written. The webhook handler for statuses
-- exists and is correct; no status has ever reached it.
--
-- Two columns are all the truth needs.
--
-- whatsapp_messages.error — Meta puts the reason inside statuses[].errors[] on
-- a failed delivery. The handler was storing s.status and dropping errors[]
-- entirely, so a failure would have landed as the bare word "failed" with the
-- reason discarded. The reason IS the feature: "they must message you first"
-- and "your token expired" need completely different actions from the owner.
alter table public.whatsapp_messages
  add column if not exists error text;

-- pulse_subscribers.last_wa_message_id — the join back. A status webhook knows
-- only a wamid; without this it cannot tell that the message it just failed was
-- somebody's daily report, and the Pulse page would go on showing a tick while
-- whatsapp_messages quietly held the failure. Keeping the id on the subscriber
-- row (rather than a status lookup at render time) means the page stays a
-- single cheap select.
alter table public.pulse_subscribers
  add column if not exists last_wa_message_id text;

create index if not exists pulse_subscribers_last_wamid
  on public.pulse_subscribers(last_wa_message_id)
  where last_wa_message_id is not null;

-- Existing rows claimed a delivery nobody can vouch for. 'accepted' is what
-- actually happened to them, and it is what Meta itself called it.
update public.whatsapp_messages set status = 'accepted'
 where direction = 'out' and status = 'sent';

update public.pulse_subscribers set last_status = 'accepted'
 where last_status = 'sent';

comment on column public.whatsapp_messages.status is
  'accepted = Meta took it (our write). sent/delivered/read/failed = Meta''s own status webhook. Only delivered/read prove it reached the phone.';
