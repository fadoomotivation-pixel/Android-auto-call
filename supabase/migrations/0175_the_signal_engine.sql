-- The WhatsApp signal engine: turn stored-but-unread text into action.
--
-- Every company-SIM conversation has been saved since 0173. Nobody was reading
-- it — a message sat in wa_observed_messages exactly as read as a message that
-- was never captured at all. This is the cheapest possible fix: classify each
-- INCOMING message the moment it lands, with plain keyword rules (English +
-- the Hinglish a real buyer actually types), into 'hot' (ready to move — book,
-- token, site visit, price, confirm) or 'risk' (about to walk — cancel,
-- competitor, too expensive, stop calling) or neither. No AI call, no per-
-- message cost, ships today. AI-scored refinement for the messages rules can't
-- confidently place is a deliberate next step, layered onto this column later
-- — never a second classification system.
--
-- RISK IS CHECKED FIRST. "Cancel my booking" contains "booking" but is not
-- good news; a buyer walking away must never be filed under the same badge as
-- a buyer ready to pay.

alter table public.wa_observed_messages
  add column if not exists signal text
    check (signal is null or signal in ('hot', 'risk'));

create index if not exists wa_observed_messages_signal_idx
  on public.wa_observed_messages (salesperson_id, signal)
  where signal is not null;

create or replace function public.wa_classify_signal(p_body text)
returns text
language sql
immutable
as $function$
  select case
    when p_body is null or btrim(p_body) = '' then null
    when p_body ~* ('(cancel|not\s*interested|nahi\s*chahiye|no\s*longer\s*interested|' ||
      'already\s*(booked|purchased|finalized|book\s*kar\s*liya)|' ||
      'other\s*(builder|project|company|site)|another\s*(builder|project)|competitor|' ||
      'refund|stop\s*calling|do\s*not\s*call|don''t\s*call|mat\s*karo|' ||
      'zyada\s*mehnga|too\s*expensive|out\s*of\s*(budget|range)|budget\s*se\s*zyada|' ||
      'busy\s*hu|abhi\s*nahi|not\s*(able|possible)|won''t\s*be\s*able|nahi\s*ho\s*payega|' ||
      'trust\s*nahi|fraud|complaint|not\s*genuine)') then 'risk'
    when p_body ~* ('(book(ing)?\s*(kar|confirm)|\btoken\b|advance\s*(de|pay)|site\s*visit|' ||
      'visit\s*(karna|karenge|fix|chahiye)|price\s*list|quote\s*(bhejo|do)|payment\s*plan|' ||
      '\bemi\b|loan\s*(chahiye|process)|ready\s*to\s*(buy|book|pay)|' ||
      'send\s*(location|details|brochure)|kab\s*(dekh|visit)|confirm\s*kar|finalize|' ||
      'interested\s*hu|final\s*price|best\s*price|\bdiscount\b|advance\s*bhej)') then 'hot'
    else null
  end;
$function$;

create or replace function public.wa_observed_messages_classify()
returns trigger
language plpgsql
as $function$
begin
  if new.direction = 'in' then
    new.signal := public.wa_classify_signal(new.body);
  else
    new.signal := null;
  end if;
  return new;
end
$function$;

drop trigger if exists wa_observed_messages_classify_trg on public.wa_observed_messages;
create trigger wa_observed_messages_classify_trg
  before insert or update of body, direction on public.wa_observed_messages
  for each row execute function public.wa_observed_messages_classify();

-- Backfill: every incoming message already sitting in the table gets tagged
-- retroactively — this is a pure read of text already stored, not a new import.
update public.wa_observed_messages
set signal = public.wa_classify_signal(body)
where direction = 'in' and signal is distinct from public.wa_classify_signal(body);

-- Counts per rep per IST day — same shape as v_rep_whatsapp_daily, so it slots
-- into super_rep_activity and pulse.ts the same way that view already does.
create or replace view public.v_wa_signals_daily as
select
  m.company_id,
  m.salesperson_id,
  ((m.sent_at at time zone 'Asia/Kolkata'))::date as day_ist,
  count(*) filter (where m.signal = 'hot') as hot_count,
  count(*) filter (where m.signal = 'risk') as risk_count,
  count(distinct m.contact_id) filter (where m.signal = 'hot') as hot_leads,
  count(distinct m.contact_id) filter (where m.signal = 'risk') as risk_leads
from public.wa_observed_messages m
where m.signal is not null
group by m.company_id, m.salesperson_id, (((m.sent_at at time zone 'Asia/Kolkata'))::date);

-- The one message worth quoting: most recent hit per rep, per signal, per day.
-- "Devansh said 'humein doosra builder mil gaya' 40 min ago" is the sentence
-- that gets a founder to actually call the rep — a bare count never does.
create or replace view public.v_wa_signal_hits as
select * from (
  select
    m.company_id,
    m.salesperson_id,
    m.contact_id,
    c.name as lead_name,
    c.phone as lead_phone,
    m.signal,
    m.body,
    m.sent_at,
    ((m.sent_at at time zone 'Asia/Kolkata'))::date as day_ist,
    row_number() over (
      partition by m.salesperson_id, m.signal, ((m.sent_at at time zone 'Asia/Kolkata'))::date
      order by m.sent_at desc
    ) as rn
  from public.wa_observed_messages m
  join public.contacts c on c.id = m.contact_id
  where m.signal is not null
) ranked
where rn = 1;

-- super_rep_activity and super_rep_threads both change shape (new output
-- columns), which Postgres will not let CREATE OR REPLACE do — drop first.
drop function if exists public.super_rep_activity(int);
drop function if exists public.super_rep_threads(uuid, int);

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
  silent          boolean,
  wa_hot          int,
  wa_risk         int
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

revoke all on function public.super_rep_activity(int) from public, anon;
grant execute on function public.super_rep_activity(int) to authenticated;

create or replace function public.super_rep_threads(p_rep uuid, p_limit int default 200)
returns table (
  contact_id uuid, lead_name text, lead_phone text, stage text,
  direction text, body text, media_kind text, file_name text,
  shared_details boolean, read_at timestamptz, sent_at timestamptz,
  signal text
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
         m.shared_details, m.read_at, m.sent_at, m.signal
  from public.wa_observed_messages m
  join public.contacts ct on ct.id = m.contact_id
  where m.salesperson_id = p_rep
  order by m.sent_at desc
  limit greatest(p_limit, 1);
end
$function$;

revoke all on function public.super_rep_threads(uuid, int) from public, anon;
grant execute on function public.super_rep_threads(uuid, int) to authenticated;
