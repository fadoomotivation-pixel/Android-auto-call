-- Short labels for narrow surfaces.
--
-- A phone chip row cannot carry "Do not call" without wrapping or being cut in
-- half, and a cut-off chip is how a rep learns there are options they cannot
-- see. The obvious fix is to shorten the string in the Android file - which
-- would put a second name for every stage back into client code, days after
-- taking the first one out.
--
-- So the short name is canonical too. `label` stays the full name for the web
-- board and reports; `short_label` is what a chip uses. Both come from here.
alter table public.lead_stages
  add column if not exists short_label text;

update public.lead_stages set short_label = case code
  when 'site_visit'  then 'Visit'
  when 'negotiation' then 'Nego'
  when 'token_paid'  then 'Token'
  when 'dnc'         then 'DNC'
  when 'invalid'     then 'Bad no.'
  else label
end;

alter table public.lead_stages alter column short_label set not null;

comment on column public.lead_stages.short_label is
  'The name for a narrow surface (a phone filter chip). Full name stays in label. '
  'Both live here so neither client invents its own abbreviation.';

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
  (a.due_at is not null
    and timezone('Asia/Kolkata', a.due_at)::date = timezone('Asia/Kolkata', now())::date) as is_due_today,
  (timezone('Asia/Kolkata', c.handled_at)::date = timezone('Asia/Kolkata', now())::date) as handled_today
from public.contacts c
join public.lead_stages s on s.code = c.stage
join public.v_lead_action_state a on a.contact_id = c.id;

comment on view public.v_lead_workstate is
  'One row per lead carrying BOTH axes - lifecycle stage (labels, colour, semantics) and derived action state.';

grant select on public.v_lead_workstate to authenticated;
