-- ============================================================
-- Speed-to-Lead — the 5-minute rule, wired into the CRM.
-- 1. lead-sla cron: every 10 min (function self-gates to 9:00–20:00 IST),
--    nudges the rep when a fresh lead sits uncalled 10 min, escalates at 45.
-- 2. get_speed_to_lead(): dashboard analytics — per-telecaller median
--    first-call response time and live SLA breaches, so the owner sees
--    exactly who jumps on leads and who lets them go cold.
-- ============================================================

create or replace function public.call_lead_sla()
returns void language plpgsql security definer set search_path = public, vault, net as $$
begin
  perform net.http_post(
    url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/lead-sla',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), '')
    ),
    body := '{}'::jsonb
  );
end $$;

do $$ begin perform cron.unschedule('lead-sla-guard'); exception when others then null; end $$;
select cron.schedule('lead-sla-guard', '*/10 * * * *', $$select public.call_lead_sla()$$);

-- ---------- dashboard analytics ----------
-- First-call response time per telecaller: minutes from assigned_at to the
-- first call_log on that contact. Median over 7 days + today, plus leads
-- currently breaching (assigned > 10 min ago, still uncalled, still open).
create or replace function public.get_speed_to_lead(p_company uuid default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_is_platform boolean;
  v_out jsonb;
begin
  select exists(select 1 from public.platform_admins where user_id = auth.uid()) into v_is_platform;
  if v_is_platform and p_company is not null then
    v_company := p_company;
  else
    select company_id into v_company from public.profiles where id = auth.uid();
  end if;
  if v_company is null then return jsonb_build_object('reps', '[]'::jsonb); end if;

  with firsts as (
    -- Calls are mostly logged by phone (only some carry contact_id), so a call
    -- counts if it matches the lead by id OR by last-10-digit phone.
    select
      c.id as contact_id,
      c.salesperson_id,
      c.assigned_at,
      min(cl.created_at) as first_call_at
    from public.contacts c
    left join public.call_logs cl
      on cl.created_at >= c.assigned_at
      and cl.company_id = c.company_id
      and (
        cl.contact_id = c.id
        or right(regexp_replace(cl.phone, '\D', '', 'g'), 10)
           = right(regexp_replace(c.phone, '\D', '', 'g'), 10)
      )
    where c.company_id = v_company
      and c.salesperson_id is not null
      and c.assigned_at >= now() - interval '7 days'
    group by c.id, c.salesperson_id, c.assigned_at
  ),
  per_rep as (
    select
      f.salesperson_id,
      count(*) as leads_7d,
      count(*) filter (where f.first_call_at is not null) as called_7d,
      percentile_cont(0.5) within group (
        order by extract(epoch from (f.first_call_at - f.assigned_at)) / 60.0
      ) filter (where f.first_call_at is not null) as median_min,
      count(*) filter (
        where f.first_call_at is null
          and f.assigned_at <= now() - interval '10 minutes'
      ) as breaching_now,
      count(*) filter (
        where f.first_call_at is not null
          and f.first_call_at - f.assigned_at <= interval '5 minutes'
      ) as within_5min
    from firsts f
    group by f.salesperson_id
  )
  select jsonb_build_object(
    'reps', coalesce(jsonb_agg(jsonb_build_object(
      'id', pr.salesperson_id,
      'name', coalesce(p.full_name, '—'),
      'leads_7d', pr.leads_7d,
      'called_7d', pr.called_7d,
      'median_min', round(coalesce(pr.median_min, 0)::numeric, 1),
      'within_5min', pr.within_5min,
      'breaching_now', pr.breaching_now
    ) order by pr.median_min nulls last), '[]'::jsonb),
    'total_breaching', coalesce((select sum(breaching_now) from per_rep), 0)
  ) into v_out
  from per_rep pr
  join public.profiles p on p.id = pr.salesperson_id;

  return coalesce(v_out, jsonb_build_object('reps', '[]'::jsonb, 'total_breaching', 0));
end $$;

grant execute on function public.get_speed_to_lead(uuid) to authenticated;
