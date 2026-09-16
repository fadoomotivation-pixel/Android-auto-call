-- A group id is not a phone number, and neither is a LID.
--
-- Both are long digit strings that land in peer_phone, and every reader here
-- takes "the last ten digits" of that column and compares it against the SIM
-- call log. For a group that was already wrong and produced a harmless zero.
-- For a LID it is worse: the digits are arbitrary, so the comparison is a
-- coin-flip chance of hanging a stranger's conversation off somebody else's
-- call history.
--
-- Two changes, both about not pretending to know something:
--
--   super_rep_conversations   returns peer_is_lid, and stops counting calls
--                             against a group or a LID.
--   super_rep_unknown_numbers drops both from the list entirely. That list
--                             exists so the founder can CAPTURE these as leads,
--                             and neither a group nor an id you cannot dial is
--                             a lead.
--
-- See 0191 for what a LID is and why one appears at all.
--
-- APPLIED TO PRODUCTION BY HAND on 2026-09-16, same as 0191.

drop function if exists public.super_rep_conversations(uuid);

create or replace function public.super_rep_conversations(p_rep uuid)
returns table(
  peer_phone text, peer_name text, lead_name text, contact_id uuid,
  messages integer, they_sent integer, rep_sent integer, calls integer,
  first_at timestamptz, last_at timestamptz, last_body text, last_media text,
  is_group boolean, peer_is_lid boolean
)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;
  return query
  with dialled as (
    select right(regexp_replace(cl.phone, '\D', '', 'g'), 10) as l10, count(*)::int as n
    from public.call_logs cl
    where cl.salesperson_id = p_rep and cl.phone is not null
    group by 1
  ),
  agg as (
    select m.peer_phone,
           right(regexp_replace(m.peer_phone, '\D', '', 'g'), 10) as l10,
           bool_or(m.is_group) as grp,
           bool_or(m.peer_is_lid) as lid,
           max(m.peer_name) filter (where m.peer_name is not null) as nm,
           (array_agg(m.contact_id) filter (where m.contact_id is not null))[1] as cid,
           count(*)::int as total,
           count(*) filter (where m.direction = 'in')::int as inbound,
           count(*) filter (where m.direction = 'out')::int as outbound,
           min(m.sent_at) as first_at, max(m.sent_at) as last_at
    from public.wa_observed_messages m
    where m.salesperson_id = p_rep and m.peer_phone is not null
      and m.archived_at is null
    group by m.peer_phone
  ),
  tail as (
    select distinct on (m.peer_phone) m.peer_phone, m.body, m.media_kind
    from public.wa_observed_messages m
    where m.salesperson_id = p_rep and m.peer_phone is not null
      and m.archived_at is null
    order by m.peer_phone, m.sent_at desc
  )
  select a.peer_phone, a.nm, ct.name, a.cid,
         a.total, a.inbound, a.outbound,
         -- A group id and a LID are both long numbers that are not phone
         -- numbers. Counting SIM calls against either one is how a stranger's
         -- call history ends up beside somebody else's conversation.
         case when a.grp or a.lid then 0 else coalesce(d.n, 0) end,
         a.first_at, a.last_at,
         left(coalesce(t.body, ''), 160), t.media_kind, a.grp, a.lid
  from agg a
  left join dialled d on d.l10 = a.l10 and not a.grp and not a.lid
  left join tail t on t.peer_phone = a.peer_phone
  left join public.contacts ct on ct.id = a.cid
  order by a.last_at desc
  limit 2000;
end
$function$;

drop function if exists public.super_rep_unknown_numbers(uuid, integer);

create or replace function public.super_rep_unknown_numbers(p_rep uuid, p_days integer default 0)
returns table(
  peer_phone text, peer_name text, messages integer, they_sent integer,
  rep_sent integer, calls integer, first_seen timestamptz, last_seen timestamptz
)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;
  return query
  with dialled as (
    select right(regexp_replace(cl.phone, '\D', '', 'g'), 10) as l10, count(*)::int as n
    from public.call_logs cl
    where cl.salesperson_id = p_rep and cl.phone is not null
    group by 1
  ),
  msgs as (
    select m.peer_phone,
           right(regexp_replace(m.peer_phone, '\D', '', 'g'), 10) as l10,
           max(m.peer_name) filter (where m.peer_name is not null) as nm,
           count(*)::int as total,
           count(*) filter (where m.direction = 'in')::int as inbound,
           count(*) filter (where m.direction = 'out')::int as outbound,
           min(m.sent_at) as first_at, max(m.sent_at) as last_at
    from public.wa_observed_messages m
    where m.salesperson_id = p_rep and m.contact_id is null and m.peer_phone is not null
      and m.archived_at is null
      -- This list exists so a founder can CAPTURE these as leads. A group is
      -- not a person and a LID is not a number you can ring, so neither
      -- belongs on it.
      and not m.is_group and not m.peer_is_lid
      and (p_days <= 0 or m.sent_at >= now() - make_interval(days => p_days))
    group by m.peer_phone
  )
  select x.peer_phone, x.nm, x.total, x.inbound, x.outbound,
         coalesce(d.n, 0), x.first_at, x.last_at
  from msgs x
  left join dialled d on d.l10 = x.l10
  order by coalesce(d.n, 0) desc, x.total desc
  limit 1000;
end
$function$;
