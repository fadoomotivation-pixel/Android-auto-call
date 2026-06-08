-- ============================================================
-- RPC: create a company and attach the current user as its admin.
-- ============================================================
create or replace function public.create_company_and_join(company_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.companies (name, owner_id)
  values (company_name, auth.uid())
  returning id into new_company_id;

  update public.profiles
     set company_id = new_company_id,
         role = 'admin'
   where id = auth.uid();

  return new_company_id;
end $$;

-- ============================================================
-- RPC: admin assigns an existing user to their company.
-- ============================================================
create or replace function public.admin_assign_to_company(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins may assign members';
  end if;

  update public.profiles
     set company_id = public.current_company_id()
   where id = target_user;
end $$;

-- ============================================================
-- View: per-salesperson productivity (admin dashboard).
-- ============================================================
create or replace view public.v_salesperson_stats
with (security_invoker = true) as
select
  p.id                                            as salesperson_id,
  p.full_name,
  p.company_id,
  count(distinct c.id)                            as total_contacts,
  count(cl.id)                                    as total_calls,
  count(cl.id) filter (where cl.outcome = 'connected')      as connected_calls,
  count(cl.id) filter (where cl.outcome = 'no_answer')      as no_answer_calls,
  coalesce(sum(cl.duration_seconds), 0)           as total_talk_seconds,
  max(cl.started_at)                              as last_call_at
from public.profiles p
left join public.contacts  c  on c.salesperson_id  = p.id
left join public.call_logs cl on cl.salesperson_id = p.id
where p.role = 'salesperson'
group by p.id, p.full_name, p.company_id;

-- ============================================================
-- Grants & hardening
-- ============================================================
grant execute on function public.create_company_and_join(text) to authenticated;
grant execute on function public.admin_assign_to_company(uuid) to authenticated;
grant select on public.v_salesperson_stats to authenticated;

-- Internal-only / trigger-only functions: no direct API access
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.current_company_id() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.create_company_and_join(text) from public, anon;
revoke execute on function public.admin_assign_to_company(uuid) from public, anon;
