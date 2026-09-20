-- The sentence the rep said out loud, and whether anything happened next.
--
-- WHAT THE DATA SAYS, COUNTED TODAY
--
--   217 leads had a real recorded conversation
--    82 of them talked about a SITE VISIT on that call
--    11 ever reached the site-visit stage
--    76 talked about a visit and never got there
--    70 of the 82 got ZERO WhatsApp after that call — no address, no photo,
--       no "Sunday 11 baje theek hai?". Not one line.
--
-- That is not a lead-quality problem and it is not a pitch problem. A buyer
-- agreed to come and see a flat, and then the person who asked them simply
-- never followed through. Nothing in this product — or in any CRM — noticed,
-- because noticing requires holding three things at once:
--
--   the RECORDING   to know what was promised, and when
--   the WHATSAPP    to know whether it was delivered
--   the CRM         to know whether the lead moved
--
-- Call Pro AI is the only place where all three sit in one database. This
-- migration is what that is FOR.
--
-- HOW A PROMISE IS SETTLED
--
-- Not by asking the rep. A promise is kept when there is EVIDENCE on another
-- channel, found by plain SQL that anyone can re-run and check:
--
--   send         an outbound WhatsApp after the call carrying a file or a link
--   visit        site_visit_at or site_visit_arrived_at set after the call
--   price_check  a later connected call back, or an outbound WhatsApp
--
-- No model decides whether a rep did her job. The model only reads what was
-- SAID; the database decides what was DONE.
--
-- WHY THERE IS NO 'callback' KIND
--
-- "Main kal phone karta hoon" is already owned by the follow-up clock, and
-- CLAUDE.md is explicit that a second scheduler is how this turns into spam.
-- Three kinds only, and every one of them is something nothing in this app
-- tracks today.
--
-- WHY THIS IS PER CALL AND NOT FOLDED INTO lead_memory
--
-- lead_memory (0209) reads the same transcripts for one distilled memory per
-- LEAD, and riding along inside its Groq call would have been free. It cannot
-- work: a promise needs the timestamp of the call it was made on, because the
-- whole question is whether anything happened in the 24 hours AFTER it. One
-- memory per lead has no said_at to measure from.
--
-- THE RULE THAT MATTERS MOST
--
-- A promise this system invents is an accusation against a telecaller for
-- something she never said. The extractor is told, twice, that finding nothing
-- is the correct answer on a garbled transcript, and every row carries the
-- rep's own words in `quote` so any dispute is settled by reading it.
--
-- APPLIED TO PRODUCTION BY HAND on 2026-09-20.

create table if not exists public.lead_promises (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  salesperson_id uuid references public.profiles(id) on delete set null,
  -- Which recording this came out of. Kept so a disputed promise can always be
  -- listened to rather than argued about.
  call_id uuid not null references public.call_logs(id) on delete cascade,
  kind text not null check (kind in ('send', 'visit', 'price_check')),
  -- What was promised, in the rep's language, short enough for a lead row.
  promise text not null,
  -- The rep's own words from the transcript. The evidence.
  quote text,
  said_at timestamptz not null,
  -- When it stops being "in progress" and starts being a dropped ball.
  due_by timestamptz not null,
  status text not null default 'open' check (status in ('open', 'kept', 'missed')),
  kept_at timestamptz,
  kept_by text check (kept_by in ('whatsapp', 'call', 'visit_booked', 'visit_done')),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  -- One promise of each kind per call. A rep who says "bhej deta hoon" three
  -- times in six minutes made one promise, not three.
  unique (call_id, kind)
);

comment on table public.lead_promises is
  'What a telecaller committed to on a recorded call, and whether the other channels show it was delivered. Extracted from transcripts by promise-watch; settled by settle_promises() using WhatsApp, later calls and the site-visit fields — never by asking the rep.';

create index if not exists lead_promises_company_idx on public.lead_promises (company_id, status, kind);
create index if not exists lead_promises_rep_idx on public.lead_promises (salesperson_id, status);
create index if not exists lead_promises_contact_idx on public.lead_promises (contact_id, status, said_at);

alter table public.lead_promises enable row level security;

drop policy if exists lead_promises_select on public.lead_promises;
create policy lead_promises_select on public.lead_promises
  for select using (
    is_super_admin()
    or (company_id = current_company_id() and (is_admin() or salesperson_id = auth.uid()))
  );

