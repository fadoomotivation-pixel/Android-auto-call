-- Attendance-gated, geofenced, round-robin lead distribution.
--
-- The ask from the field: a lead should reach a telecaller only once that person
-- has actually started their shift AT the office, one lead per person in turn,
-- and nobody who is already sitting on a pile of untouched leads should be handed
-- more. A lead that lands at 3 a.m. must wait in a pool and flow the moment
-- someone checks in.
--
-- Everything here is server-side. The Android app already sends punch_in_lat /
-- punch_in_lng with a check-in, so the fence is enforced on the row it writes —
-- no app release is involved.
--
-- One brain, not two: pick_next_rep() (used by facebook-poll, lead-capture and
-- every other auto-assign path) now delegates to the same eligibility rules the
-- pool drain uses, so a lead can never arrive by a route that skips the gates.

-- ---------------------------------------------------------------- policy ----
-- A company with NO row here behaves exactly as it did before this migration:
-- no check-in gate, no fence, no backlog cap, no automatic pool drain. Every
-- rule below is opt-in, switched on per company by the owner or the super admin.
create table if not exists public.lead_routing_policy (
  company_id       uuid primary key references public.companies(id) on delete cascade,
  -- Master switch for handing the waiting pool out automatically.
  auto_distribute  boolean not null default false,
  -- Leads only flow to someone who has checked in today and not checked out.
  require_checkin  boolean not null default false,
  -- ...and whose check-in was inside the office fence.
  enforce_geofence boolean not null default false,
  office_lat       double precision,
  office_lng       double precision,
  radius_m         int not null default 300,
  -- Stop feeding anyone holding this many untouched "new" leads.
  max_new_backlog  int not null default 5,
  updated_at       timestamptz not null default now()
);

alter table public.lead_routing_policy enable row level security;

drop policy if exists lrp_read on public.lead_routing_policy;
create policy lrp_read on public.lead_routing_policy for select
  using (public.is_super_admin() or company_id = public.current_company_id());

drop policy if exists lrp_write on public.lead_routing_policy;
create policy lrp_write on public.lead_routing_policy for all
  using (public.is_super_admin() or (public.is_admin() and company_id = public.current_company_id()))
  with check (public.is_super_admin() or (public.is_admin() and company_id = public.current_company_id()));

-- Proof carried on the check-in itself: how far away it happened, and whether
-- that cleared the fence. NULL geo_ok = the company doesn't enforce a fence.
alter table public.attendance
  add column if not exists distance_m int,
  add column if not exists geo_ok boolean;

-- ------------------------------------------------------------- geofence ----
create or replace function public.geo_distance_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql immutable parallel safe as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2))
    * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

-- A check-in is never rejected — the rep's app keeps working exactly as before.
-- It is *stamped*, and the stamp is what decides whether leads flow. That way a
-- wrong office pin can't lock a whole team out of the app, and the manager can
-- see "checked in 340 m away" instead of guessing.
create or replace function public.stamp_checkin_geofence()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_pol public.lead_routing_policy%rowtype;
  v_d double precision;
begin
  select * into v_pol from public.lead_routing_policy where company_id = new.company_id;

  if v_pol.company_id is null or not v_pol.enforce_geofence
     or v_pol.office_lat is null or v_pol.office_lng is null then
    new.geo_ok := null;       -- fence not in use
    new.distance_m := null;
    return new;
  end if;

  if new.punch_in_lat is null or new.punch_in_lng is null then
    new.geo_ok := false;      -- location off: nothing to verify against
    new.distance_m := null;
    return new;
  end if;

  v_d := public.geo_distance_m(new.punch_in_lat, new.punch_in_lng, v_pol.office_lat, v_pol.office_lng);
  new.distance_m := round(v_d)::int;
  new.geo_ok := v_d <= v_pol.radius_m;
  return new;
end $$;

drop trigger if exists trg_stamp_checkin_geofence on public.attendance;
create trigger trg_stamp_checkin_geofence
  before insert on public.attendance
  for each row execute function public.stamp_checkin_geofence();

