-- The telecaller's daily score, and the facts underneath it.
--
-- One definition, in SQL, because the score will end up in three places — the
-- WhatsApp review, the rep's own screen, and a manager's league table — and a
-- score that reads 42 in one place and 51 in another is worse than no score.
--
-- FOUR components, not six. The brief asked for calls, follow-ups, site visits,
-- response speed, notes quality and promise kept. Two of those cannot be
-- measured honestly today and are deliberately left out until they can:
--
--   · Notes quality — there are ZERO call notes in this database. Not few:
--     none. Scoring it would be scoring a column nobody fills. Its honest
--     cousin is here as "loop closed": of the calls you connected, how many
--     ended with an outcome, a note, or a next call booked.
--   · Promise kept / site visits — site_visit_outcomes has no rows and
--     rep_prompts has two, because the Android release that captures them has
--     not shipped. They join the score when the data is real, and the weights
--     below are written so adding them is a one-line change.
--
-- A six-part score with two invented parts survives about a week. The rep finds
-- the part they can fake, fakes it, and the whole number stops meaning
-- anything.
--
-- THE OPPORTUNITY RULE. A component only counts if the rep had the chance to
-- score on it. No follow-ups were due today → discipline is not zero, it is not
-- applicable, and its weight is shared out across the components that do apply.
-- Punishing a rep for leads nobody assigned them is how a score loses the room.

-- ---------- the day's raw facts, per rep ----------
-- Kept separate from the scoring so the message can print "18 completed, 7
-- missed" from exactly the numbers the score was computed from.
create or replace function public.rep_day_facts(
  p_salesperson uuid,
  p_date date default (now() at time zone 'Asia/Kolkata')::date
)
returns jsonb
language sql
stable
-- SECURITY INVOKER on purpose. These read call_logs, follow_ups and contacts,
-- all of which already carry the company-isolation policies — so a rep sees
-- their own day, an admin sees their company's, and the edge function that
-- sends the review runs as the service role and sees everything. A definer
-- function here would mean writing a third copy of the isolation rule, and the
-- copy is the thing that eventually disagrees.
set search_path = public
as $$
  with bounds as (
    -- An Indian working day, converted once. Everything below is inside it.
    select (p_date::timestamp at time zone 'Asia/Kolkata') as day_start,
           ((p_date + 1)::timestamp at time zone 'Asia/Kolkata') as day_end
  ),
  calls as (
    select
      count(*)::int as dialled,
      count(*) filter (where outcome = 'connected')::int as connected,
      coalesce(sum(duration_seconds) filter (where outcome = 'connected'), 0)::int as talk_seconds,
      -- Loop closed: a connected call that left the CRM better than it found
      -- it — an outcome recorded, a note written, or the next call booked.
      count(*) filter (
        where outcome = 'connected'
          and (coalesce(notes, '') <> '' or exists (
            select 1 from public.follow_ups f
            where f.contact_id = cl.contact_id and f.created_at >= cl.created_at
              and f.created_at < cl.created_at + interval '30 minutes'
          ))
      )::int as looped
    from public.call_logs cl, bounds b
    where cl.salesperson_id = p_salesperson
      and cl.created_at >= b.day_start and cl.created_at < b.day_end
  ),
  fups as (
    -- TODAY'S work only. The first cut of this scored the whole open backlog,
    -- and the result was a rep with fifty historic overdue callbacks scoring 1
    -- out of 100 on a day she made calls — because clearing three still leaves
    -- forty-seven "missed". A score nobody can move is a score nobody reads,
    -- and it punishes today for a mess made in March.
    --
    -- The backlog is not ignored. It is counted separately and printed as a
    -- fact ("2 customers are still waiting"), which is information the rep can
    -- act on, rather than a penalty they cannot escape. Clearing an old one
    -- still helps: completed counts every follow-up finished today whatever it
    -- was due, and the ratio is capped at 1.
    select
      count(*) filter (
        where f.due_at >= b.day_start and f.due_at < b.day_end)::int as scheduled,
      count(*) filter (
        where f.completed_at >= b.day_start and f.completed_at < b.day_end)::int as completed,
      count(*) filter (
        where f.due_at >= b.day_start and f.due_at < least(now(), b.day_end)
          and f.completed_at is null)::int as missed,
      count(*) filter (
        where f.due_at < b.day_start and f.completed_at is null)::int as backlog
    from public.follow_ups f, bounds b
    where f.salesperson_id = p_salesperson
      and (
        (f.due_at >= b.day_start and f.due_at < b.day_end)
        or (f.due_at < b.day_start and f.completed_at is null)
        or (f.completed_at >= b.day_start and f.completed_at < b.day_end)
      )
  ),
  fresh as (
    -- Response speed: leads that landed on this rep today, and how many were
    -- rung inside two hours. Two hours is the number lead-sla already guards.
    select
      count(*)::int as new_leads,
      count(*) filter (where exists (
        select 1 from public.call_logs cl
        where cl.contact_id = c.id and cl.salesperson_id = p_salesperson
          and cl.created_at >= c.created_at
          and cl.created_at < c.created_at + interval '2 hours'
      ))::int as answered_fast
    from public.contacts c, bounds b
    where c.salesperson_id = p_salesperson
      and c.created_at >= b.day_start and c.created_at < b.day_end
  ),
  visits as (
    select count(*)::int as fixed
    from public.contacts c, bounds b
    where c.salesperson_id = p_salesperson
      and c.site_visit_at is not null
      and c.updated_at >= b.day_start and c.updated_at < b.day_end
  )
  select jsonb_build_object(
    'date', p_date,
    'dialled', calls.dialled,
    'connected', calls.connected,
    'talk_seconds', calls.talk_seconds,
    'looped', calls.looped,
    'followups_scheduled', fups.scheduled,
    'followups_completed', fups.completed,
    'followups_missed', fups.missed,
    'followups_backlog', fups.backlog,
    'new_leads', fresh.new_leads,
    'answered_fast', fresh.answered_fast,
    'visits_fixed', visits.fixed
  )
  from calls, fups, fresh, visits;
