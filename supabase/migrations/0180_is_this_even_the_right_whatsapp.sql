-- "Connected" is not the same as "watching the right number", and for four
-- days this product could not tell the difference.
--
-- Ankita's card read Connected, green, with a real WhatsApp number attached.
-- Her history synced: 13,289 messages, 348 people, a year deep. And her lead
-- pages stayed empty, because not ONE of those 348 numbers is a lead in her
-- company — while she has called 427 numbers that are. Her most-called lead has
-- 79 calls and zero WhatsApp messages.
--
-- Nothing was broken. match_wa_contact is correct, the sync is correct, the
-- normalisation is correct — all verified against production. The number she
-- linked is simply not the number she talks to buyers on. Reps in this market
-- routinely carry two: the company SIM they dial from, and a WhatsApp Business
-- on their own handset.
--
-- The defect is that the CRM had no way to SAY that. It showed green and a big
-- zero and left a founder to conclude the feature was broken, then ask a
-- telecaller to re-scan a QR over and over for something re-scanning could
-- never fix. This is the number that ends that: how much of what this rep does
-- on WhatsApp is with the leads they are actually assigned.

create or replace function public.super_rep_wa_fit(p_rep uuid)
returns table (
  leads_called          int,  -- distinct CRM leads this rep has dialled
  numbers_whatsapped    int,  -- distinct people on the linked WhatsApp
  overlap               int,  -- of those, how many are CRM leads
  called_and_messaged   int,  -- dialled AND messaged, but NOT in the CRM
  wa_number             text
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v_company uuid;
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;

  select company_id into v_company from public.profiles where id = p_rep;

  return query
  with called as (
    select distinct right(regexp_replace(cl.phone, '\D', '', 'g'), 10) as l10
    from public.call_logs cl
    where cl.salesperson_id = p_rep and cl.phone is not null
  ),
  leads as (
    select distinct right(regexp_replace(c.phone, '\D', '', 'g'), 10) as l10
    from public.contacts c
    where c.company_id = v_company and c.phone is not null
  ),
  wa as (
    select distinct right(regexp_replace(m.peer_phone, '\D', '', 'g'), 10) as l10
    from public.wa_observed_messages m
    where m.salesperson_id = p_rep and m.peer_phone is not null
  )
  select
    (select count(*) from called join leads using (l10))::int,
    (select count(*) from wa)::int,
    (select count(*) from wa join leads using (l10))::int,
    -- THE MOST VALUABLE NUMBER ON THIS SCREEN. Someone the rep both rang and
    -- messaged is a working relationship by any definition, and if they are not
    -- in the CRM then the company is running that relationship on one person's
    -- phone and would lose it the day they leave.
    (select count(*) from wa join called using (l10)
       where l10 not in (select l10 from leads))::int,
    (select s.wa_number from public.wa_rep_sessions s where s.salesperson_id = p_rep);
end
$function$;

revoke all on function public.super_rep_wa_fit(uuid) from public, anon;
grant execute on function public.super_rep_wa_fit(uuid) to authenticated;

-- The unknown-numbers list, re-ranked around the thing that actually predicts a
-- lead: did the rep also RING this number? A number they only messaged could be
-- anyone. A number they rang eleven times AND message is a person they are
-- working, and its absence from the CRM is the finding.
drop function if exists public.super_rep_unknown_numbers(uuid, int);

create or replace function public.super_rep_unknown_numbers(p_rep uuid, p_days int default 7)
returns table (
  peer_phone text,
  peer_name text,
  messages int,
  they_sent int,
  rep_sent int,
  calls int,
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
      and m.sent_at >= now() - make_interval(days => greatest(p_days, 1))
    group by m.peer_phone
  )
  select x.peer_phone, x.nm, x.total, x.inbound, x.outbound,
         (select count(*) from public.call_logs cl
           where cl.salesperson_id = p_rep
             and right(regexp_replace(cl.phone, '\D', '', 'g'), 10) = x.l10)::int,
         x.first_at, x.last_at
  from msgs x
  -- Called AND messaged first, then by how much they talked. A founder reading
  -- this from the top is reading their uncaptured pipeline.
  order by (select count(*) from public.call_logs cl
             where cl.salesperson_id = p_rep
               and right(regexp_replace(cl.phone, '\D', '', 'g'), 10) = x.l10) desc,
           x.total desc
  limit 200;
end
$function$;

revoke all on function public.super_rep_unknown_numbers(uuid, int) from public, anon;
grant execute on function public.super_rep_unknown_numbers(uuid, int) to authenticated;
