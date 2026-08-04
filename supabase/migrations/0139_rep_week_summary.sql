-- The week, for the Monday morning review.
--
-- Built by summing the SAME daily facts the nightly review already prints, so
-- a rep who added up their five daily messages gets the number the weekly
-- message shows them. The alternative — a second set of week-shaped queries —
-- is how "you kept 62 follow-ups" and "you kept 58 follow-ups" end up in the
-- same inbox, and after that neither figure is believed.
--
-- Strongest and weakest are the best and worst SCORED COMPONENT of the week,
-- not a named selling skill. The brief asked for "Best skill: handling
-- objections", and that reading needs the call recordings put through the
-- coaching brain — 645 transcripts exist, so it is buildable, but it is not
-- built, and naming a skill nobody measured is the same mistake as scoring the
-- notes column nobody fills.

create or replace function public.rep_week_summary(
  p_salesperson uuid,
  -- The seven days ending yesterday. Called on a Monday this is Mon-Sun, which
  -- is the week a rep thinks they just worked.
  p_to date default ((now() at time zone 'Asia/Kolkata')::date - 1),
  p_days int default 7
)
returns jsonb
language sql
stable
-- Invoker, like rep_day_facts: the isolation lives in the tables' own policies.
set search_path = public
as $$
  with days as (
    select generate_series(p_to - (p_days - 1), p_to, interval '1 day')::date as d
  ),
  scored as (
    select d, public.rep_day_score(p_salesperson, d) as s from days
  ),
  totals as (
    select
      sum((s->'facts'->>'dialled')::int)              as calls,
      sum((s->'facts'->>'connected')::int)            as connected,
      sum((s->'facts'->>'talk_seconds')::int)         as talk_seconds,
      sum((s->'facts'->>'followups_scheduled')::int)  as fu_scheduled,
      sum((s->'facts'->>'followups_completed')::int)  as fu_completed,
      sum((s->'facts'->>'visits_fixed')::int)         as visits,
      -- Only days the rep actually worked count towards the average. A week
      -- with two days off is not a worse week.
      round(avg((s->>'score')::numeric) filter (where (s->>'active')::boolean)) as avg_score
    from scored
  ),
  -- The week's ratio per component, weighted by how often it applied.
  comps as (
    select
      c->>'key'   as key,
      c->>'label' as label,
      avg((c->>'ratio')::numeric) as ratio,
      count(*)    as days_applied
    from scored, lateral jsonb_array_elements(s->'components') c
    where (s->>'active')::boolean
    group by 1, 2
  ),
  bookings as (
    select count(*)::int as n
    from public.contacts
    where salesperson_id = p_salesperson
      and status in ('booked', 'token_paid')
      and (updated_at at time zone 'Asia/Kolkata')::date between p_to - (p_days - 1) and p_to
  )
  select jsonb_build_object(
    'from', to_char(p_to - (p_days - 1), 'DD Mon'),
    'to', to_char(p_to, 'DD Mon'),
    'calls', coalesce(totals.calls, 0),
    'connected', coalesce(totals.connected, 0),
    'talk_seconds', coalesce(totals.talk_seconds, 0),
    'followups_scheduled', coalesce(totals.fu_scheduled, 0),
    'followups_completed', coalesce(totals.fu_completed, 0),
    'site_visits', coalesce(totals.visits, 0),
    'bookings', bookings.n,
    'avg_score', totals.avg_score,
    -- Null when the rep worked fewer than two days: one day is a day, not a
    -- pattern, and "needs improvement" off a single sample is just noise.
    'best', (select jsonb_build_object('label', label,
               'detail', round(100 * ratio) || '% of the time')
             from comps where days_applied >= 2 order by ratio desc limit 1),
    'worst', (select jsonb_build_object('label', label,
               'detail', round(100 * ratio) || '% of the time')
              from comps where days_applied >= 2 order by ratio asc limit 1)
  )
  from totals, bookings;
$$;

comment on function public.rep_week_summary(uuid, date, int) is
  'Seven days of rep_day_score() added up, for the Monday review. Strongest and weakest are the '
  'best and worst scored component, not a named selling skill — that needs the transcripts.';

revoke all on function public.rep_week_summary(uuid, date, int) from public;
grant execute on function public.rep_week_summary(uuid, date, int) to authenticated, service_role;
