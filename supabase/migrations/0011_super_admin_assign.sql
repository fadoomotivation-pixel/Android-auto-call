-- ============================================================
-- Super admin lead assignment.
-- The platform owner can reassign existing leads to any company /
-- employee, and create new leads (single or bulk) into any company.
-- Writes go through SECURITY DEFINER functions that re-check
-- is_super_admin(), so we don't widen the per-company RLS policies.
-- ============================================================

-- Reassign existing contacts to a company and (optionally) a salesperson.
-- Returns the number of rows actually moved.
create or replace function public.admin_assign_contacts(
  p_contact_ids    uuid[],
  p_company_id     uuid,
  p_salesperson_id uuid default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;
  if p_company_id is null then
    raise exception 'a target company is required';
  end if;
  if coalesce(array_length(p_contact_ids, 1), 0) = 0 then
    return 0;
  end if;

  -- A salesperson, when given, must belong to the target company.
  if p_salesperson_id is not null and not exists (
    select 1 from public.profiles
     where id = p_salesperson_id and company_id = p_company_id
  ) then
    raise exception 'that employee is not in the selected company';
  end if;

  update public.contacts
     set company_id     = p_company_id,
         salesperson_id = p_salesperson_id,
         campaign_id    = null,   -- moving companies invalidates the old campaign link
         updated_at     = now()
   where id = any(p_contact_ids);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Create one or many leads into a company, optionally pre-assigned to a
-- salesperson. p_leads is a JSON array of objects:
--   { "name", "phone" (required), "email", "company_name", "notes" }
-- Rows without a phone number are skipped. Returns the number inserted.
create or replace function public.admin_create_leads(
  p_company_id     uuid,
  p_leads          jsonb,
  p_salesperson_id uuid default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;
  if p_company_id is null then
    raise exception 'a target company is required';
  end if;
  if p_salesperson_id is not null and not exists (
    select 1 from public.profiles
     where id = p_salesperson_id and company_id = p_company_id
  ) then
    raise exception 'that employee is not in the selected company';
  end if;

  insert into public.contacts (company_id, salesperson_id, name, phone, email, company_name, notes)
  select
    p_company_id,
    p_salesperson_id,
    nullif(btrim(l ->> 'name'), ''),
    btrim(l ->> 'phone'),
    nullif(btrim(l ->> 'email'), ''),
    nullif(btrim(l ->> 'company_name'), ''),
    nullif(btrim(l ->> 'notes'), '')
  from jsonb_array_elements(p_leads) as l
  where coalesce(btrim(l ->> 'phone'), '') <> '';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.admin_assign_contacts(uuid[], uuid, uuid) from public, anon;
revoke execute on function public.admin_create_leads(uuid, jsonb, uuid) from public, anon;
grant execute on function public.admin_assign_contacts(uuid[], uuid, uuid) to authenticated;
grant execute on function public.admin_create_leads(uuid, jsonb, uuid) to authenticated;
