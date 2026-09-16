-- The reset itself, and the two doors that can ask for it.
--
-- hand_over_as_new() does the work and authorises NOTHING — it is revoked from
-- every role and only reachable through the two callers below, which check who
-- is asking first. A SECURITY DEFINER function that resets any lead by id is
-- not something to leave on the doorstep.
--
-- A REP MAY HAND THEIR OWN LEADS OVER; A REP MAY NOT WIPE THEM.
-- reassign_contacts has always let a telecaller pass their own leads to a
-- colleague — right, and worth keeping, for someone going on leave. Resetting
-- is different: it erases the record of work from every rep-facing screen,
-- which is a decision about the pipeline and belongs to an admin.
--
-- Both functions are DROPped and recreated rather than replaced, because a new
-- defaulted argument cannot be added with CREATE OR REPLACE — that makes a
-- second overload and every existing two-argument call ambiguous. Existing
-- callers keep working: PostgREST passes named arguments and p_as_new defaults
-- to false, so nothing that does not ask for a reset can get one.
--
-- See 0194 for what is reset and what is kept.
--
-- APPLIED TO PRODUCTION BY HAND on 2026-09-16.

create or replace function public.hand_over_as_new(p_contact_ids uuid[], p_to uuid)
returns integer
language plpgsql security definer set search_path to 'public'
as $function$
declare n integer;
begin
  -- Snapshot first. Nothing here is deleted; it stops being VISIBLE to the rep.
  insert into public.lead_handovers
    (company_id, contact_id, from_salesperson_id, to_salesperson_id, handed_by, snapshot)
  select c.company_id, c.id, c.salesperson_id, p_to, auth.uid(),
         jsonb_strip_nulls(jsonb_build_object(
           'status', c.status, 'stage', c.stage, 'notes', c.notes,
           'temperature', c.temperature, 'budget', c.budget,
           'ai_next_action', c.ai_next_action, 'ai_scored_at', c.ai_scored_at,
           'close_probability', c.close_probability,
           'attempts', c.attempts, 'last_contacted_at', c.last_contacted_at,
           'handled_at', c.handled_at, 'last_inbound_at', c.last_inbound_at,
           'site_visit_at', c.site_visit_at, 'site_visit_project', c.site_visit_project,
           'site_visit_outcome', c.site_visit_outcome,
           'token_amount', c.token_amount, 'token_paid_at', c.token_paid_at,
           'reactivated_at', c.reactivated_at, 'reactivation_count', c.reactivation_count,
           'assigned_at', c.assigned_at, 'previous_fresh_start_at', c.fresh_start_at,
           'calls', (select count(*) from public.call_logs l where l.contact_id = c.id)
         ))
  from public.contacts c
  where c.id = any(p_contact_ids);

  -- A NEW LEAD HAS NO PAST. Identity and origin are kept — name, number, where
  -- it came from — because those are the lead, not the last rep's work on it.
  update public.contacts c
     set salesperson_id       = p_to,
         status               = 'new',
         stage                = 'new',
         notes                = null,
         temperature          = null,
         budget               = null,
         ai_next_action       = null,
         ai_scored_at         = null,
         close_probability    = null,
         close_probability_at = null,
         attempts             = 0,
         last_contacted_at    = null,
         handled_at           = null,
         last_inbound_at      = null,
         site_visit_at        = null,
         site_visit_project   = null,
         site_visit_outcome   = null,
         site_visit_arrived_at   = null,
         site_visit_arrived_lat  = null,
         site_visit_arrived_lng  = null,
         site_visit_distance_m   = null,
         site_visit_verified     = null,
         token_amount         = null,
         token_paid_at        = null,
         reactivated_at       = null,
         reactivation_count   = 0,
         fresh_start_at       = now(),
         assigned_at          = now(),
         updated_at           = now()
   where c.id = any(p_contact_ids);
  get diagnostics n = row_count;

  -- The previous owner's booked callback is THEIR appointment, not an
  -- inheritance. Carried over it would land in the new rep's Follow-up tab on
  -- day one, about a conversation they have never had.
  update public.follow_ups
     set status = 'cancelled'
   where contact_id = any(p_contact_ids) and status = 'pending';

  return n;
end
$function$;

comment on function public.hand_over_as_new(uuid[], uuid) is
  'Internal. Snapshots a lead into lead_handovers, resets every field that records work done on it, cancels the old pending callback, and stamps fresh_start_at. Callers must authorise first — reassign_contacts and admin_assign_contacts do.';

revoke all on function public.hand_over_as_new(uuid[], uuid) from public, anon, authenticated;

drop function if exists public.reassign_contacts(uuid[], uuid);

create or replace function public.reassign_contacts(
  p_contact_ids uuid[], p_salesperson_id uuid, p_as_new boolean default false
) returns integer
language plpgsql security definer set search_path to 'public'
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
    raise exception 'those leads are not in that person''s company';
  end if;

  v_company := public.current_company_id();
  if not public.is_super_admin() then
    if v_company is distinct from v_target_company then
      raise exception 'not your company';
    end if;
    if not public.is_admin() then
      if p_as_new then
        raise exception 'only an admin can hand a lead over as new';
      end if;
      select count(*) into v_bad
        from public.contacts
       where id = any(p_contact_ids)
         and salesperson_id is distinct from auth.uid();
      if v_bad > 0 then
        raise exception 'you can only hand over leads that are yours';
      end if;
    end if;
  end if;

  if p_as_new then
    return public.hand_over_as_new(p_contact_ids, p_salesperson_id);
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

drop function if exists public.admin_assign_contacts(uuid[], uuid, uuid);

create or replace function public.admin_assign_contacts(
  p_contact_ids uuid[], p_company_id uuid, p_salesperson_id uuid default null,
  p_as_new boolean default false
) returns integer
language plpgsql security definer set search_path to 'public'
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

  -- After the tenant move, so the snapshot is filed under the company that now
  -- owns the lead and the cancelled callback is the one that just moved.
  if p_as_new and p_salesperson_id is not null then
    perform public.hand_over_as_new(p_contact_ids, p_salesperson_id);
  end if;

  return v_count;
end;
$function$;
