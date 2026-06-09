-- ============================================================
-- Super admin (platform owner): cross-company visibility.
-- ============================================================
create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;

drop policy if exists pa_self on public.platform_admins;
create policy pa_self on public.platform_admins for select to authenticated
  using (user_id = auth.uid());

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;
revoke execute on function public.is_super_admin() from public, anon;

-- Super-admin read-everything policies (OR'd with existing per-company ones).
drop policy if exists companies_super on public.companies;
create policy companies_super on public.companies for select to authenticated using (public.is_super_admin());
drop policy if exists profiles_super on public.profiles;
create policy profiles_super on public.profiles for select to authenticated using (public.is_super_admin());
drop policy if exists campaigns_super on public.campaigns;
create policy campaigns_super on public.campaigns for select to authenticated using (public.is_super_admin());
drop policy if exists contacts_super on public.contacts;
create policy contacts_super on public.contacts for select to authenticated using (public.is_super_admin());
drop policy if exists calllogs_super on public.call_logs;
create policy calllogs_super on public.call_logs for select to authenticated using (public.is_super_admin());

-- ---------- cross-company overview views ----------
create or replace view public.v_company_overview
with (security_invoker = true) as
select
  c.id as company_id, c.name, c.created_at,
  (select count(*) from public.profiles p where p.company_id = c.id and p.role = 'salesperson') as salespeople,
  (select count(*) from public.campaigns ca where ca.company_id = c.id) as campaigns,
  (select count(*) from public.contacts ct where ct.company_id = c.id) as contacts,
  (select count(*) from public.call_logs cl where cl.company_id = c.id) as calls,
  (select max(cl.created_at) from public.call_logs cl where cl.company_id = c.id) as last_call_at
from public.companies c;

create or replace view public.v_telecaller_overview
with (security_invoker = true) as
select
  p.id as salesperson_id, p.full_name, p.is_active,
  c.id as company_id, c.name as company_name,
  (select count(*) from public.campaigns ca where ca.salesperson_id = p.id) as campaigns,
  (select count(*) from public.call_logs cl where cl.salesperson_id = p.id) as calls,
  (select count(*) from public.call_logs cl where cl.salesperson_id = p.id and cl.outcome = 'connected') as connected,
  (select max(cl.created_at) from public.call_logs cl where cl.salesperson_id = p.id) as last_call_at,
  (select ca.name from public.campaigns ca where ca.salesperson_id = p.id order by ca.created_at desc limit 1) as latest_campaign
from public.profiles p
left join public.companies c on c.id = p.company_id
where p.role = 'salesperson';

grant select on public.v_company_overview to authenticated;
grant select on public.v_telecaller_overview to authenticated;

-- Seed the platform owner (replace with the desired user id).
-- insert into public.platform_admins (user_id) values ('<auth-user-uuid>') on conflict do nothing;