-- Which calls have already been read. A call with no promise in it must never
-- be read twice — most calls contain none, and re-reading them is the whole
-- cost of this feature.
create table if not exists public.promise_scans (
  call_id uuid primary key references public.call_logs(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  found integer not null default 0
);

comment on table public.promise_scans is
  'Calls promise-watch has already read, so a transcript containing no promise is never paid for twice.';

alter table public.promise_scans enable row level security;

-- ─────────────────────────────────────────────────────────────────────────
-- Which recordings to read next.
--
-- Newest first, and only real conversations: of 3,158 transcripts on this
-- platform, 722 clear 400 characters and the rest are "hello… hello?". A
-- promise cannot be made in a ring-out.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.promise_candidates(p_limit integer default 12)
returns table(call_id uuid, contact_id uuid, company_id uuid, salesperson_id uuid, started_at timestamptz)
language sql stable security definer set search_path to 'public'
as $function$
  select l.id, l.contact_id, l.company_id, l.salesperson_id, l.started_at
  from public.call_logs l
  join public.contacts c on c.id = l.contact_id
  left join public.promise_scans s on s.call_id = l.id
  where s.call_id is null
    and l.contact_id is not null
    and l.company_id is not null
    and coalesce(l.off_crm, false) = false
    and l.transcript is not null
    and length(l.transcript) >= 400
  order by l.started_at desc
  limit greatest(p_limit, 1);
$function$;

comment on function public.promise_candidates(integer) is
  'Recorded conversations not yet read for promises, newest first.';

revoke all on function public.promise_candidates(integer) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Did anything actually happen?
--
-- Four plain statements, deliberately not one clever query: each is small
-- enough that a founder who does not trust the number can read the SQL that
-- produced it. A promise is only ever marked kept by evidence on a DIFFERENT
-- channel from the one it was made on.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.settle_promises()
returns integer
language plpgsql security definer set search_path to 'public'
as $function$
declare
  n_kept integer := 0;
  n_missed integer := 0;
  n integer;
begin
  -- 1. "Main bhej deta hoon" — kept by a WhatsApp that carried SOMETHING.
  --    A bare "ji namaste" after the call is not the floor plan. A file or a
  --    link is; that is the same test v_rep_whatsapp_daily already uses for
  --    "details shared" (migration 0168).
  update public.lead_promises p
     set status = 'kept',
         kept_by = 'whatsapp',
         settled_at = now(),
         kept_at = (
           select min(w.sent_at) from public.wa_observed_messages w
            where w.contact_id = p.contact_id and w.direction = 'out'
              and w.archived_at is null and w.sent_at > p.said_at
              and (w.media_kind is not null or w.body ilike '%http%'))
   where p.status <> 'kept' and p.kind = 'send'
     and exists (
       select 1 from public.wa_observed_messages w
        where w.contact_id = p.contact_id and w.direction = 'out'
          and w.archived_at is null and w.sent_at > p.said_at
          and (w.media_kind is not null or w.body ilike '%http%'));
  get diagnostics n = row_count; n_kept := n_kept + n;

  -- 2. A visit agreed on the phone is kept when it reaches the diary — or, far
  --    better, when they turned up. Both count; arriving wins the label.
  update public.lead_promises p
     set status = 'kept',
         kept_by = case
           when (select c.site_visit_arrived_at >= p.said_at from public.contacts c where c.id = p.contact_id)
           then 'visit_done' else 'visit_booked' end,
         settled_at = now(),
         kept_at = (select least(
                      coalesce(c.site_visit_arrived_at, 'infinity'::timestamptz),
                      coalesce(c.site_visit_at, 'infinity'::timestamptz))
                    from public.contacts c where c.id = p.contact_id)
   where p.status <> 'kept' and p.kind = 'visit'
     and exists (
       select 1 from public.contacts c
        where c.id = p.contact_id
          and (c.site_visit_at >= p.said_at or c.site_visit_arrived_at >= p.said_at));
  get diagnostics n = row_count; n_kept := n_kept + n;

  -- 3. "Manager se baat karke batata hoon" is delivered by TALKING. A connected
  --    call back settles it; twenty seconds is the same floor the rest of this
  --    product uses to separate a conversation from a ring-out.
  update public.lead_promises p
     set status = 'kept',
         kept_by = 'call',
         settled_at = now(),
         kept_at = (
           select min(l.started_at) from public.call_logs l
            where l.contact_id = p.contact_id and l.started_at > p.said_at
              and coalesce(l.off_crm, false) = false
              and coalesce(l.duration_seconds, 0) >= 20)
   where p.status <> 'kept' and p.kind = 'price_check'
     and exists (
       select 1 from public.call_logs l
        where l.contact_id = p.contact_id and l.started_at > p.said_at
          and coalesce(l.off_crm, false) = false
          and coalesce(l.duration_seconds, 0) >= 20);
  get diagnostics n = row_count; n_kept := n_kept + n;

  -- …or by writing the answer down.
  update public.lead_promises p
     set status = 'kept',
         kept_by = 'whatsapp',
         settled_at = now(),
         kept_at = (
           select min(w.sent_at) from public.wa_observed_messages w
            where w.contact_id = p.contact_id and w.direction = 'out'
              and w.archived_at is null and w.sent_at > p.said_at
              and coalesce(btrim(w.body), '') <> '')
   where p.status <> 'kept' and p.kind = 'price_check'
     and exists (
       select 1 from public.wa_observed_messages w
        where w.contact_id = p.contact_id and w.direction = 'out'
          and w.archived_at is null and w.sent_at > p.said_at
          and coalesce(btrim(w.body), '') <> '');
  get diagnostics n = row_count; n_kept := n_kept + n;

  -- 4. Out of time. Only now does it become a dropped ball — a rep gets her
  --    window before this system says a word about her.
  update public.lead_promises p
     set status = 'missed', settled_at = now()
   where p.status = 'open' and now() >= p.due_by;
  get diagnostics n = row_count; n_missed := n;

  return n_kept + n_missed;
end;
$function$;

comment on function public.settle_promises() is
  'Marks promises kept using evidence from WhatsApp, later calls and the site-visit fields, then times out the rest. No model and no rep self-report is involved.';

revoke all on function public.settle_promises() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- What is still owed, for the rep and the report.
-- security_invoker so a telecaller sees her own and a super admin sees all —
-- the same rule every other row in this database follows.
-- ─────────────────────────────────────────────────────────────────────────
drop view if exists public.v_open_promises;
create view public.v_open_promises with (security_invoker = on) as
select p.id,
       p.company_id,
       p.contact_id,
       p.salesperson_id,
       p.kind,
       p.promise,
       p.quote,
       p.said_at,
       p.due_by,
       p.status,
       c.name as lead_name,
       c.phone as lead_phone,
       c.stage,
       s.is_terminal,
       greatest(0, floor(extract(epoch from (now() - p.said_at)) / 86400))::int as days_open
from public.lead_promises p
join public.contacts c on c.id = p.contact_id
join public.lead_stages s on s.code = c.stage
where p.status in ('open', 'missed');

comment on view public.v_open_promises is
  'Promises made on a recorded call that the other channels show were never delivered.';

grant select on public.v_open_promises to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- The company-wide version: the bridge between "they said yes" and "they came".
-- ─────────────────────────────────────────────────────────────────────────
create or replace view public.v_company_promises as
select p.company_id,
       p.kind,
       count(*)::int as made,
       count(*) filter (where p.status = 'kept')::int as kept,
       count(*) filter (where p.status = 'missed')::int as missed,
       count(*) filter (where p.status = 'open')::int as still_open,
       -- The ones where we dropped the ball AND the lead is now dead. The most
       -- expensive sentence in this whole database.
       count(*) filter (where p.status = 'missed' and s.is_terminal)::int as missed_on_lost,
       count(distinct p.contact_id) filter (where p.status = 'missed')::int as leads_missed,
       (array_agg(p.promise order by p.said_at)
          filter (where p.status = 'missed'))[1] as oldest_missed,
       min(p.said_at) filter (where p.status = 'missed') as oldest_missed_at
from public.lead_promises p
join public.contacts c on c.id = p.contact_id
join public.lead_stages s on s.code = c.stage
group by 1, 2;

comment on view public.v_company_promises is
  'Promises made on calls, by kind: how many were delivered on another channel and how many were not. The visit row is the site-visit funnel this company has never been able to see.';

-- ─────────────────────────────────────────────────────────────────────────
-- A broken promise is a lead to call TODAY.
--
-- The same move migration 0206 made for a buyer left waiting on WhatsApp, and
-- for the same reason: the app must not hold a fact this important and leave
-- the rep to rediscover it. It sits BELOW the buyer-waiting rule (a person who
-- wrote to you outranks a note about yourself) and ABOVE due_today, because a
-- promise you broke outranks a time you wrote in a diary.
--
-- Only 'missed' feeds it, never 'open'. A rep who ended a call four minutes ago
-- is not behind on anything.
--
-- Columns are APPENDED. create-or-replace cannot insert one in the middle, and
-- this view is joined by v_lead_workstate, which the phone reads.
-- ─────────────────────────────────────────────────────────────────────────
create or replace view public.v_lead_action_state as
 with nxt as (
   select f.contact_id, min(f.due_at) as due_at
   from public.follow_ups f
   where f.completed_at is null
   group by f.contact_id
 )
 select c.id as contact_id,
    n.due_at,
    case
      when s.is_terminal then 'none'
      when n.due_at is not null and n.due_at < (date_trunc('day', timezone('Asia/Kolkata', now())) at time zone 'Asia/Kolkata') then 'overdue'
      when n.due_at is not null and n.due_at <= now() then 'call_now'
      when c.last_inbound_at is not null
       and c.last_inbound_at > coalesce(c.last_reply_at, '-infinity'::timestamptz)
       and c.last_inbound_at > coalesce(c.last_contacted_at, '-infinity'::timestamptz)
       and c.last_inbound_at < (now() - interval '30 minutes') then 'call_now'
      when pr.said_at is not null then 'call_now'
      when n.due_at is not null and timezone('Asia/Kolkata', n.due_at)::date = timezone('Asia/Kolkata', now())::date then 'due_today'
      when n.due_at is not null then 'scheduled'
      when c.stage = 'new' then 'call_now'
      when c.handled_at is null and c.assigned_at is not null and (c.last_contacted_at is null or c.assigned_at > c.last_contacted_at) then 'call_now'
      when (c.status = any (array['no_answer'::contact_status, 'busy'::contact_status, 'wrong_person'::contact_status, 'callback'::contact_status, 'follow_up'::contact_status, 'queued'::contact_status]))
       and (c.handled_at is null or timezone('Asia/Kolkata', c.handled_at)::date < timezone('Asia/Kolkata', now())::date) then 'call_now'
      when c.site_visit_at is not null and c.site_visit_at > now() then 'awaiting_visit'
      else 'no_next_step'
    end as action_state,
    case
      when c.last_inbound_at is not null
       and c.last_inbound_at > coalesce(c.last_reply_at, '-infinity'::timestamptz)
       and c.last_inbound_at > coalesce(c.last_contacted_at, '-infinity'::timestamptz)
       and c.last_inbound_at < (now() - interval '30 minutes') then c.last_inbound_at
      else null::timestamptz
    end as waiting_since,
    pr.said_at as promise_due_since,
    pr.promise as promise_text
   from public.contacts c
     join public.lead_stages s on s.code = c.stage
     left join nxt n on n.contact_id = c.id
     left join lateral (
       -- THREE WEEKS, AND THAT LIMIT IS THE FEATURE.
       --
       -- 325 recorded conversations are waiting to be read. Without a window,
       -- the first full scan would drop two hundred ancient broken promises
       -- into Call now on a Monday morning, the rep would swipe the whole tab
       -- away, and the one promise she broke yesterday would go with it.
       -- The founder's report still counts every one of them; only the phone
       -- is kept to what can still be fixed.
       select p.said_at, p.promise
       from public.lead_promises p
       where p.contact_id = c.id and p.status = 'missed'
         and p.said_at > now() - interval '21 days'
       order by p.said_at
       limit 1
     ) pr on true;

create or replace view public.v_lead_workstate as
 select c.id as contact_id,
    c.company_id, c.salesperson_id, c.name, c.phone,
    c.status as disposition, c.stage,
    s.label as stage_label, s.short_label as stage_short_label, s.color as stage_color,
    s.sort_order as stage_sort, s.outcome, s.is_terminal, s.is_pipeline, s.is_advanced,
    s.counts_as_sale, s.rep_visible, s.analytics_visible,
    a.action_state, a.due_at,
    c.site_visit_at, c.created_at, c.last_contacted_at, c.handled_at, c.temperature,
    lc.last_call_at, lc.last_call_seconds, lc.calls_total,
    a.due_at is not null and timezone('Asia/Kolkata', a.due_at)::date = timezone('Asia/Kolkata', now())::date as is_due_today,
    timezone('Asia/Kolkata', c.handled_at)::date = timezone('Asia/Kolkata', now())::date as handled_today,
    a.waiting_since,
    a.promise_due_since,
    a.promise_text
   from public.contacts c
     join public.lead_stages s on s.code = c.stage
     join public.v_lead_action_state a on a.contact_id = c.id
     left join lateral (
       select cl.started_at as last_call_at,
              coalesce(cl.duration_seconds, 0) as last_call_seconds,
              (select count(*)::integer from public.call_logs x
                where x.contact_id = c.id and coalesce(x.off_crm, false) = false) as calls_total
       from public.call_logs cl
       where cl.contact_id = c.id and coalesce(cl.off_crm, false) = false
       order by cl.started_at desc
       limit 1) lc on true;
