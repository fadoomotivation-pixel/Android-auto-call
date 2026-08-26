-- The whole conversation, and the buyer nobody answered.
--
-- WHAT CHANGES ABOUT PRIVACY, STATED PLAINLY
--
-- Until now only 300 characters of each message were kept, on the argument that
-- an admin needs to see that details went out, not read a rep's chats. The
-- founder has decided otherwise for LEAD conversations, and that is a reasonable
-- call: these are the company's own leads, discussing the company's own
-- property, and every CRM on earth shows the thread with a customer.
--
-- WHAT DOES NOT CHANGE, AND MUST NEVER: match_wa_contact still drops every
-- message whose other party is not a lead in that rep's own company, before it
-- reaches this table. Family, friends, salary conversations, the rep's private
-- life — none of it was stored before and none of it is stored now. That gate
-- is what makes observing a personal number acceptable, and widening the body
-- does not touch it. The rep must be told what is kept before they scan; the
-- admin card's wording changes in the same commit.
--
-- body_preview -> body, because a column called "preview" holding the whole
-- message is a lie the next reader would believe. Safe: zero rows, two readers.

alter table public.wa_observed_messages rename column body_preview to body;

comment on column public.wa_observed_messages.body is
  'The message text in full. Only ever present for conversations with a lead in '
  'this company — match_wa_contact drops everything else before insert.';

-- ── the buyer is waiting, and nobody has answered ───────────────────────────
--
-- THE MOST EXPENSIVE THING THIS SYSTEM CAN NOW SEE.
--
-- A buyer who replies on WhatsApp is the highest-intent signal in the product —
-- higher than any lead score, because they acted. Today that reply lands in a
-- table nobody reads. A lead asking "price kya hai?" at 2pm and getting nothing
-- back is money walking out of the door, and no screen, report or alert
-- anywhere would ever mention it.
--
-- The rule is just: whose turn is it? If the last message in a thread came FROM
-- the buyer, the rep owes them a reply.
create or replace view public.v_wa_awaiting_reply
with (security_invoker = true) as
with last_msg as (
  select distinct on (m.contact_id, m.salesperson_id)
    m.contact_id, m.salesperson_id, m.company_id,
    m.direction, m.sent_at, m.body, m.media_kind
  from public.wa_observed_messages m
  order by m.contact_id, m.salesperson_id, m.sent_at desc
)
select
  l.company_id,
  l.salesperson_id,
  l.contact_id,
  c.name  as lead_name,
  c.phone as lead_phone,
  c.stage,
  p.full_name as rep_name,
  l.sent_at as waiting_since,
  l.body    as their_last_message,
  l.media_kind,
  (extract(epoch from (now() - l.sent_at)) / 60)::int as waiting_minutes
from last_msg l
join public.contacts c on c.id = l.contact_id
left join public.profiles p on p.id = l.salesperson_id
where l.direction = 'in';

comment on view public.v_wa_awaiting_reply is
  'Leads whose last WhatsApp message came from the BUYER. Whose turn it is, '
  'nothing more — but it is the highest-intent signal the CRM has.';

-- ── how fast does this rep answer a buyer? ──────────────────────────────────
--
-- Message COUNT can be gamed by sending more. Reply SPEED cannot: it needs the
-- buyer to have spoken first, and it measures the one thing that decides
-- whether a hot lead stays hot.
create or replace view public.v_wa_response_times
with (security_invoker = true) as
select
  m.company_id,
  m.salesperson_id,
  m.contact_id,
  m.sent_at as asked_at,
  (select min(o.sent_at)
     from public.wa_observed_messages o
    where o.contact_id = m.contact_id
      and o.salesperson_id = m.salesperson_id
      and o.direction = 'out'
      and o.sent_at > m.sent_at) as answered_at
from public.wa_observed_messages m
where m.direction = 'in';

-- ── the daily view, with speed alongside the counts ─────────────────────────
--
-- Dropped and recreated rather than replaced: create or replace cannot insert a
-- column into the middle of a view's list — Postgres reads that as a rename and
-- refuses.
--
-- The median is computed in its own CTE and joined, NOT as a correlated
-- subquery in the grouped select: inside a GROUP BY, a subquery cannot see the
-- ungrouped sent_at it would need to match the day on.
drop view if exists public.v_rep_whatsapp_daily;

create view public.v_rep_whatsapp_daily
with (security_invoker = true) as
with msg as (
  select
    m.company_id,
    m.salesperson_id,
    (m.sent_at at time zone 'Asia/Kolkata')::date as day_ist,
    count(*) filter (where m.direction = 'out')                                    as messages_sent,
    count(distinct m.contact_id) filter (where m.direction = 'out')                as leads_messaged,
    count(distinct m.contact_id) filter (where m.direction = 'out' and m.shared_details) as leads_given_details,
    count(*) filter (where m.direction = 'out' and m.shared_details)               as details_shared,
    count(*) filter (where m.direction = 'out' and m.media_kind = 'document')      as pdfs_sent,
    count(*) filter (where m.direction = 'out' and m.media_kind = 'image')         as images_sent,
    count(*) filter (where m.direction = 'out' and m.media_kind = 'video')         as videos_sent,
    count(*) filter (where m.direction = 'out' and m.media_kind = 'audio')         as voice_notes_sent,
    count(distinct m.contact_id) filter (where m.direction = 'in')                 as leads_who_replied,
    min(m.sent_at) filter (where m.direction = 'out')                              as first_message_at,
    max(m.sent_at) filter (where m.direction = 'out')                              as last_message_at
  from public.wa_observed_messages m
  group by m.company_id, m.salesperson_id, (m.sent_at at time zone 'Asia/Kolkata')::date
),
resp as (
  -- Median, not mean: one lead answered three days late would otherwise make a
  -- rep who normally replies in four minutes look asleep.
  select
    rt.company_id,
    rt.salesperson_id,
    (rt.asked_at at time zone 'Asia/Kolkata')::date as day_ist,
    (percentile_cont(0.5) within group (
       order by extract(epoch from (rt.answered_at - rt.asked_at)) / 60))::int as median_reply_minutes,
    count(*) as answered_count
  from public.v_wa_response_times rt
  where rt.answered_at is not null
  group by rt.company_id, rt.salesperson_id, (rt.asked_at at time zone 'Asia/Kolkata')::date
)
select
  msg.company_id,
  msg.salesperson_id,
  msg.day_ist,
  msg.messages_sent,
  msg.leads_messaged,
  msg.leads_given_details,
  msg.details_shared,
  msg.pdfs_sent,
  msg.images_sent,
  msg.videos_sent,
  msg.voice_notes_sent,
  msg.leads_who_replied,
  resp.median_reply_minutes,
  coalesce(resp.answered_count, 0)::bigint as buyers_answered,
  msg.first_message_at,
  msg.last_message_at
from msg
left join resp
  on resp.company_id = msg.company_id
 and resp.salesperson_id = msg.salesperson_id
 and resp.day_ist = msg.day_ist;

comment on view public.v_rep_whatsapp_daily is
  'One rep, one IST day of WhatsApp with their own leads. leads_given_details '
  'and leads_who_replied are the two the founder reads first; '
  'median_reply_minutes is the one that cannot be gamed by sending more.';
