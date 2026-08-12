-- 0158 — Handing a lead over hands over the WORK, not just the name on it
--
-- Reassigning a lead moved exactly one column: contacts.salesperson_id. Its
-- pending callbacks did not move. follow_ups carries its own salesperson_id and
-- its own company_id, and the app reads a rep's day out of follow_ups — so after
-- a handover:
--
--   · the new owner's Follow-up tab is empty for a lead that owes a call today,
--   · the old rep keeps being told to ring a customer who is no longer theirs,
--   · and on a cross-company move the follow-up stays behind in the OLD tenant
--     while the contact it points at now belongs to another company. That is
--     precisely the split ownership the company-isolation rule forbids.
--
-- Nobody had hit it yet only because no already-assigned lead had been
-- reassigned. It would have gone wrong the first time somebody tried.
--
-- Two functions here:
--
--   reassign_contacts()      — the ordinary case. A company admin moves leads
--                              between their own telecallers; a rep hands their
--                              own leads to a colleague. Same company, always.
--   admin_assign_contacts()  — the existing super-admin cross-company move,
--                              fixed to take the follow-ups with it.
--
-- Both move only PENDING follow-ups. A completed callback is history and belongs
-- to the rep who actually made it — rewriting it would quietly credit the new
-- owner with a call they never made. Call logs, voice notes and activities stay
-- put for the same reason: they are a record of what happened, not a workload.

-- ---------------------------------------------------------------------------
-- Same-company handover
-- ---------------------------------------------------------------------------
create or replace function public.reassign_contacts(
  p_contact_ids uuid[],
  p_salesperson_id uuid
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company uuid;
  v_target_company uuid;
  v_count integer;
  v_bad integer;
begin
  if coalesce(array_length(p_contact_ids, 1), 0) = 0 then
    return 0;
  end if;
  if p_salesperson_id is null then
    raise exception 'pick who the leads are going to';
  end if;

  select company_id into v_target_company
    from public.profiles where id = p_salesperson_id;
  if v_target_company is null then
    raise exception 'that person is not set up in any company';
  end if;

  -- Every lead in the batch must already live in the target's company. This is
  -- the same-company door; crossing tenants is admin_assign_contacts' job and
  -- needs the super admin. Checked as a set so a single stray id cannot smuggle
  -- one company's lead into another's account.
  select count(*) into v_bad
    from public.contacts
   where id = any(p_contact_ids)
     and company_id is distinct from v_target_company;
  if v_bad > 0 then
    raise exception 'those leads are not in %''s company', p_salesperson_id;
  end if;

  -- Who is allowed to do this: the super admin anywhere, a company admin inside
  -- their own company, or a telecaller giving away leads that are already theirs.
  -- The last one is deliberate — a rep going on leave should be able to hand
  -- their day to a colleague without waiting for the office.
  v_company := public.current_company_id();
  if not public.is_super_admin() then
    if v_company is distinct from v_target_company then
      raise exception 'not your company';
    end if;
    if not public.is_admin() then
      select count(*) into v_bad
        from public.contacts
       where id = any(p_contact_ids)
         and salesperson_id is distinct from auth.uid();
      if v_bad > 0 then
        raise exception 'you can only hand over leads that are yours';
      end if;
    end if;
  end if;

  update public.contacts
     set salesperson_id = p_salesperson_id,
         updated_at     = now()
   where id = any(p_contact_ids);
  get diagnostics v_count = row_count;

  -- The work goes with the lead.
  update public.follow_ups
     set salesperson_id = p_salesperson_id
   where contact_id = any(p_contact_ids)
     and status = 'pending';

  return v_count;
end;
$function$;

revoke all on function public.reassign_contacts(uuid[], uuid) from public;
grant execute on function public.reassign_contacts(uuid[], uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Cross-company move (super admin) — same omission, worse consequence
-- ---------------------------------------------------------------------------
create or replace function public.admin_assign_contacts(
  p_contact_ids uuid[],
  p_company_id uuid,
  p_salesperson_id uuid default null::uuid
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  if p_salesperson_id is not null and not exists (
    select 1 from public.profiles
     where id = p_salesperson_id and company_id = p_company_id
  ) then
    raise exception 'that employee is not in the selected company';
  end if;

  update public.contacts
     set company_id     = p_company_id,
         salesperson_id = p_salesperson_id,
         campaign_id    = null,
         updated_at     = now()
   where id = any(p_contact_ids);

  get diagnostics v_count = row_count;

  -- Pending callbacks follow the lead across the tenant boundary, company_id
  -- included. Left behind, they were a row in one company pointing at a contact
  -- owned by another — invisible to the new owner, still nagging the old rep,
  -- and a straight breach of company isolation.
  update public.follow_ups
     set company_id     = p_company_id,
         salesperson_id = p_salesperson_id
   where contact_id = any(p_contact_ids)
     and status = 'pending';

  return v_count;
end;
$function$;
