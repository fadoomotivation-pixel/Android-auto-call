-- Fair Lead Router — the distribution engine every telecalling CRM sells
-- (NeoDove/LeadSquared call it "lead distribution"); we simply didn't have it:
-- the Meta webhook gave EVERY incoming lead to the first active telecaller,
-- and bulk-imported leads sat unassigned until the admin dragged them around.
--
-- pick_next_rep(): the least-loaded active telecaller today (fewest leads
--   assigned today; ties broken by total open load) — used by lead intake.
-- distribute_unassigned_leads(): one click from Lead Management spreads every
--   unassigned lead round-robin across active telecallers. The existing
--   triggers do the rest: 0051 stamps each lead brand-new for its rep and
--   0041 fires the lead_assignments push with the chime.

create or replace function public.pick_next_rep(p_company uuid)
returns uuid
language sql security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.company_id = p_company and p.role = 'salesperson' and p.is_active = true
  order by
    (select count(*) from public.contacts c
      where c.salesperson_id = p.id and c.assigned_at >= date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'),
    (select count(*) from public.contacts c
      where c.salesperson_id = p.id and c.status in ('new','queued','callback','follow_up','no_answer','busy')),
    random()
  limit 1
$$;

revoke all on function public.pick_next_rep(uuid) from public, anon, authenticated;
grant execute on function public.pick_next_rep(uuid) to service_role;

create or replace function public.distribute_unassigned_leads(p_limit int default 500)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_reps uuid[];
  v_lead record;
  v_i int := 0;
  v_assigned int := 0;
  v_per jsonb := '{}'::jsonb;
begin
  -- Company admins only (platform admins act on their own profile's company).
  select company_id into v_company from public.profiles
    where id = auth.uid() and role = 'admin';
  if v_company is null and exists (select 1 from public.platform_admins where user_id = auth.uid()) then
    select company_id into v_company from public.profiles where id = auth.uid();
  end if;
  if v_company is null then raise exception 'not_authorized'; end if;

  -- Active telecallers, least-loaded first, so the round starts fair.
  select array_agg(id) into v_reps from (
    select p.id from public.profiles p
    where p.company_id = v_company and p.role = 'salesperson' and p.is_active = true
    order by (select count(*) from public.contacts c
      where c.salesperson_id = p.id
        and c.status in ('new','queued','callback','follow_up','no_answer','busy'))
  ) t;
  if v_reps is null or array_length(v_reps, 1) = 0 then
    return jsonb_build_object('ok', false, 'error', 'no active telecallers');
  end if;

  for v_lead in
    select id from public.contacts
    where company_id = v_company and salesperson_id is null
    order by created_at desc
    limit p_limit
  loop
    v_i := v_i + 1;
    update public.contacts
      set salesperson_id = v_reps[1 + ((v_i - 1) % array_length(v_reps, 1))]
      where id = v_lead.id;
    v_assigned := v_assigned + 1;
  end loop;

  select coalesce(jsonb_object_agg(coalesce(p.full_name, p.id::text), t.n), '{}'::jsonb) into v_per
  from (
    select salesperson_id, count(*) as n from public.contacts
    where company_id = v_company and assigned_at >= now() - interval '2 minutes'
    group by salesperson_id
  ) t join public.profiles p on p.id = t.salesperson_id;

  return jsonb_build_object('ok', true, 'assigned', v_assigned, 'reps', array_length(v_reps, 1), 'per_rep', v_per);
end $$;

grant execute on function public.distribute_unassigned_leads(int) to authenticated;
