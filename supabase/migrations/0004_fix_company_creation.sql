-- ============================================================
-- Fix New-user trigger: create a company if role is admin and company_name is provided
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_role public.user_role;
  comp_name text;
  new_company_id uuid := null;
begin
  new_role := coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'salesperson');
  comp_name := new.raw_user_meta_data->>'company_name';
  
  -- If this is an admin and a company name was provided, create the company first
  if new_role = 'admin' and comp_name is not null and comp_name != '' then
    insert into public.companies (name, owner_id)
    values (comp_name, new.id)
    returning id into new_company_id;
  end if;

  insert into public.profiles (id, full_name, phone, role, company_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    new_role,
    new_company_id
  )
  on conflict (id) do update set
    company_id = EXCLUDED.company_id
  where public.profiles.company_id is null;
  
  return new;
end $$;
