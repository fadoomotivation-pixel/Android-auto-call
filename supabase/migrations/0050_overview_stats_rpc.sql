-- Fast dashboard overview: everything aggregated in ONE round trip instead of
-- pulling thousands of call rows into the web server. Company-scoped and safe
-- (resolves the caller's own company; only platform admins may cross companies).
-- (Applied live via MCP.)
create or replace function public.get_overview_stats(p_company uuid default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_company uuid;
  v_is_super boolean;
  v_result jsonb;
begin
  if v_uid is null then return '{}'::jsonb; end if;
  select role, company_id into v_role, v_company from public.profiles where id = v_uid;
  v_is_super := exists (select 1 from public.platform_admins where user_id = v_uid);
  if v_is_super then v_company := p_company; end if;

  with scope_calls as (
    select * from public.call_logs
    where (v_company is null or company_id = v_company)
      and created_at >= now() - interval '14 days'
  ),
  totals as (
    select
      (select count(*) from public.profiles where role = 'salesperson'
         and (v_company is null or company_id = v_company)) as salespeople,
      (select count(*) from public.contacts
         where (v_company is null or company_id = v_company)) as contacts,
      (select count(*) from public.call_logs
         where (v_company is null or company_id = v_company)) as calls_total,
      (select coalesce(sum(duration_seconds),0) from scope_calls) as talk_14d
  ),
  trend as (
    select jsonb_agg(jsonb_build_object('d', d::text, 'n', coalesce(n,0)) order by d) as days
    from (select gs::date as d from generate_series(current_date - 6, current_date, interval '1 day') gs) days
    left join (select created_at::date as d, count(*) n from scope_calls
               where created_at >= current_date - 6 group by 1) c using (d)
  ),
  outcomes as (
    select jsonb_agg(jsonb_build_object('o', coalesce(outcome,'unknown'), 'n', n) order by n desc) as list
    from (select outcome, count(*) n from scope_calls group by outcome) x
  ),
  board as (
    select jsonb_agg(jsonb_build_object(
      'id', sp.salesperson_id, 'name', coalesce(p.full_name,'—'),
      'calls', sp.calls, 'connected', sp.connected) order by sp.calls desc) as list
    from (select salesperson_id, count(*) calls,
                 count(*) filter (where outcome='connected') connected
          from scope_calls where created_at >= now() - interval '24 hours'
          group by salesperson_id order by calls desc limit 8) sp
    left join public.profiles p on p.id = sp.salesperson_id
  )
  select jsonb_build_object(
    'salespeople', totals.salespeople, 'contacts', totals.contacts,
    'calls_total', totals.calls_total, 'talk_14d', totals.talk_14d,
    'trend', coalesce(trend.days, '[]'::jsonb),
    'outcomes', coalesce(outcomes.list, '[]'::jsonb),
    'leaderboard', coalesce(board.list, '[]'::jsonb)
  ) into v_result from totals, trend, outcomes, board;
  return v_result;
end $$;

grant execute on function public.get_overview_stats(uuid) to authenticated;
