-- Predicates every consumer uses instead of its own status list.
--
-- Ten different definitions of open/closed/won existed across 13 SQL functions,
-- 14 edge functions and both clients. They disagreed: token_paid was "closed"
-- in 0112 (its follow-ups got cancelled) and "open" in 0100 (still eligible for
-- round-robin). These predicates are now the only answer, and they READ the
-- lead_stages table rather than repeating it.
--
-- STABLE, not IMMUTABLE: they read a table. Correct for WHERE clauses and
-- views; it only means they cannot back an index or a generated column.

-- Money is not the same question as "won". A token payment is real revenue on a
-- deal that is still open, so revenue reporting needs its own flag rather than
-- borrowing `outcome` — which is exactly what forced rep_integrity and
-- rep_week_summary to hardcode ('booked','token_paid') next to everyone else's
-- different list.
alter table public.lead_stages
  add column if not exists counts_as_sale boolean not null default false;
update public.lead_stages set counts_as_sale = (code in ('token_paid','won'));
comment on column public.lead_stages.counts_as_sale is
  'Money has changed hands. token_paid is counted here AND remains outcome=open: the deal is '
  'not finished, but the revenue is real. Use this for revenue, never outcome.';

alter table public.lead_stages
  add column if not exists is_advanced boolean not null default false;
update public.lead_stages set is_advanced = (sort_order >= 30 and outcome not in ('lost','excluded'));
comment on column public.lead_stages.is_advanced is
  'Reached Interested or beyond and not lost. The canonical advanced/qualified funnel bucket.';

create or replace function public.lead_outcome(p_status public.contact_status)
returns text language sql stable as $$
  select s.outcome from public.lead_stages s where s.code = public.lead_stage_for(p_status);
$$;

create or replace function public.lead_is_open(p_status public.contact_status)
returns boolean language sql stable as $$
  select coalesce((select not s.is_terminal from public.lead_stages s
                   where s.code = public.lead_stage_for(p_status)), true);
$$;

create or replace function public.lead_is_won(p_status public.contact_status)
returns boolean language sql stable as $$
  select coalesce((select s.outcome = 'won' from public.lead_stages s
                   where s.code = public.lead_stage_for(p_status)), false);
$$;

create or replace function public.lead_counts_as_sale(p_status public.contact_status)
returns boolean language sql stable as $$
  select coalesce((select s.counts_as_sale from public.lead_stages s
                   where s.code = public.lead_stage_for(p_status)), false);
$$;

create or replace function public.lead_is_advanced(p_status public.contact_status)
returns boolean language sql stable as $$
  select coalesce((select s.is_advanced from public.lead_stages s
                   where s.code = public.lead_stage_for(p_status)), false);
$$;

comment on function public.lead_is_open(public.contact_status) is
  'The one definition of an open lead. Replaces ten hand-written NOT IN lists.';

-- The workstate view must expose the new flags, or a consumer would have to
-- join lead_stages itself and we would be back to two sources of truth.
-- DROP then CREATE: CREATE OR REPLACE VIEW cannot insert a column mid-list.
drop view if exists public.v_lead_workstate;
create view public.v_lead_workstate
with (security_invoker = true) as
select
  c.id as contact_id, c.company_id, c.salesperson_id, c.name, c.phone,
  c.status as disposition,
  c.stage, s.label as stage_label, s.color as stage_color, s.sort_order as stage_sort,
  s.outcome, s.is_terminal, s.is_pipeline, s.is_advanced, s.counts_as_sale,
  s.rep_visible, s.analytics_visible,
  a.action_state, a.due_at,
  c.site_visit_at, c.created_at, c.last_contacted_at, c.handled_at, c.temperature,
  (a.due_at is not null
    and timezone('Asia/Kolkata', a.due_at)::date = timezone('Asia/Kolkata', now())::date) as is_due_today,
  (timezone('Asia/Kolkata', c.handled_at)::date = timezone('Asia/Kolkata', now())::date) as handled_today
from public.contacts c
join public.lead_stages s on s.code = c.stage
join public.v_lead_action_state a on a.contact_id = c.id;

comment on view public.v_lead_workstate is
  'One row per lead carrying BOTH axes — lifecycle stage (label, colour, semantics) and derived '
  'action state. Android tabs, dashboard chips, reports and AI all count from this.';

grant select on public.v_lead_workstate to authenticated;