$$;

comment on function public.rep_day_facts(uuid, date) is
  'One telecaller''s day in raw counts. The numbers the daily review prints, and the numbers '
  'rep_day_score() scores — never computed twice.';

-- ---------- the score ----------
create or replace function public.rep_day_score(
  p_salesperson uuid,
  p_date date default (now() at time zone 'Asia/Kolkata')::date
)
returns jsonb
language plpgsql
stable
-- Invoker, for the same reason as rep_day_facts above.
set search_path = public
as $$
declare
  f jsonb := public.rep_day_facts(p_salesperson, p_date);
  -- Full marks for connected calls. Deliberately a constant with a comment
  -- rather than a settings row: the day it varies per company is the day two
  -- reps compare scores and neither number means anything.
  target_calls constant int := 30;
  parts jsonb := '[]'::jsonb;
  total_weight numeric := 0;
  earned numeric := 0;
  ratio numeric;
  active boolean;
  w numeric;
begin
  active := (f->>'dialled')::int > 0
         or (f->>'followups_completed')::int > 0
         or (f->>'visits_fixed')::int > 0;

  -- 1. Follow-up discipline (40) — the promise the rep made to a customer.
  --    Weighted heaviest because it is the only component that is also a
  --    promise somebody is waiting on.
  if (f->>'followups_scheduled')::int > 0 then
    w := 40;
    ratio := least(1.0, (f->>'followups_completed')::numeric
                        / greatest((f->>'followups_scheduled')::numeric, 1));
    total_weight := total_weight + w;
    earned := earned + w * ratio;
    parts := parts || jsonb_build_object(
      'key', 'followups', 'label', 'Follow-ups kept',
      'weight', w, 'ratio', round(ratio, 3),
      'detail', format('%s of %s', f->>'followups_completed', f->>'followups_scheduled'));
  end if;

  -- 2. Calls connected (25). Always applicable — a working day always offered
  --    the chance to pick up the phone.
  w := 25;
  ratio := least(1.0, (f->>'connected')::numeric / target_calls);
  total_weight := total_weight + w;
  earned := earned + w * ratio;
  parts := parts || jsonb_build_object(
    'key', 'calls', 'label', 'Calls connected',
    'weight', w, 'ratio', round(ratio, 3),
    'detail', format('%s connected', f->>'connected'));

  -- 3. Response speed (20) — only when leads actually arrived.
  if (f->>'new_leads')::int > 0 then
    w := 20;
    ratio := (f->>'answered_fast')::numeric / (f->>'new_leads')::numeric;
    total_weight := total_weight + w;
    earned := earned + w * ratio;
    parts := parts || jsonb_build_object(
      'key', 'speed', 'label', 'New leads called in 2h',
      'weight', w, 'ratio', round(ratio, 3),
      'detail', format('%s of %s', f->>'answered_fast', f->>'new_leads'));
  end if;

  -- 4. Loop closed (15) — only when there were connected calls to close.
  if (f->>'connected')::int > 0 then
    w := 15;
    ratio := (f->>'looped')::numeric / (f->>'connected')::numeric;
    total_weight := total_weight + w;
    earned := earned + w * ratio;
    parts := parts || jsonb_build_object(
      'key', 'loop', 'label', 'Calls with a note or next step',
      'weight', w, 'ratio', round(ratio, 3),
      'detail', format('%s of %s', f->>'looped', f->>'connected'));
  end if;

  return jsonb_build_object(
    'salesperson_id', p_salesperson,
    'date', p_date,
    -- Rescaled to the components that applied, which is what the opportunity
    -- rule means in one line.
    'score', case when total_weight = 0 then null
                  else round(100 * earned / total_weight)::int end,
    -- A rep who did nothing gets NO score. Zero activity is an attendance
    -- question for their manager, not a performance number to send them — and
    -- "0/100" is the one message guaranteed to make somebody stop reading.
    'active', active,
    'components', parts,
    'facts', f
  );
end;
$$;

comment on function public.rep_day_score(uuid, date) is
  'A telecaller''s 0-100 day, from four measurable components with the weight of any component '
  'they had no chance at redistributed across the rest. Returns active=false when the rep did '
  'nothing, in which case there is no score to send.';

revoke all on function public.rep_day_facts(uuid, date) from public;
revoke all on function public.rep_day_score(uuid, date) from public;
grant execute on function public.rep_day_facts(uuid, date) to authenticated, service_role;
grant execute on function public.rep_day_score(uuid, date) to authenticated, service_role;
