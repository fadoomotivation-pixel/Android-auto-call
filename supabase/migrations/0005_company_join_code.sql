-- ============================================================
-- Company join codes + member management RPCs.
-- ============================================================
alter table public.companies
  add column if not exists join_code text unique;

update public.companies
   set join_code = upper(substr(md5(random()::text || id::text), 1, 6))
 where join_code is null;

alter table public.companies
  alter column join_code set default upper(substr(md5(random()::text), 1, 6));

-- Salesperson joins a company by its code.
create or replace function public.join_company_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select id into cid
    from public.companies
   where upper(join_code) = upper(trim(p_code));

  if cid is null then
    raise exception 'invalid company code';
  end if;

  update public.profiles set company_id = cid where id = auth.uid();
  return cid;
end $$;

-- Admin deactivates / reactivates a member.
create or replace function public.admin_set_member_active(target_user uuid, active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins may change members';
  end if;
  update public.profiles
     set is_active = active
   where id = target_user
     and company_id = public.current_company_id();
end $$;

revoke execute on function public.join_company_by_code(text) from public, anon;
grant execute on function public.join_company_by_code(text) to authenticated;
revoke execute on function public.admin_set_member_active(uuid, boolean) from public, anon;
grant execute on function public.admin_set_member_active(uuid, boolean) to authenticated;
