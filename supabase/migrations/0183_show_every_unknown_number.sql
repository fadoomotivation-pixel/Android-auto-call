-- Every unknown number, not just this month's.
--
-- The first version of this capped at a rolling window because a supervision
-- screen is about now. Then a rep lost WhatsApp off her phone and this table
-- became the only surviving list of who she talks to — and it was quietly
-- hiding most of them behind a date cut nobody had asked for.
--
-- p_days = 0 (the new default) means all time. A caller that still wants a
-- window passes one; nothing else changes.
--
-- Ranking changed too. Sorting by message count puts the chattiest stranger on
-- top; sorting by how many times the rep DIALLED the number puts the people
-- who are obviously leads-in-all-but-name on top, which is the whole point of
-- the screen.
--
-- Applied by hand to production before this file existed.

create or replace function public.super_rep_unknown_numbers(p_rep uuid, p_days integer default 0)
returns table(
  peer_phone text, peer_name text, messages integer, they_sent integer,
  rep_sent integer, calls integer,
  first_seen timestamp with time zone, last_seen timestamp with time zone
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;

  return query
  with msgs as (
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
         (select count(*) from public.call_logs cl
           where cl.salesperson_id = p_rep
             and right(regexp_replace(cl.phone, '\D', '', 'g'), 10) = x.l10)::int,
         x.first_at, x.last_at
  from msgs x
  order by (select count(*) from public.call_logs cl
             where cl.salesperson_id = p_rep
               and right(regexp_replace(cl.phone, '\D', '', 'g'), 10) = x.l10) desc,
           x.total desc
  limit 1000;
end
$function$;
