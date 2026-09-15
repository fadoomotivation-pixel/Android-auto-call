-- The unknown-numbers panel was not empty. It was timing out.
--
-- It rendered as an empty section for weeks, which reads exactly like "this rep
-- has no uncaptured numbers" — and that is what it was taken to mean. The
-- moment the page started SHOWING rpc errors instead of discarding them, it
-- said what had really been happening:
--
--   numbers that are not leads: canceling statement due to statement timeout
--
-- The cost was a correlated subquery. For each of 348 peers the function
-- counted matching rows in call_logs, applying regexp_replace to every phone in
-- the table to compare last-ten-digits — and it did that TWICE per row, once to
-- select the count and again to order by it. Roughly 700 full scans of
-- call_logs with a regex on each row, for one panel.
--
-- Nothing about the answer needed that. The call counts per number are one
-- GROUP BY, computed once and joined. Same output, same ordering.
--
--   before: statement timeout (>8s)
--   after:  632 ms for 348 rows
--
-- super_rep_conversations carried the identical pattern and was heading the
-- same way as message volume grew, so it gets the same treatment: 115 ms.

create or replace function public.super_rep_unknown_numbers(p_rep uuid, p_days integer default 0)
returns table(
  peer_phone text, peer_name text, messages integer, they_sent integer,
  rep_sent integer, calls integer,
  first_seen timestamptz, last_seen timestamptz
)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;

  return query
  -- Once, not once per row. This is the whole fix.
  with dialled as (
    select right(regexp_replace(cl.phone, '\D', '', 'g'), 10) as l10,
           count(*)::int as n
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
           min(m.sent_at) as first_at,
           max(m.sent_at) as last_at
    from public.wa_observed_messages m
    where m.salesperson_id = p_rep
      and m.contact_id is null
      and m.peer_phone is not null
      and (p_days <= 0 or m.sent_at >= now() - make_interval(days => p_days))
    group by m.peer_phone
  )
  select x.peer_phone, x.nm, x.total, x.inbound, x.outbound,
         coalesce(d.n, 0),
         x.first_at, x.last_at
  from msgs x
  left join dialled d on d.l10 = x.l10
  order by coalesce(d.n, 0) desc, x.total desc
  limit 1000;
end
$function$;

create or replace function public.super_rep_conversations(p_rep uuid)
returns table(
  peer_phone text, peer_name text, lead_name text, contact_id uuid,
  messages integer, they_sent integer, rep_sent integer, calls integer,
  first_at timestamptz, last_at timestamptz, last_body text, last_media text
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
         coalesce(d.n, 0),
         a.first_at, a.last_at,
         left(coalesce(t.body, ''), 160), t.media_kind
  from agg a
  left join dialled d on d.l10 = a.l10
  left join tail t on t.peer_phone = a.peer_phone
  left join public.contacts ct on ct.id = a.cid
  order by a.last_at desc
  limit 2000;
end
$function$;
