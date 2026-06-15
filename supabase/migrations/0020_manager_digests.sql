-- Manager AI coach: a daily digest per company. The edge function gathers
-- stats (via get_company_daily_stats) + Groq, and upserts a row here.
create table if not exists public.manager_digests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  digest_date date not null,
  content text,
  stats jsonb,
  created_at timestamptz not null default now(),
  unique (company_id, digest_date)
);

alter table public.manager_digests enable row level security;

-- Company admins read their own company's digests; platform admins read all.
drop policy if exists manager_digests_read on public.manager_digests;
create policy manager_digests_read on public.manager_digests
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin' and p.company_id = manager_digests.company_id
    )
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );

-- Stats roll-up for one company on one IST calendar day. Used by the digest
-- generator (service role). SECURITY DEFINER so it can read across the tenant.
create or replace function public.get_company_daily_stats(p_company uuid, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tz text := 'Asia/Kolkata';
  closed text[] := array['booked','lost','dnc','not_interested'];
  result jsonb;
begin
  with day_calls as (
    select * from public.call_logs
    where company_id = p_company
      and (created_at at time zone tz)::date = p_date
  ),
  reps as (
    select pr.id, coalesce(pr.full_name, 'Unknown') as name
    from public.profiles pr
    where pr.company_id = p_company and coalesce(pr.role,'salesperson') <> 'admin'
  ),
  per_rep as (
    select r.id, r.name,
      count(dc.id) as calls,
      count(dc.id) filter (where dc.outcome = 'connected') as connected,
      round(coalesce(sum(dc.duration_seconds),0)/60.0)::int as talk_min,
      exists (
        select 1 from public.attendance a
        where a.salesperson_id = r.id and a.work_date = p_date and a.punch_in_at is not null
      ) as present
    from reps r
    left join day_calls dc on dc.salesperson_id = r.id
    group by r.id, r.name
  )
  select jsonb_build_object(
    'date', p_date,
    'calls_total', (select count(*) from day_calls),
    'calls_connected', (select count(*) from day_calls where outcome = 'connected'),
    'talk_minutes', (select round(coalesce(sum(duration_seconds),0)/60.0)::int from day_calls),
    'new_leads', (select count(*) from public.contacts
                   where company_id = p_company and (created_at at time zone tz)::date = p_date),
    'interested_today', (select count(*) from public.contacts
                   where company_id = p_company and status::text = 'interested'
                     and (updated_at at time zone tz)::date = p_date),
    'booked_today', (select count(*) from public.contacts
                   where company_id = p_company and status::text = 'booked'
                     and (updated_at at time zone tz)::date = p_date),
    'idle_leads', (select count(*) from public.contacts c
                   where c.company_id = p_company and not (c.status::text = any(closed))
                     and not exists (
                       select 1 from public.call_logs cl
                       where cl.contact_id = c.id and cl.created_at > (p_date - interval '3 days')
                     )),
    'reps_total', (select count(*) from reps),
    'reps_present', (select count(*) from per_rep where present),
    'per_rep', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', name, 'calls', calls, 'connected', connected,
        'talk_min', talk_min, 'present', present) order by calls desc), '[]'::jsonb) from per_rep)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_company_daily_stats(uuid, date) from public, anon, authenticated;
grant execute on function public.get_company_daily_stats(uuid, date) to service_role;
