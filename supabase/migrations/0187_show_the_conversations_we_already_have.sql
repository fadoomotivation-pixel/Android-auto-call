-- Thirteen thousand conversations, stored, and no screen that shows them.
--
-- WHAT THE FOUNDER SEES
--
-- Ankita's page reads: "445 calls, 3h 56m talk, 0 WhatsApp messages in 7 days"
-- and "No WhatsApp conversations with this company's leads". Both are true and
-- together they say something false, because the database holds 13,289 of her
-- messages across 348 people right now.
--
-- Two filters hide them, and each looked reasonable on its own:
--
--   * EVERY panel on that screen is windowed to the selected range, default 7
--     days. Her archive is a history sync from 30 August, so at any range
--     under about three weeks the whole thing is invisible.
--   * The conversation panel only shows peers matched to a LEAD of the
--     company. Her linked number has an overlap of exactly zero with Fanbe's
--     leads — that is the long-standing finding about reps carrying two
--     numbers — so it is empty by construction.
--
-- The one panel that would have shown them, the unknown-numbers table, is a
-- list of phone numbers. It answers "who is uncaptured", not "show me the
-- chats", and it is the only route to a conversation that is not a lead.
--
-- So: one row per person this rep has ever talked to, lead or not, with no
-- window at all, ordered by most recent. The screen can then offer what was
-- asked for — every conversation, openable — instead of three panels that each
-- report zero for a different reason.

create or replace function public.super_rep_conversations(p_rep uuid)
returns table(
  peer_phone text,
  peer_name text,
  lead_name text,
  contact_id uuid,
  messages integer,
  they_sent integer,
  rep_sent integer,
  calls integer,
  first_at timestamptz,
  last_at timestamptz,
  last_body text,
  last_media text
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;

  return query
  with agg as (
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
    where m.salesperson_id = p_rep
      and m.peer_phone is not null
    group by m.peer_phone
  ),
  -- The last thing said, which is what makes a list of phone numbers into a
  -- list of conversations someone can recognise.
  tail as (
    select distinct on (m.peer_phone)
           m.peer_phone, m.body, m.media_kind, m.direction
    from public.wa_observed_messages m
    where m.salesperson_id = p_rep
      and m.peer_phone is not null
    order by m.peer_phone, m.sent_at desc
  )
  select a.peer_phone,
         a.nm,
         ct.name,
         a.cid,
         a.total, a.inbound, a.outbound,
         (select count(*) from public.call_logs cl
           where cl.salesperson_id = p_rep
             and right(regexp_replace(cl.phone, '\D', '', 'g'), 10) = a.l10)::int,
         a.first_at, a.last_at,
         left(coalesce(t.body, ''), 160),
         t.media_kind
  from agg a
  left join tail t on t.peer_phone = a.peer_phone
  left join public.contacts ct on ct.id = a.cid
  order by a.last_at desc
  limit 2000;
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- And stop the same screen calling a live watcher stale.
--
-- wa_watch was derived from last_seen_at, which is stamped only when data
-- actually arrives. A rep whose WhatsApp is linked and healthy but who has not
-- messaged a lead recently therefore reported as 'stale', and the page printed
-- "Their watcher has not reported in over two hours, so this is UNKNOWN rather
-- than zero" over a connection that was confirmed up seconds earlier.
--
-- link_ok_at (migration 0186) is the field that answers this question: the
-- worker heartbeats every four minutes whether or not it has traffic. Fifteen
-- minutes is generous against a four-minute beat without being slow to notice a
-- real drop. last_seen_at remains the fallback for workers older than
-- 2026.09.10-13, which never heartbeat.

create or replace function public.super_rep_activity(p_days integer default 7)
returns table(
  company_id uuid, company_name text, rep_id uuid, rep_name text,
  is_active boolean, leads_assigned integer, calls integer,
  connected_calls integer, talk_seconds integer, last_call_at timestamptz,
  wa_messages integer, wa_leads integer, wa_details integer, wa_replies integer,
  wa_calls integer, wa_watch text, wa_offbook integer, silent boolean,
  wa_hot integer, wa_risk integer
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare since timestamptz := now() - make_interval(days => greatest(p_days, 1));
declare since_ist date := ((now() - make_interval(days => greatest(p_days, 1))) at time zone 'Asia/Kolkata')::date;
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
    -- The connection, not the traffic. See the note above.
    coalesce((select case
       when s.link_ok_at is not null then
         case when s.link_ok_at >= now() - interval '15 minutes'
                   and coalesce(s.status, '') = 'connected'
              then 'ok' else 'stale' end
       when s.last_seen_at is null or s.last_seen_at < now() - interval '2 hours' then 'stale'
       else 'ok' end
     from public.wa_rep_sessions s where s.salesperson_id = p.id), 'none'),
    coalesce((select sum(a.unmatched) from public.wa_rep_activity_daily a
       where a.salesperson_id = p.id and a.day_ist >= since_ist), 0)::int,
    (not exists (select 1 from public.call_logs l
        where l.salesperson_id = p.id and coalesce(l.started_at, l.created_at) >= since))
    and coalesce((select sum(d.messages_sent) from public.v_rep_whatsapp_daily d
        where d.salesperson_id = p.id and d.day_ist >= since_ist), 0) = 0
    and not exists (select 1 from public.wa_observed_calls k
        where k.salesperson_id = p.id and k.started_at >= since),
    coalesce((select sum(s.hot_count) from public.v_wa_signals_daily s
       where s.salesperson_id = p.id and s.day_ist >= since_ist), 0)::int,
    coalesce((select sum(s.risk_count) from public.v_wa_signals_daily s
       where s.salesperson_id = p.id and s.day_ist >= since_ist), 0)::int
  from public.profiles p
  join public.companies c on c.id = p.company_id
  where p.role = 'salesperson'
  order by 19 desc, 18 desc, 7 asc, 11 asc, 2, 4;
end
$function$;
