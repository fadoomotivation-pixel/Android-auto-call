-- Final shape of the derived action state.
--
-- Two corrections folded in here:
--
--  1. A never-dialled lead is the most actionable row in the CRM, not one with
--     "no next step". Without this it landed in the leak bucket and the leak
--     number stopped meaning anything.
--  2. A lead handed to a new rep is work for that rep, even though its stage
--     and disposition are untouched. This replaces the old trick in
--     stamp_assigned_at of rewriting status to 'new' on reassignment, which
--     made the lead visible at the cost of erasing everything already known
--     about it (see 0145).
--
-- no_next_step therefore means precisely: open, already spoken to, assigned,
-- and nothing planned. That is a number a manager can act on.
create or replace view public.v_lead_action_state
with (security_invoker = true) as
with nxt as (
  select f.contact_id, min(f.due_at) as due_at
  from public.follow_ups f
  where f.completed_at is null
  group by f.contact_id
)
select
  c.id as contact_id,
  n.due_at,
  case
    when s.is_terminal then 'none'
    when n.due_at is not null and n.due_at < date_trunc('day', timezone('Asia/Kolkata', now())) at time zone 'Asia/Kolkata' then 'overdue'
    when n.due_at is not null and n.due_at <= now() then 'call_now'
    when n.due_at is not null and timezone('Asia/Kolkata', n.due_at)::date = timezone('Asia/Kolkata', now())::date then 'due_today'
    when n.due_at is not null then 'scheduled'
    when c.stage = 'new' then 'call_now'
    when c.assigned_at is not null
         and (c.last_contacted_at is null or c.assigned_at > c.last_contacted_at) then 'call_now'
    when c.status in ('no_answer','busy','wrong_person','callback','follow_up','queued') then 'call_now'
    when c.site_visit_at is not null and c.site_visit_at > now() then 'awaiting_visit'
    else 'no_next_step'
  end as action_state
from public.contacts c
join public.lead_stages s on s.code = c.stage
left join nxt n on n.contact_id = c.id;

comment on view public.v_lead_action_state is
  'What to do now, derived from stage + follow_ups.due_at + assignment + site_visit_at. '
  'Never stored. Exactly one state per lead.';
