-- What actually happened on the last call, on the row both clients already read.
--
-- A telecaller looking at a list of 224 leads asks two questions the app could
-- not answer: "have I already spoken to this one, and for how long?" and "when
-- did this lead actually come in?". The card showed "Today" for a lead that
-- arrived at 9am and one that arrived four minutes ago, and it showed nothing
-- at all about the last call - so a 3-second misdial and a 12-minute
-- conversation looked identical.
--
-- On the day this shipped: 419 of 793 leads had a call against them, and 170 of
-- those calls were under 30 seconds. That is 170 leads that read as "called"
-- where nobody actually spoke to anyone, and no way for a rep to tell.
--
-- last_call_seconds is the honest version of "did we talk". A call log row
-- exists for every dial; duration is what separates a real conversation from a
-- ring-out, and it is the number a rep needs before deciding to ring again.
--
-- off_crm calls are excluded exactly as lead_velocity excludes them: a rep's
-- personal call to their own number is not contact with this lead.
drop view if exists public.v_lead_workstate;
create view public.v_lead_workstate
with (security_invoker = true) as
select
  c.id as contact_id, c.company_id, c.salesperson_id, c.name, c.phone,
  c.status as disposition,
  c.stage, s.label as stage_label, s.short_label as stage_short_label,
  s.color as stage_color, s.sort_order as stage_sort,
  s.outcome, s.is_terminal, s.is_pipeline, s.is_advanced, s.counts_as_sale,
  s.rep_visible, s.analytics_visible,
  a.action_state, a.due_at,
  c.site_visit_at, c.created_at, c.last_contacted_at, c.handled_at, c.temperature,
  lc.last_call_at,
  lc.last_call_seconds,
  lc.calls_total,
  (a.due_at is not null
    and timezone('Asia/Kolkata', a.due_at)::date = timezone('Asia/Kolkata', now())::date) as is_due_today,
  (timezone('Asia/Kolkata', c.handled_at)::date = timezone('Asia/Kolkata', now())::date) as handled_today
from public.contacts c
join public.lead_stages s on s.code = c.stage
join public.v_lead_action_state a on a.contact_id = c.id
left join lateral (
  select cl.started_at as last_call_at,
         coalesce(cl.duration_seconds, 0) as last_call_seconds,
         (select count(*)::int from public.call_logs x
          where x.contact_id = c.id and coalesce(x.off_crm, false) = false) as calls_total
  from public.call_logs cl
  where cl.contact_id = c.id and coalesce(cl.off_crm, false) = false
  order by cl.started_at desc
  limit 1
) lc on true;

comment on view public.v_lead_workstate is
  'One row per lead carrying BOTH axes - lifecycle stage and derived action state - plus the last '
  'real call (when, how long, how many). Android tabs, dashboard chips, reports and AI all read this.';

grant select on public.v_lead_workstate to authenticated;
