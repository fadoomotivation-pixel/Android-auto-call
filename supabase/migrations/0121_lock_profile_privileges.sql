-- A telecaller could make themselves an admin. Of any company.
--
-- profiles_update reads:
--     using      (id = auth.uid() or (company_id = current_company_id() and is_admin()))
--     with check (id = auth.uid() or (company_id = current_company_id() and is_admin()))
--
-- Row-level security is exactly that — ROW level. Both halves are satisfied by
-- `id = auth.uid()`, and neither says a word about WHICH COLUMNS may change. So
-- any signed-in rep could run, against their own row:
--
--     update profiles set role = 'admin' where id = auth.uid();
--
-- is_admin() then returns true and they hold their company's entire CRM. Worse:
--
--     update profiles set company_id = '<another tenant>' where id = auth.uid();
--
-- also passes, because the row is still theirs. Admin of one company, then a
-- hop into the next one — every lead, call log and recording in it. That is the
-- one rule this platform sells (companies never see each other) broken by a
-- single statement any rep could type.
--
-- The fix is a trigger, because RLS cannot express "these two columns are
-- special". role and company_id are now settable only by:
--   • a SECURITY DEFINER function (create_company_and_join, join_company_by_code,
--     admin_assign_to_company, platform_reassign_employee, admin_set_member_role
--     below) — inside those, current_user is the function owner, not
--     'authenticated', so they pass straight through and NOTHING legitimate
--     breaks, and
--   • the service role.
-- A direct client UPDATE is refused, whoever sends it.
-- SECURITY INVOKER — deliberately, and this is the whole mechanism.
--
-- Written SECURITY DEFINER first, it did nothing at all: inside a definer
-- function current_user becomes the function's OWNER, so the check below saw
-- 'postgres' on every call and waved the exploit straight through. It looked
-- correct and tested false. As the invoker, current_user is whatever the caller
-- is running as — 'authenticated' for a client statement, the owner for one
-- issued inside a SECURITY DEFINER function — which is exactly the line we want
-- to draw. The function needs no privileges of its own; it only reads NEW/OLD.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Only guard the client path. Every legitimate role/company change is issued
  -- inside a SECURITY DEFINER function, which runs as the owner and so passes
  -- through here without having to be listed one by one.
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception
      'A role can only be changed by an admin, through admin_set_member_role().'
      using errcode = '42501';
  end if;

  if new.company_id is distinct from old.company_id then
    raise exception
      'A company can only be changed by joining with a code or by a platform admin.'
      using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists trg_guard_profile_privileges on public.profiles;
create trigger trg_guard_profile_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- The capability the trigger just took away, given back through a checked door.
-- An admin can still promote or demote someone — but only inside their own
-- company, only to a real role, and never themselves (an admin demoting the
-- last admin locks the company out, and an admin promoting themselves is the
-- hole we just closed wearing a different hat).
create or replace function public.admin_set_member_role(target_user uuid, new_role text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new_role not in ('admin', 'salesperson') then
    raise exception 'unknown role: %', new_role;
  end if;
  if target_user = auth.uid() then
    raise exception 'You cannot change your own role.' using errcode = '42501';
  end if;
  if not (public.is_super_admin() or public.is_admin()) then
    raise exception 'Only an admin can change a role.' using errcode = '42501';
  end if;

  update public.profiles
     set role = new_role::public.user_role
   where id = target_user
     and (public.is_super_admin() or company_id = public.current_company_id());

  if not found then
    raise exception 'That person is not in your company.' using errcode = '42501';
  end if;
end $$;

revoke all on function public.admin_set_member_role(uuid, text) from public;
grant execute on function public.admin_set_member_role(uuid, text) to authenticated;

-- A join code is for STAFF joining a company, not for carrying admin rights
-- into someone else's tenant.
--
-- join_company_by_code moved company_id and left role untouched, so an admin of
-- company A who learned company B's code arrived in B still an admin — a second
-- route to the same cross-tenant read, and one that survives the trigger above
-- because this function is SECURITY DEFINER. Anyone joining by code is now a
-- salesperson; the company's own owner is the exception, since a code cannot
-- demote the person who created the company.
create or replace function public.join_company_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  cid uuid;
  owner uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select id, owner_id into cid, owner
    from public.companies
   where upper(join_code) = upper(trim(p_code));

  if cid is null then
    raise exception 'invalid company code';
  end if;

  update public.profiles
     set company_id = cid,
         role = case when owner = auth.uid() then role else 'salesperson' end
   where id = auth.uid();

  return cid;
end $$;
