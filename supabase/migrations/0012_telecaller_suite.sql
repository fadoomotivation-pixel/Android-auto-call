-- ============================================================
-- Telecaller productivity suite
--   1. Lead pipeline       — richer contact statuses + temperature
--   2. Follow-up scheduler  — per-lead callbacks with a due time
--   3. Attendance           — shift punch in / punch out per day
--   4. Team leaderboard      — company-scoped daily/weekly rankings
-- Everything is multi-tenant and guarded by the same RLS model as the
-- rest of the schema: a salesperson only ever sees their own rows; admins
-- see everything in their company.
-- ============================================================

-- ---------- 1. lead pipeline ----------
-- Extend the contact_status enum with the closing stages telecallers need.
do $$ begin alter type public.contact_status add value if not exists 'follow_up'; exception when others then null; end $$;
do $$ begin alter type public.contact_status add value if not exists 'booked';    exception when others then null; end $$;
do $$ begin alter type public.contact_status add value if not exists 'lost';      exception when others then null; end $$;

-- Hot / Warm / Cold scoring so the pipeline can be triaged at a glance.
alter table public.contacts
  add column if not exists temperature text
  check (temperature is null or temperature in ('hot','warm','cold'));

-- ---------- 2. follow-ups (scheduled callbacks) ----------
create table if not exists public.follow_ups (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  salesperson_id  uuid not null references public.profiles(id)  on delete cascade,
  contact_id      uuid references public.contacts(id) on delete set null,
  phone           text not null,
  name            text,
  due_at          timestamptz not null,
  note            text,
  status          text not null default 'pending'
                    check (status in ('pending','done','missed','cancelled')),
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);
create index if not exists idx_followups_company on public.follow_ups(company_id);
create index if not exists idx_followups_sales   on public.follow_ups(salesperson_id);
create index if not exists idx_followups_due     on public.follow_ups(due_at);

alter table public.follow_ups enable row level security;

drop policy if exists followups_select on public.follow_ups;
create policy followups_select on public.follow_ups for select to authenticated
  using (company_id = public.current_company_id()
         and (public.is_admin() or salesperson_id = auth.uid()));

drop policy if exists followups_insert on public.follow_ups;
create policy followups_insert on public.follow_ups for insert to authenticated
  with check (company_id = public.current_company_id() and salesperson_id = auth.uid());

drop policy if exists followups_update on public.follow_ups;
create policy followups_update on public.follow_ups for update to authenticated
  using (company_id = public.current_company_id()
         and (public.is_admin() or salesperson_id = auth.uid()))
  with check (company_id = public.current_company_id());

drop policy if exists followups_delete on public.follow_ups;
create policy followups_delete on public.follow_ups for delete to authenticated
  using (company_id = public.current_company_id()
         and (public.is_admin() or salesperson_id = auth.uid()));

-- ---------- 3. attendance (shift punch in / out) ----------
create table if not exists public.attendance (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  salesperson_id  uuid not null references public.profiles(id)  on delete cascade,
  work_date       date not null default current_date,
  punch_in_at     timestamptz,
  punch_out_at    timestamptz,
  punch_in_lat    double precision,
  punch_in_lng    double precision,
  status          text not null default 'present'
                    check (status in ('present','half_day','absent')),
  created_at      timestamptz not null default now(),
  unique (salesperson_id, work_date)
);
create index if not exists idx_attendance_company on public.attendance(company_id);
create index if not exists idx_attendance_sales   on public.attendance(salesperson_id, work_date);

alter table public.attendance enable row level security;

drop policy if exists attendance_select on public.attendance;
create policy attendance_select on public.attendance for select to authenticated
  using (company_id = public.current_company_id()
         and (public.is_admin() or salesperson_id = auth.uid()));

drop policy if exists attendance_insert on public.attendance;
create policy attendance_insert on public.attendance for insert to authenticated
  with check (company_id = public.current_company_id() and salesperson_id = auth.uid());

drop policy if exists attendance_update on public.attendance;
create policy attendance_update on public.attendance for update to authenticated
  using (company_id = public.current_company_id()
         and (public.is_admin() or salesperson_id = auth.uid()))
  with check (company_id = public.current_company_id());

-- ---------- 4. team leaderboard ----------
-- SECURITY DEFINER so every teammate (not just admins) can see the company
-- rankings. It only exposes aggregate counts + names, never raw contacts,
-- and is still scoped to the caller's own company.
create or replace function public.get_team_leaderboard(p_period text default 'today')
returns table (
  salesperson_id uuid,
  full_name      text,
  calls          bigint,
  connected      bigint,
  talk_seconds   bigint,
  leads          bigint
)
language sql stable security definer set search_path = public as $$
  with bounds as (
    select case when p_period = 'week' then date_trunc('week', now())
                else date_trunc('day', now()) end as since
  )
  select
    p.id,
    p.full_name,
    coalesce(cs.calls, 0)        as calls,
    coalesce(cs.connected, 0)    as connected,
    coalesce(cs.talk_seconds, 0) as talk_seconds,
    coalesce(ls.leads, 0)        as leads
  from public.profiles p
  left join lateral (
    select count(*)                                            as calls,
           count(*) filter (where cl.outcome = 'connected')    as connected,
           coalesce(sum(cl.duration_seconds), 0)               as talk_seconds
    from public.call_logs cl, bounds
    where cl.salesperson_id = p.id and cl.created_at >= bounds.since
  ) cs on true
  left join lateral (
    select count(*) as leads
    from public.contacts ct, bounds
    where ct.salesperson_id = p.id
      -- cast to text so the freshly-added 'booked' enum value is safe to use
      -- inside this same migration transaction.
      and ct.status::text in ('interested','booked')
      and ct.updated_at >= bounds.since
  ) ls on true
  where p.company_id = public.current_company_id()
    and p.role = 'salesperson';
$$;

grant execute on function public.get_team_leaderboard(text) to authenticated;
revoke execute on function public.get_team_leaderboard(text) from public, anon;
