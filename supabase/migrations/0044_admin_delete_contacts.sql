-- ============================================================
-- Super admin / Company admin lead deletion.
-- ============================================================

create or replace function public.admin_delete_contacts(
  p_contact_ids uuid[]
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  v_is_super boolean;
  v_caller_role public.user_role;
  v_caller_company uuid;
begin
  if coalesce(array_length(p_contact_ids, 1), 0) = 0 then
    return 0;
  end if;

  v_is_super := public.is_super_admin();

  -- Get caller's company & role for standard admins
  select role, company_id into v_caller_role, v_caller_company
  from public.profiles
  where id = auth.uid();

  if v_is_super then
    -- Super admin can delete any contact
    delete from public.contacts
    where id = any(p_contact_ids);
    get diagnostics v_count = row_count;
  elsif v_caller_role = 'admin' and v_caller_company is not null then
    -- Company admin can only delete their own company's contacts
    delete from public.contacts
    where id = any(p_contact_ids) and company_id = v_caller_company;
    get diagnostics v_count = row_count;
  else
    raise exception 'not authorized to delete contacts';
  end if;

  return v_count;
end;
$$;

revoke execute on function public.admin_delete_contacts(uuid[]) from public, anon;
grant execute on function public.admin_delete_contacts(uuid[]) to authenticated;
