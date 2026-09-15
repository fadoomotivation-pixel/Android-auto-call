-- Group chats were being dropped, and they are where the work happens.
--
-- WATCH_GROUPS defaulted to false in the worker, on the reasonable-sounding
-- theory that a group is noise and a lead is a one-to-one chat. A screenshot of
-- the rep's actual WhatsApp settled it: "Employes updation group", a "Payment
-- claim" group with a colleague posting a photo, site maps going out as PDFs to
-- named deal groups — 23 unread across them, all from the same afternoon. Every
-- one of those was discarded before it reached the CRM, which is much of why
-- her recent work looked like an empty screen.
--
-- A rep's day is not less visible because the buyer brought their brother into
-- the chat.
--
-- Two columns, because a group needs them:
--   is_group      peer_phone then holds the GROUP's id, not a person's. A
--                 reader that does not know this shows a 17-digit number as if
--                 it were a buyer and offers to capture them as a lead.
--   sender_phone  who actually spoke. WhatsApp puts it on key.participant, and
--                 without it every voice in a group thread is the same one.
--
-- Applied to production before this file existed.

alter table public.wa_observed_messages
  add column if not exists is_group boolean not null default false,
  add column if not exists sender_phone text;

comment on column public.wa_observed_messages.is_group is
  'The conversation is a WhatsApp group. peer_phone then holds the group id, not a person.';
comment on column public.wa_observed_messages.sender_phone is
  'In a group, who actually spoke. Null in a one-to-one chat, where peer_phone already says.';

-- Both readers gain the group columns. Dropped first because Postgres will not
-- change a function's OUT parameters in place.
drop function if exists public.super_rep_conversations(uuid);
drop function if exists public.super_rep_peer_thread(uuid, text, integer);

create function public.super_rep_conversations(p_rep uuid)
returns table(
  peer_phone text, peer_name text, lead_name text, contact_id uuid,
  messages integer, they_sent integer, rep_sent integer, calls integer,
  first_at timestamptz, last_at timestamptz, last_body text, last_media text,
  is_group boolean
)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;
  return query
  with dialled as (
    select right(regexp_replace(cl.phone, '\D', '', 'g'), 10) as l10,
           count(*)::int as n
    from public.call_logs cl
    where cl.salesperson_id = p_rep and cl.phone is not null
    group by 1
  ),
  agg as (
    select m.peer_phone,
           right(regexp_replace(m.peer_phone, '\D', '', 'g'), 10) as l10,
           bool_or(m.is_group) as grp,
           max(m.peer_name) filter (where m.peer_name is not null) as nm,
           (array_agg(m.contact_id) filter (where m.contact_id is not null))[1] as cid,
           count(*)::int as total,
           count(*) filter (where m.direction = 'in')::int as inbound,
           count(*) filter (where m.direction = 'out')::int as outbound,
           min(m.sent_at) as first_at,
           max(m.sent_at) as last_at
    from public.wa_observed_messages m
    where m.salesperson_id = p_rep and m.peer_phone is not null
    group by m.peer_phone
  ),
  tail as (
    select distinct on (m.peer_phone) m.peer_phone, m.body, m.media_kind
    from public.wa_observed_messages m
    where m.salesperson_id = p_rep and m.peer_phone is not null
    order by m.peer_phone, m.sent_at desc
  )
  select a.peer_phone, a.nm, ct.name, a.cid,
         a.total, a.inbound, a.outbound,
         -- A group id is not a phone number, so "also called this number" is
         -- meaningless for one and would be a coincidence if it ever matched.
         case when a.grp then 0 else coalesce(d.n, 0) end,
         a.first_at, a.last_at,
         left(coalesce(t.body, ''), 160), t.media_kind,
         a.grp
  from agg a
  left join dialled d on d.l10 = a.l10
  left join tail t on t.peer_phone = a.peer_phone
  left join public.contacts ct on ct.id = a.cid
  order by a.last_at desc
  limit 2000;
end
$function$;

create function public.super_rep_peer_thread(p_rep uuid, p_peer text, p_limit integer default 400)
returns table(
  direction text, body text, media_kind text, file_name text, media_path text,
  transcript text, duration_seconds integer, signal text,
  deleted_at timestamptz, edited_at timestamptz, body_original text,
  peer_name text, sent_at timestamptz, sender_phone text, is_group boolean
)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;

  return query
  select m.direction, m.body, m.media_kind, m.file_name,
         m.media_path, m.transcript, m.duration_seconds,
         m.signal, m.deleted_at, m.edited_at, m.body_original,
         m.peer_name, m.sent_at, m.sender_phone, m.is_group
  from public.wa_observed_messages m
  where m.salesperson_id = p_rep
    and right(regexp_replace(m.peer_phone, '\D', '', 'g'), 10)
      = right(regexp_replace(p_peer, '\D', '', 'g'), 10)
  order by m.sent_at desc
  limit greatest(p_limit, 1);
end
$function$;
