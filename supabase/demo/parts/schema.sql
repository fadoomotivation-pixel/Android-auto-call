-- ── 1. Schema ──

alter table public.companies add column if not exists is_demo boolean not null default false;

create table if not exists public.demo_state (
  company_id uuid primary key references public.companies(id) on delete cascade,
  -- The IST day every demo timestamp is relative to. demo_refresh() moves it.
  anchor_day date not null,
  seeded_at  timestamptz not null default now()
);

create table if not exists public.demo_ad_spend (
  company_id  uuid not null references public.companies(id) on delete cascade,
  -- Days from demo_state.anchor_day; 0 is the demo's today. An offset, not a
  -- date, so moving the demo forward never has to rewrite these rows.
  day_offset  int  not null,
  campaign    text not null,
  spend       numeric(12,2) not null,
  impressions int not null default 0,
  clicks      int not null default 0,
  leads       int not null default 0,
  primary key (company_id, day_offset, campaign)
);

alter table public.demo_state enable row level security;
alter table public.demo_ad_spend enable row level security;
drop policy if exists demo_state_super on public.demo_state;
create policy demo_state_super on public.demo_state for select to authenticated using (public.is_super_admin());
drop policy if exists demo_ad_spend_super on public.demo_ad_spend;
create policy demo_ad_spend_super on public.demo_ad_spend for select to authenticated using (public.is_super_admin());
revoke all on public.demo_state, public.demo_ad_spend from anon;
grant select on public.demo_state, public.demo_ad_spend to authenticated;

-- Move a demo company forward so its "today" is today. No-op on the same day.
create or replace function public.demo_refresh(p_company uuid default 'de000000-0000-4000-8000-000000000001')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anchor date;
  v_today  date := (now() at time zone 'Asia/Kolkata')::date;
  v_days   int;
  d        interval;
begin
  if not public.is_super_admin() then
    raise exception 'Only the platform owner can refresh the demo.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.companies where id = p_company and is_demo) then
    raise exception 'That company is not a demo company.' using errcode = '22023';
  end if;

  select anchor_day into v_anchor from public.demo_state where company_id = p_company for update;
  if v_anchor is null then
    return jsonb_build_object('ok', false, 'reason', 'not_seeded');
  end if;
  v_days := v_today - v_anchor;
  if v_days <= 0 then
    return jsonb_build_object('ok', true, 'moved_days', 0, 'anchor_day', v_anchor);
  end if;
  d := make_interval(days => v_days);

  -- Park pending follow-ups (see the note at the top of this migration).
  update public.follow_ups
     set due_at = due_at + d + interval '100 years', created_at = created_at + d
   where company_id = p_company and status = 'pending';
  update public.follow_ups
     set due_at = due_at + d, created_at = created_at + d, completed_at = completed_at + d
   where company_id = p_company and status <> 'pending';

  -- Call updates re-stamp handled_at; keep the lead clocks to put back.
  drop table if exists pg_temp._demo_clock;
  create temp table _demo_clock on commit drop as
    select id, created_at, assigned_at, origin_created_at, handled_at, last_contacted_at,
           site_visit_at, site_visit_arrived_at, token_paid_at, close_probability_at,
           last_inbound_at, last_reply_at
      from public.contacts where company_id = p_company;

  update public.call_logs
     set started_at = started_at + d, ended_at = ended_at + d, created_at = created_at + d
   where company_id = p_company;

  update public.contacts c
     set created_at = s.created_at + d,
         assigned_at = s.assigned_at + d,
         origin_created_at = s.origin_created_at + d,
         handled_at = s.handled_at + d,
         last_contacted_at = s.last_contacted_at + d,
         site_visit_at = s.site_visit_at + d,
         site_visit_arrived_at = s.site_visit_arrived_at + d,
         token_paid_at = s.token_paid_at + d,
         close_probability_at = s.close_probability_at + d,
         last_inbound_at = s.last_inbound_at + d,
         last_reply_at = s.last_reply_at + d
    from _demo_clock s
   where c.id = s.id;

  update public.follow_ups
     set due_at = due_at - interval '100 years'
   where company_id = p_company and status = 'pending' and due_at > now() + interval '50 years';
  -- Anything a trigger booked on its own while the clocks were moving.
  delete from public.follow_ups
   where company_id = p_company and status = 'pending' and created_at = now()
     and note = 'No call time was set, so we booked one for 11 AM';

  update public.lead_activities set created_at = created_at + d where company_id = p_company;
  update public.site_visit_outcomes
     set visited_at = visited_at + d, recorded_at = recorded_at + d
   where company_id = p_company;
  update public.coach_qa set created_at = created_at + d where company_id = p_company;
  update public.rep_prompts
     set created_at = created_at + d, answered_at = answered_at + d
   where company_id = p_company;

  -- Coach notes are one per rep per day per slot. Notes the live coach wrote
  -- after the anchor day would collide with the moved ones, so they go; the
  -- rest move in two steps so no row ever lands on another mid-update.
  delete from public.coach_briefs where company_id = p_company and brief_date > v_anchor;
  update public.coach_briefs set brief_date = brief_date + 100000 where company_id = p_company;
  update public.coach_briefs set brief_date = brief_date - 100000 + v_days where company_id = p_company;

  -- Call summaries mention places; the city detector would put the demo's
  -- buyers into the super admin's Location demand. Keep them out.
  delete from public.lead_location_interest where company_id = p_company;

  update public.demo_state set anchor_day = v_today where company_id = p_company;
  return jsonb_build_object('ok', true, 'moved_days', v_days, 'anchor_day', v_today);
end $$;

revoke execute on function public.demo_refresh(uuid) from public, anon;
grant execute on function public.demo_refresh(uuid) to authenticated;

-- Every demo timestamp below is "<days from today>, <IST clock>".
create or replace function pg_temp.d(p_day int, p_clock text) returns timestamptz
language sql stable as $$
  select (((now() at time zone 'Asia/Kolkata')::date + p_day) + p_clock::time) at time zone 'Asia/Kolkata'
$$;

create or replace function pg_temp.lead(p_n int) returns uuid
language sql immutable as $$
  select ('de000000-0000-4000-8001-' || lpad(p_n::text, 12, '0'))::uuid
$$;

