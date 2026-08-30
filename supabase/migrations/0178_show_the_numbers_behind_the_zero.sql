-- "The watcher saw 16 messages, but none were with a number in your CRM."
--
-- That sentence was the end of the road. It is true, it is the honest thing to
-- say, and it leaves a super admin with nowhere to go: which numbers? were they
-- buyers nobody captured? was the rep working or chatting? The answer already
-- sits in wa_observed_messages — every unmatched message keeps its peer_phone
-- and the name WhatsApp shows for it — and v_wa_unknown_numbers has grouped it
-- since 0173. Nothing ever read that view.
--
-- Unmatched traffic is the single most valuable thing this feature can surface:
-- a real buyer messaging a rep on a number nobody put in the CRM is a lead the
-- company is paying to generate and then losing. This is how it becomes visible.

create or replace function public.super_rep_unknown_numbers(p_rep uuid, p_days int default 7)
returns table (
  peer_phone text,
  peer_name text,
  messages int,
  they_sent int,
  rep_sent int,
  first_seen timestamptz,
  last_seen timestamptz
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;

  return query
  select m.peer_phone,
         max(m.peer_name) filter (where m.peer_name is not null),
         count(*)::int,
         count(*) filter (where m.direction = 'in')::int,
         count(*) filter (where m.direction = 'out')::int,
         min(m.sent_at),
         max(m.sent_at)
  from public.wa_observed_messages m
  where m.salesperson_id = p_rep
    and m.contact_id is null
    and m.peer_phone is not null
    and m.sent_at >= now() - make_interval(days => greatest(p_days, 1))
  group by m.peer_phone
  -- Busiest first: a number with thirty messages is a relationship, a number
  -- with one is probably a wrong dial. The founder should see the former.
  order by count(*) desc, max(m.sent_at) desc
  limit 200;
end
$function$;

revoke all on function public.super_rep_unknown_numbers(uuid, int) from public, anon;
grant execute on function public.super_rep_unknown_numbers(uuid, int) to authenticated;