-- ---------------------------------------------------------- eligibility ----
create or replace function public.rep_on_shift(p_rep uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.attendance a
    where a.salesperson_id = p_rep
      and a.work_date = (now() at time zone 'Asia/Kolkata')::date
      and a.punch_in_at is not null
      and a.punch_out_at is null
      and coalesce(a.geo_ok, true)     -- null = no fence configured
  )
$$;

-- Who may receive a lead right now, and how many more they can take.
create or replace function public.eligible_reps(p_company uuid)
returns table (rep_id uuid, assigned_today int, backlog int, capacity int)
language sql stable security definer set search_path = public as $$
  with pol as (
    select coalesce(bool_or(require_checkin), false) as require_checkin,
           -- No policy row = no cap, so an unconfigured company keeps its old
           -- behaviour instead of silently starving.
           coalesce(max(max_new_backlog), 2147483647) as cap
    from public.lead_routing_policy where company_id = p_company
  ),
  r as (
    select pr.id
    from public.profiles pr, pol
    where pr.company_id = p_company
      and pr.role = 'salesperson'
      and pr.is_active
      and (not pol.require_checkin or public.rep_on_shift(pr.id))
  ),
  m as (
    select r.id,
      (select count(*)::int from public.contacts c
        where c.salesperson_id = r.id
          and c.assigned_at >= (date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')
      ) as assigned_today,
      (select count(*)::int from public.contacts c
        where c.salesperson_id = r.id and c.status = 'new'
      ) as backlog
    from r
  )
  select m.id, m.assigned_today, m.backlog,
         greatest(0, (select cap from pol) - m.backlog)::int
  from m
$$;

-- The single decision point every auto-assign path goes through.
create or replace function public.next_eligible_rep(p_company uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select rep_id from public.eligible_reps(p_company)
  where capacity > 0
  order by assigned_today, backlog, random()
  limit 1
$$;

-- Existing callers (facebook-poll, lead-capture, imports) keep the same name and
-- silently inherit check-in, fence and backlog rules.
create or replace function public.pick_next_rep(p_company uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select public.next_eligible_rep(p_company)
$$;

-- ------------------------------------------------------------ pool drain ----
-- Unassigned leads ARE the pool — no second table to drift out of sync. Oldest
-- first, so the 3 a.m. lead is handed out before this morning's.
--
-- Assignments are collected first and written as ONE update per rep, so the
-- existing bulk-assign trigger sends each telecaller a single "4 new leads"
-- push instead of four separate ones.
create or replace function public.assign_pool_core(
  p_company uuid, p_limit int default 200, p_ignore_gates boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_reps uuid[]; v_cap int[]; v_n int;
  v_plan_lead uuid[] := '{}'; v_plan_rep uuid[] := '{}';
  v_lead uuid; v_i int := 0; v_j int; v_pick int; v_k int;
  v_ids uuid[]; v_per jsonb := '{}'::jsonb; v_assigned int := 0;
begin
  if p_ignore_gates then
    select array_agg(pr.id order by (
             select count(*) from public.contacts c
             where c.salesperson_id = pr.id and c.status = 'new'))
      into v_reps
    from public.profiles pr
    where pr.company_id = p_company and pr.role = 'salesperson' and pr.is_active;
    v_n := coalesce(array_length(v_reps, 1), 0);
    v_cap := case when v_n = 0 then '{}'::int[] else array_fill(2147483647, array[v_n]) end;
  else
    select array_agg(rep_id order by assigned_today, backlog),
           array_agg(capacity order by assigned_today, backlog)
      into v_reps, v_cap
    from public.eligible_reps(p_company)
    where capacity > 0;
    v_n := coalesce(array_length(v_reps, 1), 0);
  end if;

  if v_n = 0 then
    return jsonb_build_object('ok', true, 'assigned', 0, 'reps', 0,
                              'note', 'koi eligible telecaller nahi (check-in / backlog)');
  end if;

  for v_lead in
    select id from public.contacts
    where company_id = p_company
      and salesperson_id is null
      and status not in ('booked', 'lost', 'not_interested', 'dnc', 'invalid')
    order by created_at asc
    limit greatest(p_limit, 1)
  loop
    v_pick := null;
    for v_k in 0 .. v_n - 1 loop
      v_j := 1 + ((v_i + v_k) % v_n);
      if v_cap[v_j] > 0 then
        v_pick := v_j;
        v_i := v_i + v_k + 1;
        exit;
      end if;
    end loop;
    exit when v_pick is null;                 -- everyone is at their limit
    v_plan_lead := v_plan_lead || v_lead;
    v_plan_rep  := v_plan_rep  || v_reps[v_pick];
    v_cap[v_pick] := v_cap[v_pick] - 1;
  end loop;

  for v_k in 1 .. v_n loop
    select array_agg(v_plan_lead[s]) into v_ids
    from generate_subscripts(v_plan_lead, 1) s
    where v_plan_rep[s] = v_reps[v_k];

    if v_ids is not null then
      update public.contacts set salesperson_id = v_reps[v_k] where id = any(v_ids);
      v_assigned := v_assigned + array_length(v_ids, 1);
      v_per := v_per || jsonb_build_object(
        coalesce((select full_name from public.profiles where id = v_reps[v_k]), v_reps[v_k]::text),
        array_length(v_ids, 1));
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'assigned', v_assigned, 'reps', v_n, 'per_rep', v_per);
end $$;

-- Internal only: triggers and cron call it as the rep / as the service role.
revoke all on function public.assign_pool_core(uuid, int, boolean) from public, anon, authenticated;

-- The dashboard-facing wrapper, which does check who is asking.
create or replace function public.assign_pool(
  p_company uuid, p_limit int default 200, p_ignore_gates boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_super_admin()
          or (public.is_admin() and p_company = public.current_company_id())) then
    raise exception 'not_authorized';
  end if;
  return public.assign_pool_core(p_company, p_limit, p_ignore_gates);
end $$;

grant execute on function public.assign_pool(uuid, int, boolean) to authenticated;

-- Safety net for leads that arrive while the team is already on shift.
create or replace function public.drain_lead_pools(p_limit int default 200)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_c uuid; v_out jsonb := '{}'::jsonb; v_r jsonb;
begin
  for v_c in
    select distinct c.company_id from public.contacts c
    join public.lead_routing_policy p
      on p.company_id = c.company_id and p.auto_distribute
    where c.salesperson_id is null
      and c.status not in ('booked', 'lost', 'not_interested', 'dnc', 'invalid')
  loop
    v_r := public.assign_pool_core(v_c, p_limit, false);
    if (v_r->>'assigned')::int > 0 then
      v_out := v_out || jsonb_build_object(v_c::text, v_r->'per_rep');
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'companies', v_out);
end $$;

revoke all on function public.drain_lead_pools(int) from public, anon, authenticated;

-- The manual "give everything out now" button keeps working, and keeps its
-- meaning: an explicit override that ignores the check-in gate. It now shares
-- the same distribution core instead of its own copy of round robin.
create or replace function public.distribute_unassigned_leads(p_limit int default 500)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_company uuid;
begin
  select company_id into v_company from public.profiles
   where id = auth.uid() and role = 'admin';
  if v_company is null and exists (select 1 from public.platform_admins where user_id = auth.uid()) then
    select company_id into v_company from public.profiles where id = auth.uid();
  end if;
  if v_company is null then raise exception 'not_authorized'; end if;
  return public.assign_pool_core(v_company, p_limit, true);
end $$;

-- --------------------------------------------------- check-in releases it ----
-- The moment someone starts their shift, their share of the waiting pool moves.
-- If the check-in missed the fence, the rep gets told on the phone in their hand
-- rather than wondering all morning why no leads arrived.
create or replace function public.on_checkin_release_leads()
returns trigger language plpgsql security definer
set search_path = public, vault, net as $$
declare v_pol public.lead_routing_policy%rowtype;
begin
  select * into v_pol from public.lead_routing_policy where company_id = new.company_id;

  if new.geo_ok is false then
    perform net.http_post(
      url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/notify-rep',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(
          (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), '')
      ),
      body := jsonb_build_object(
        'user_ids', jsonb_build_array(new.salesperson_id),
        'title', '📍 Check-in office se door hua',
        'body', case
          when new.distance_m is null
            then 'Location band thi, isliye check-in verify nahi hua — location on karke dobara check-in karein, tabhi nayi leads aayengi.'
          else 'Aap office se ' || new.distance_m || ' m door check-in hue. Office pahunch kar dobara check-in karein, tabhi nayi leads aayengi.'
        end,
        'channel', 'lead_assignments'
      )
    );
    return null;
  end if;

  if v_pol.auto_distribute and new.punch_in_at is not null then
    perform public.assign_pool_core(new.company_id, 200, false);
  end if;
  return null;
