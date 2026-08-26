-- These are company SIMs. Keep every conversation.
--
-- THE FACT THAT CHANGES THE DESIGN
--
-- The observer was built assuming a rep's PERSONAL phone, so match_wa_contact
-- dropped every conversation with anyone who was not already a lead. That was
-- the right call for a personal number and it is the wrong one here: the numbers
-- are allotted by the company, so there are no private chats to protect — and
-- the thing being discarded was never noise.
--
-- A buyer messaging a company SIM who is NOT in the CRM is not a privacy
-- boundary. It is a lead nobody has written down. The previous design threw
-- those away unread, and the dashboard reported the loss as a reassuring zero.
--
-- WHAT CHANGES
--
-- Everything is stored. contact_id becomes nullable and peer_phone is always
-- recorded, so a conversation exists whether or not the CRM knows who it is
-- with. The lead-scoped numbers a founder already reads are unaffected: every
-- one of them now filters on contact_id being present, so an unknown number
-- cannot inflate leads_messaged, details or reply counts.
--
-- WHAT DOES NOT CHANGE
--
-- Company isolation. A message is still filed under the rep's own company and
-- nothing crosses a tenant boundary. match_wa_contact still decides whether a
-- conversation belongs to a KNOWN lead; it simply no longer decides whether the
-- conversation is allowed to exist.

alter table public.wa_observed_messages
  alter column contact_id drop not null,
  add column if not exists peer_phone text;

comment on column public.wa_observed_messages.contact_id is
  'The lead, when the number is one. NULL means a conversation on a company SIM '
  'with someone not in the CRM — see v_wa_unknown_numbers, which treats those '
  'as leads waiting to be written down.';
comment on column public.wa_observed_messages.peer_phone is
  'The other party, always. Present even when contact_id is null, which is the '
  'whole point: an unknown number is a lead nobody has captured yet.';

create index if not exists idx_wa_observed_peer
  on public.wa_observed_messages(company_id, peer_phone, sent_at desc);

-- The trigger writes lead history, and an unknown number has no lead to write
-- it to. Skipping is correct — the conversation is kept, it simply has no
-- Journey to appear on until someone turns that number into a lead.
create or replace function public.wa_observed_to_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor text;
begin
  if new.direction <> 'out' then
    return null;
  end if;
  -- No lead, no lead activity. The message is still stored.
  if new.contact_id is null then
    return null;
  end if;

  select p.full_name into v_actor
  from public.profiles p where p.id = new.salesperson_id;

  insert into public.lead_activities (company_id, contact_id, actor_id, actor_name, type, detail)
  values (
    new.company_id, new.contact_id, new.salesperson_id,
    coalesce(nullif(btrim(v_actor), ''), 'Rep') || ' 💬',
    'whatsapp',
    case
      when new.shared_details then 'Sent project details on WhatsApp'
      when new.has_media then 'Sent a file on WhatsApp'
      else 'Messaged on WhatsApp'
    end
  );
  return null;
end $$;

-- ── the lead numbers stay lead-only ─────────────────────────────────────────
--
-- Rebuilt so that every count a founder already reads filters on contact_id
-- being present. Without this, storing unknown numbers would quietly inflate
-- "leads messaged" and "got details" with people who are not leads at all —
-- corrupting the two KPIs the founder said he cares about most.
drop view if exists public.v_rep_whatsapp_daily;

create view public.v_rep_whatsapp_daily
with (security_invoker = true) as
with msg as (
  select
    m.company_id,
    m.salesperson_id,
    (m.sent_at at time zone 'Asia/Kolkata')::date as day_ist,
    count(*) filter (where m.direction = 'out' and m.contact_id is not null)                    as messages_sent,
    count(distinct m.contact_id) filter (where m.direction = 'out')                             as leads_messaged,
    count(distinct m.contact_id) filter (where m.direction = 'out' and m.shared_details)        as leads_given_details,
    count(*) filter (where m.direction = 'out' and m.shared_details and m.contact_id is not null) as details_shared,
    count(*) filter (where m.direction = 'out' and m.media_kind = 'document' and m.contact_id is not null) as pdfs_sent,
    count(*) filter (where m.direction = 'out' and m.media_kind = 'image' and m.contact_id is not null)    as images_sent,
    count(*) filter (where m.direction = 'out' and m.media_kind = 'video' and m.contact_id is not null)    as videos_sent,
    count(*) filter (where m.direction = 'out' and m.media_kind = 'audio' and m.contact_id is not null)    as voice_notes_sent,
    count(distinct m.contact_id) filter (where m.direction = 'in')                              as leads_who_replied,
    -- New, and the reason this migration exists: conversations on a company SIM
    -- with someone the CRM has never heard of.
    count(*) filter (where m.contact_id is null)                                                as unknown_messages,
    count(distinct m.peer_phone) filter (where m.contact_id is null)                            as unknown_numbers,
    min(m.sent_at) filter (where m.direction = 'out')                                           as first_message_at,
    max(m.sent_at) filter (where m.direction = 'out')                                           as last_message_at
  from public.wa_observed_messages m
  group by m.company_id, m.salesperson_id, (m.sent_at at time zone 'Asia/Kolkata')::date
),
resp as (
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
  msg.company_id, msg.salesperson_id, msg.day_ist,
  msg.messages_sent, msg.leads_messaged, msg.leads_given_details, msg.details_shared,
  msg.pdfs_sent, msg.images_sent, msg.videos_sent, msg.voice_notes_sent,
  msg.leads_who_replied,
  resp.median_reply_minutes,
  coalesce(resp.answered_count, 0)::bigint as buyers_answered,
  msg.unknown_messages, msg.unknown_numbers,
  msg.first_message_at, msg.last_message_at
from msg
left join resp
  on resp.company_id = msg.company_id
 and resp.salesperson_id = msg.salesperson_id
 and resp.day_ist = msg.day_ist;

-- ── leads nobody wrote down ─────────────────────────────────────────────────
--
-- The commercial point of the whole change. Someone messaged a company number,
-- a rep talked to them, and the CRM has no record that this person exists — so
-- they get no follow-up, no callback, and no place in any report.
create or replace view public.v_wa_unknown_numbers
with (security_invoker = true) as
select
  m.company_id,
  m.salesperson_id,
  p.full_name as rep_name,
  m.peer_phone,
  -- WhatsApp's own profile name for them. Often the only clue to who this is.
  max(m.peer_name) filter (where m.peer_name is not null)      as peer_name,
  count(*)                                                      as messages,
  count(*) filter (where m.direction = 'in')                    as they_sent,
  count(*) filter (where m.direction = 'out')                   as rep_sent,
  min(m.sent_at)                                                as first_seen,
  max(m.sent_at)                                                as last_seen
from public.wa_observed_messages m
left join public.profiles p on p.id = m.salesperson_id
where m.contact_id is null
  and m.peer_phone is not null
group by m.company_id, m.salesperson_id, p.full_name, m.peer_phone;

comment on view public.v_wa_unknown_numbers is
  'People who talked to a company SIM and are not in the CRM. On a company '
  'number these are not private contacts — they are leads nobody wrote down, '
  'and they currently get no follow-up at all.';
