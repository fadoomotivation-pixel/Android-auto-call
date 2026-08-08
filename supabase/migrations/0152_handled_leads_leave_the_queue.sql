-- A lead the rep has already dealt with does not go back into "Call now".
--
-- "Ye problem thodi der ke liye thik hui thi, phir hone lag gayi."
--
-- Yesterday's fix (markWorkedLocally) stopped the PHONE holding a stale queue,
-- and that was a real bug. But it made this one louder rather than quieter:
-- before, the stale snapshot hid the lead for 30-60 minutes; now the app asks
-- the server the moment the rep taps, and the SERVER puts the lead straight
-- back. The queue became accurate, and what it was accurately reporting was
-- wrong.
--
-- v_lead_action_state ends in a ladder of fallbacks for leads with no booked
-- callback. Two of them fire on evidence this system cannot currently trust:
--
--   WHEN c.assigned_at > c.last_contacted_at            THEN 'call_now'
--   WHEN c.status IN (no_answer, busy, wrong_person,
--                     callback, follow_up, queued)      THEN 'call_now'
--
-- `last_contacted_at` is stamped ONLY by a call_logs insert (migration 0081).
-- On a phone whose call-log sync is dead — Ankita's Xiaomi, Shweta's, and both
-- "permission off" reps — it never advances, so every lead they have ever
-- worked still looks like it was assigned and never touched. Measured on Fanbe
-- when this was written, sixteen leads were handled, had nothing booked, and
-- were sitting in Call now:
--
--   Amit    interested   handled 6 Aug   last_contacted_at NULL
--   Vinod   site_visit   handled 4 Aug   last_contacted_at NULL
--   Hemant  interested   handled 5 Aug   last_contacted_at NULL
--
-- A lead marked INTERESTED, and one with a SITE VISIT booked, being offered to
-- the rep as a cold call — because a background worker on an OEM phone lost a
-- row. The rep rings them again, the customer wonders why, and the rep stops
-- believing the list.
--
-- THE SIGNAL THAT WAS SITTING RIGHT THERE. contacts.handled_at is the CRM's own
-- record that a rep recorded an outcome, written by the app the instant they
-- tap — no phone permission, no background job, no OEM in the way. The action
-- view never looked at it.
--
-- Both fallbacks are now gated on it, and deliberately no further:
--
--   * The assigned-vs-called branch means "assigned and never worked". A lead
--     with handled_at set has demonstrably been worked, whenever that was, so
--     it drops out of that branch entirely and lands on its real state —
--     usually no_next_step, which is exactly the honest answer: you spoke to
--     them and booked nothing.
--
--   * The status branch is gated on TODAY only. A no_answer from five days ago
--     with nothing booked genuinely does need ringing; the same one recorded an
--     hour ago does not. Handled today = done today, back tomorrow.
--
-- Nothing is lost and nothing is hidden: every lead this removes from Call now
-- appears in no_next_step, which the app already shows as its own bucket and
-- LEAD_STAGE_MODEL.md already names "the leak — talked to them, booked
-- nothing". A rep who books nothing still has to answer for it; they just do
-- not get told to re-dial someone they finished with an hour ago.
--
-- This is a VIEW, so it takes effect for every rep on the next query — no app
-- update, no install, nothing for anyone to tap. Unlike every other fix this
-- week it reaches the reps whose phones are broken, which is the point.

create or replace view public.v_lead_action_state as
with nxt as (
  select f.contact_id, min(f.due_at) as due_at
  from public.follow_ups f
  where f.completed_at is null
  group by f.contact_id
)
select
  c.id as contact_id,
  n.due_at,
  case
    when s.is_terminal then 'none'
    when n.due_at is not null
     and n.due_at < (date_trunc('day', timezone('Asia/Kolkata', now())) at time zone 'Asia/Kolkata')
      then 'overdue'
    when n.due_at is not null and n.due_at <= now() then 'call_now'
    when n.due_at is not null
     and timezone('Asia/Kolkata', n.due_at)::date = timezone('Asia/Kolkata', now())::date
      then 'due_today'
    when n.due_at is not null then 'scheduled'
    when c.stage = 'new' then 'call_now'
    -- Assigned and never worked. handled_at is the CRM's own proof the rep
    -- recorded an outcome; without this gate a dead call-log sync alone puts a
    -- finished lead back in the queue for ever.
    when c.handled_at is null
     and c.assigned_at is not null
     and (c.last_contacted_at is null or c.assigned_at > c.last_contacted_at)
      then 'call_now'
    -- Still owed a call, but not one already answered TODAY.
    when c.status = any (array['no_answer'::contact_status, 'busy'::contact_status,
                               'wrong_person'::contact_status, 'callback'::contact_status,
                               'follow_up'::contact_status, 'queued'::contact_status])
     and (c.handled_at is null
          or timezone('Asia/Kolkata', c.handled_at)::date
             < timezone('Asia/Kolkata', now())::date)
      then 'call_now'
    when c.site_visit_at is not null and c.site_visit_at > now() then 'awaiting_visit'
    else 'no_next_step'
  end as action_state
from public.contacts c
join public.lead_stages s on s.code = c.stage
left join nxt n on n.contact_id = c.id;
