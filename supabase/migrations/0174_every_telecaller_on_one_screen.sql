-- Every telecaller on the platform, one screen, worst first.
--
-- The super admin's question — "who is not working?" — does not stop at a
-- company boundary. Platform HQ and the leaks page both make you pick a company
-- first, so answering it meant opening eight pages and holding the comparison in
-- your head. The finding that mattered (two reps at Manas property with a
-- hundred leads each and not one call between them) was two clicks deep in one.
--
-- PHONE AND WHATSAPP IN THE SAME ROW, because neither is fair alone. Ankita's
-- WhatsApp reads zero and she made 578 calls in seven days — the most of anyone
-- on this platform. A screen showing only WhatsApp would have accused the
-- hardest-working rep here of doing nothing.
--
-- wa_watch is coalesced OUTSIDE the subquery: a scalar subquery with no row is
-- NULL, not the 'none' the CASE would produce, and "not connected" versus "we
-- do not know" is exactly the distinction this feature exists to preserve.
create or replace function public.super_rep_activity(p_days int default 7)
returns table (
  company_id      uuid,
  company_name    text,
  rep_id          uuid,
  rep_name        text,
  is_active       boolean,
  leads_assigned  int,
  calls           int,
  connected_calls int,
  talk_seconds    int,
  last_call_at    timestamptz,
  wa_messages     int,
  wa_leads        int,
  wa_details      int,
  wa_replies      int,
  wa_calls        int,
  wa_watch        text,
  wa_offbook      int,
  silent          boolean
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare since timestamptz := now() - make_interval(days => greatest(p_days, 1));
declare since_ist date := (now() - make_interval(days => greatest(p_days, 1)) at time zone 'Asia/Kolkata')::date;
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;

  return query
  select
    c.id, c.name, p.id, p.full_name, coalesce(p.is_active, true),
    (select count(*) from public.contacts ct where ct.salesperson_id = p.id)::int,
    (select count(*) from public.call_logs l
       where l.salesperson_id = p.id and coalesce(l.started_at, l.created_at) >= since)::int,
    (select count(*) from public.call_logs l
       where l.salesperson_id = p.id and coalesce(l.started_at, l.created_at) >= since
         and l.outcome = 'connected')::int,
    coalesce((select sum(l.duration_seconds) from public.call_logs l
       where l.salesperson_id = p.id and coalesce(l.started_at, l.created_at) >= since), 0)::int,
    (select max(coalesce(l.started_at, l.created_at)) from public.call_logs l
       where l.salesperson_id = p.id),
    coalesce((select sum(d.messages_sent) from public.v_rep_whatsapp_daily d
       where d.salesperson_id = p.id and d.day_ist >= since_ist), 0)::int,
    coalesce((select sum(d.leads_messaged) from public.v_rep_whatsapp_daily d
       where d.salesperson_id = p.id and d.day_ist >= since_ist), 0)::int,
    coalesce((select sum(d.leads_given_details) from public.v_rep_whatsapp_daily d
       where d.salesperson_id = p.id and d.day_ist >= since_ist), 0)::int,
    coalesce((select sum(d.leads_who_replied) from public.v_rep_whatsapp_daily d
       where d.salesperson_id = p.id and d.day_ist >= since_ist), 0)::int,
    (select count(*) from public.wa_observed_calls k
       where k.salesperson_id = p.id and k.started_at >= since)::int,
    coalesce((select case
       when s.last_seen_at is null or s.last_seen_at < now() - interval '2 hours' then 'stale'
       else 'ok' end
     from public.wa_rep_sessions s where s.salesperson_id = p.id), 'none'),
    coalesce((select sum(a.unmatched) from public.wa_rep_activity_daily a
       where a.salesperson_id = p.id and a.day_ist >= since_ist), 0)::int,
    -- Silent means nothing recorded ANYWHERE. Deliberately generous — this is
    -- the row a founder gets telephoned about, so it should be hard to earn.
    (not exists (select 1 from public.call_logs l
        where l.salesperson_id = p.id and coalesce(l.started_at, l.created_at) >= since))
    and coalesce((select sum(d.messages_sent) from public.v_rep_whatsapp_daily d
        where d.salesperson_id = p.id and d.day_ist >= since_ist), 0) = 0
    and not exists (select 1 from public.wa_observed_calls k
        where k.salesperson_id = p.id and k.started_at >= since)
  from public.profiles p
  join public.companies c on c.id = p.company_id
  where p.role = 'salesperson'
  order by 18 desc, 7 asc, 11 asc, 2, 4;
end
$function$;

revoke all on function public.super_rep_activity(int) from public, anon;
grant execute on function public.super_rep_activity(int) to authenticated;

-- The evidence, when a number is not enough. "Ankita sent nothing" is a claim;
-- the conversation is proof, and a founder being complained to will ask for it.
create or replace function public.super_rep_threads(p_rep uuid, p_limit int default 200)
returns table (
  contact_id uuid, lead_name text, lead_phone text, stage text,
  direction text, body text, media_kind text, file_name text,
  shared_details boolean, read_at timestamptz, sent_at timestamptz
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;

  return query
  select m.contact_id, ct.name, ct.phone, ct.stage,
         m.direction, m.body, m.media_kind, m.file_name,
         m.shared_details, m.read_at, m.sent_at
  from public.wa_observed_messages m
  join public.contacts ct on ct.id = m.contact_id
  where m.salesperson_id = p_rep
  order by m.sent_at desc
  limit greatest(p_limit, 1);
end
$function$;

revoke all on function public.super_rep_threads(uuid, int) from public, anon;
grant execute on function public.super_rep_threads(uuid, int) to authenticated;