end $$;

drop trigger if exists trg_checkin_release_leads on public.attendance;
create trigger trg_checkin_release_leads
  after insert on public.attendance
  for each row execute function public.on_checkin_release_leads();

-- ------------------------------------------------------------- dashboard ----
-- One call powers the control page: policy, waiting pool and every rep's live
-- state. Super admin sees every company, a company admin only their own.
drop function if exists public.routing_board();
create or replace function public.routing_board()
returns table (
  company_id uuid, company_name text,
  auto_distribute boolean, require_checkin boolean, enforce_geofence boolean,
  office_lat double precision, office_lng double precision,
  radius_m int, max_new_backlog int,
  pool_waiting int,
  salesperson_id uuid, rep_name text,
  on_shift boolean, geo_ok boolean, distance_m int, punch_in_at timestamptz,
  assigned_today int, backlog int, capacity int
)
language sql stable security definer set search_path = public as $$
  with scope as (
    select public.is_super_admin() as is_super,
           public.is_admin() as is_adm,
           public.current_company_id() as cid
  ),
  co as (
    select c.id, c.name::text as name
    from public.companies c cross join scope s
    where s.is_super or (s.is_adm and c.id = s.cid)
  )
  select
    co.id, co.name,
    coalesce(p.auto_distribute, false),
    coalesce(p.require_checkin, false), coalesce(p.enforce_geofence, false),
    p.office_lat, p.office_lng,
    coalesce(p.radius_m, 300), coalesce(p.max_new_backlog, 5),
    (select count(*)::int from public.contacts c
      where c.company_id = co.id and c.salesperson_id is null
        and c.status not in ('booked','lost','not_interested','dnc','invalid')),
    pr.id, pr.full_name::text,
    public.rep_on_shift(pr.id),
    a.geo_ok, a.distance_m, a.punch_in_at,
    (select count(*)::int from public.contacts c
      where c.salesperson_id = pr.id
        and c.assigned_at >= (date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')),
    (select count(*)::int from public.contacts c
      where c.salesperson_id = pr.id and c.status = 'new'),
    greatest(0, coalesce(p.max_new_backlog, 5) - (select count(*)::int from public.contacts c
      where c.salesperson_id = pr.id and c.status = 'new'))::int
  from co
  left join public.lead_routing_policy p on p.company_id = co.id
  left join public.profiles pr
    on pr.company_id = co.id and pr.role = 'salesperson' and pr.is_active
  left join lateral (
    select att.geo_ok, att.distance_m, att.punch_in_at
    from public.attendance att
    where att.salesperson_id = pr.id
      and att.work_date = (now() at time zone 'Asia/Kolkata')::date
    order by att.punch_in_at desc nulls last
    limit 1
  ) a on true
$$;

grant execute on function public.routing_board() to authenticated;

-- Safety net: leads that land while the team is already checked in still move
-- within ten minutes even if their insert path never called pick_next_rep.
select cron.schedule(
  'drain-lead-pools-10m', '*/10 * * * *',
  $$ select public.drain_lead_pools(200); $$
);
