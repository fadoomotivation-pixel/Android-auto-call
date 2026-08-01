-- Why is this ad's lead quality a D?
--
-- The Ads page could already grade an ad's leads A-D from CRM outcomes, which
-- is more than Meta can do. But a grade only says the leads were bad. It never
-- says WHY, and you cannot fix an ad from a letter.
--
-- The CRM knows why, because it knows what happened to every single lead. The
-- first thing it knows is the one that changes the decision:
--
--   Jewar Airport — 68 leads, 3 qualified, graded D.
--   TWENTY-FOUR of those 68 were never dialled at all.
--
-- A third of that ad's leads were never called, so a third of its grade is not
-- about the ad. Judged only on the leads someone actually spoke to, it is a C,
-- not a D — still worse than the best ad, but a different problem with a
-- different fix. Pausing that ad would have been the wrong move; the right one
-- is to call the leads already paid for.
--
-- So this returns the autopsy, not a verdict: of the leads an ad produced, how
-- many were never called, how many were called but never reached, how many were
-- spoken to and said no, and how many became real. The page can then separate
-- "this ad brings the wrong people" from "nobody worked these leads", which are
-- opposite problems that a single letter grade hides.
--
-- Also returns how fast the first call went out. A Meta lead goes cold in
-- minutes, so a slow first dial looks exactly like a bad ad in the numbers.
--
-- Attribution deliberately matches ads-insights exactly — contacts.extra.ad_id,
-- facebook source, same window. One rule for what belongs to an ad, or the two
-- surfaces will disagree and neither will be trusted.
--
-- Service-role only: the ad account is central and its leads span companies, so
-- this must never be reachable by a company admin directly. The Ads page gets
-- it through ads-insights, which does its own scoping.
create or replace function public.ad_lead_autopsy(p_since timestamptz, p_until timestamptz default null)
returns table(
  ad_id text,
  leads int,
  never_called int,
  tried_not_reached int,
  spoke int,
  qualified int,
  booked int,
  not_interested int,
  wrong_or_dnc int,
  still_open int,
  median_first_call_mins int
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with lead as (
    select
      c.id,
      c.extra->>'ad_id' as ad_id,
      c.status::text as st,
      (c.extra ? 'wrong_number') as wrong_number,
      c.created_at,
      (select min(cl.started_at) from call_logs cl where cl.contact_id = c.id) as first_call_at,
      exists (select 1 from call_logs cl where cl.contact_id = c.id) as called,
      -- 30 seconds is the same line the rest of the platform uses for "actually
      -- spoke to them" rather than "the phone rang".
      exists (
        select 1 from call_logs cl
         where cl.contact_id = c.id and coalesce(cl.duration_seconds, 0) >= 30
      ) as reached
    from contacts c
    where c.lead_source = 'facebook'
      and c.extra ? 'ad_id'
      and c.created_at >= p_since
      and (p_until is null or c.created_at <= p_until)
  )
  select
    l.ad_id,
    count(*)::int,
    count(*) filter (where not l.called)::int,
    count(*) filter (where l.called and not l.reached)::int,
    count(*) filter (where l.reached)::int,
    count(*) filter (where l.st in ('interested','site_visit','negotiation','token_paid','booked'))::int,
    -- 'booked' only, matching ads-insights' BOOKED set exactly. Two definitions
    -- of "booked" across two surfaces is how dashboards start disagreeing.
    count(*) filter (where l.st = 'booked')::int,
    count(*) filter (where l.st = 'not_interested')::int,
    count(*) filter (where l.st = 'dnc' or l.wrong_number)::int,
    count(*) filter (where l.st in ('new','queued','no_answer','busy','callback','follow_up','called'))::int,
    coalesce(
      percentile_cont(0.5) within group (
        order by extract(epoch from (l.first_call_at - l.created_at)) / 60
      ) filter (where l.first_call_at is not null),
      0
    )::int
  from lead l
  where l.ad_id is not null
  group by l.ad_id
$$;

revoke all on function public.ad_lead_autopsy(timestamptz, timestamptz) from public;
revoke all on function public.ad_lead_autopsy(timestamptz, timestamptz) from authenticated;
grant execute on function public.ad_lead_autopsy(timestamptz, timestamptz) to service_role;
