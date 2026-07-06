-- Fully dynamic employee ↔ company management for the platform (super-admin) area:
--   • Employees are created for a company via the existing "New Telecaller" flow.
--   • This adds the missing half — moving an existing employee to ANOTHER company.
--
-- Moving a person across companies is a platform-level operation (a company admin
-- can never see or touch another company), so it is gated to platform_admins.
-- Crucially it also RELEASES everything the employee held in the OLD company —
-- their assigned leads, campaigns, pending follow-ups and un-sent reminders —
-- so no cross-company data leaks and they start clean in the new company.
-- Historical rows (call_logs, lead_activities, voice notes) are left untouched.
--
-- Applied live via MCP; the repo migration keeps a fresh clone reproducible.

create or replace function public.platform_reassign_employee(p_user uuid, p_company uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old uuid;
  v_released int := 0;
begin
  -- Only the platform owner / super admins may move people between companies.
  if not exists (select 1 from public.platform_admins where user_id = auth.uid()) then
    raise exception 'not_authorized';
  end if;

  if not exists (select 1 from public.companies where id = p_company) then
    raise exception 'company_not_found';
  end if;

  select company_id into v_old
    from public.profiles where id = p_user and role = 'salesperson';
  if not found then
    raise exception 'employee_not_found';
  end if;

  -- Already there → nothing to do.
  if v_old is not distinct from p_company then
    return jsonb_build_object('ok', true, 'moved', false, 'released', 0);
  end if;

  -- Release the employee's work in the company they are leaving.
  update public.contacts
    set salesperson_id = null
    where salesperson_id = p_user and company_id = v_old;
  get diagnostics v_released = row_count;

  update public.campaigns
    set salesperson_id = null
    where salesperson_id = p_user and company_id = v_old;

  delete from public.follow_ups
    where salesperson_id = p_user and company_id = v_old;

  delete from public.scheduled_notifications
    where user_id = p_user and company_id = v_old and send_at > now();

  -- Move the employee and make sure they are active in their new home.
  update public.profiles
    set company_id = p_company, is_active = true
    where id = p_user;

  return jsonb_build_object(
    'ok', true, 'moved', true, 'from', v_old, 'to', p_company, 'released', v_released
  );
end;
$$;

grant execute on function public.platform_reassign_employee(uuid, uuid) to authenticated;
