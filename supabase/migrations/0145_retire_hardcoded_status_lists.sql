-- Retire every hand-written status grouping in SQL onto the canonical predicates.
--
-- PRINCIPLE. Asking "what happened on the last call" may still read status —
-- that is what status now means, and ad_lead_autopsy's not_interested column is
-- a legitimate disposition question. What is banned is deriving a LIFECYCLE or
-- OUTCOME grouping by hand. Those come from lead_stages, always.
--
-- The mechanical swaps below are done by substitution against
-- pg_get_functiondef with an assertion that the pattern matched exactly once,
-- because hand-retyping a 200-line body is how a transcription slip reaches
-- production. Anything whose MEANING changes is written out in full instead.

do $mig$
declare
  v_def text;
  v_new text;
  swaps text[][] := array[
    ['assign_pool_core',
     'status not in (''booked'', ''lost'', ''not_interested'', ''dnc'', ''invalid'')',
     'public.lead_is_open(status)'],
    ['drain_lead_pools',
     'c.status not in (''booked'', ''lost'', ''not_interested'', ''dnc'', ''invalid'')',
     'public.lead_is_open(c.status)'],
    ['routing_board',
     'c.status not in (''booked'',''lost'',''not_interested'',''dnc'',''invalid'')',
     'public.lead_is_open(c.status)'],
    ['campaign_lead_health',
     'status in (''interested'',''site_visit'',''negotiation'',''proposal'',''token_paid'',''booked'')',
     'public.lead_is_advanced(status::public.contact_status)'],
    ['get_team_leaderboard',
     'ct.status::text in (''interested'',''booked'')',
     'public.lead_is_advanced(ct.status)'],
    ['rep_week_summary',
     'status in (''booked'', ''token_paid'')',
     'public.lead_counts_as_sale(status)'],
    ['rep_integrity',
     'ct.status::text in (''booked'', ''token_paid'')',
     'public.lead_counts_as_sale(ct.status)'],
    ['rep_integrity',
     'ct.status::text in (''not_interested'', ''lost'', ''dnc'')',
     'public.lead_outcome(ct.status) = ''lost'''],
    ['get_company_daily_stats',
     'closed text[] := array[''booked'',''lost'',''dnc'',''not_interested''];',
     '-- open/closed now comes from lead_stages'],
    ['get_company_daily_stats',
     'not (c.status::text = any(closed))',
     'public.lead_is_open(c.status)'],
    ['get_company_daily_stats',
     'status::text = ''booked''',
     'public.lead_is_won(status)']
  ];
  i int;
begin
  for i in 1 .. array_length(swaps, 1) loop
    select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = swaps[i][1];

    if v_def is null then
      raise exception 'function % not found', swaps[i][1];
    end if;
    if position(swaps[i][2] in v_def) = 0 then
      raise exception 'pattern not found in %: %', swaps[i][1], swaps[i][2];
    end if;

    v_new := replace(v_def, swaps[i][2], swaps[i][3]);
    execute v_new;

    select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = swaps[i][1];
    if position(swaps[i][2] in v_def) <> 0 then
      raise exception 'substitution did not take in %', swaps[i][1];
    end if;
  end loop;
end
$mig$;

-- ─────────── semantic changes, written out in full ───────────

-- token_paid STOPS closing follow-ups. It was in this list and nobody else's,
-- which is why the same lead was "closed" here and "open" in the round-robin.
-- A token payment is money on a deal that is still live: cancelling its
-- callbacks silently ended the chase on the most valuable leads in the book.
create or replace function public.close_followups_on_lead_closed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status is distinct from old.status
     and not public.lead_is_open(new.status) then
    update public.follow_ups f
       set status = 'done', completed_at = now()
     where f.contact_id = new.id
       and f.status = 'pending';
  end if;
  return null;
end $function$;

-- Reassignment no longer rewrites the disposition.
--
-- It used to do `new.status := 'new'` so the lead reappeared in the new rep's
-- New pile. That is an ACTION concern solved by an action state, and paying for
-- it with the lead's history was the same stage/action confusion this whole
-- migration exists to end: a lead that had reached Interested came back as New
-- and the qualification was gone. v_lead_action_state now returns call_now for
-- a lead assigned after its last contact, so the new rep still sees it — and
-- the deal keeps its stage and its history.
create or replace function public.stamp_assigned_at()
returns trigger
language plpgsql
as $function$
declare
  v_owner_changed boolean;
begin
  v_owner_changed := new.salesperson_id is not null
    and (tg_op = 'INSERT' or new.salesperson_id is distinct from old.salesperson_id);

  if v_owner_changed then
    new.assigned_at := now();
    -- Keep the real origin date once (owner/analytics), then reset the visible
    -- "Added" date so the telecaller sees a fresh lead.
    if new.origin_created_at is null then
      new.origin_created_at := coalesce(
        case when tg_op = 'UPDATE' then old.created_at else new.created_at end, now());
    end if;
    new.created_at := now();
  end if;
  return new;
end $function$;

-- The funnel, from the canonical stage rather than five status lists.
create or replace function public.super_hq_funnel(p_company uuid default null::uuid)
returns table(leads_total integer, contacted integer, interested integer, site_visit integer, booked integer)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;
  return query
  select
    count(*)::int,
    count(*) filter (where ct.last_contacted_at is not null or s.sort_order > 10)::int,
    count(*) filter (where s.is_advanced)::int,
    count(*) filter (where s.is_pipeline or s.outcome = 'won')::int,
    count(*) filter (where s.outcome = 'won')::int
  from public.contacts ct
  join public.lead_stages s on s.code = ct.stage
  where p_company is null or ct.company_id = p_company;
end $function$;

-- Ad autopsy: outcome buckets from lead_stages; the not_interested column stays
-- on status, because "did they actually say no" is a disposition question.
create or replace function public.ad_lead_autopsy(p_since timestamp with time zone, p_until timestamp with time zone default null::timestamp with time zone)
returns table(ad_id text, leads integer, never_called integer, tried_not_reached integer, spoke integer, qualified integer, booked integer, not_interested integer, wrong_or_dnc integer, still_open integer, median_first_call_mins integer)
language sql
stable security definer
set search_path to 'public'
as $function$
  with lead as (
    select
      c.id, c.extra->>'ad_id' as ad_id, c.status as st, c.stage,
      (c.extra ? 'wrong_number') as wrong_number, c.created_at,
      (select min(cl.started_at) from call_logs cl where cl.contact_id = c.id) as first_call_at,
      exists (select 1 from call_logs cl where cl.contact_id = c.id) as called,
      exists (select 1 from call_logs cl where cl.contact_id = c.id and coalesce(cl.duration_seconds,0) >= 30) as reached
    from contacts c
    where c.lead_source = 'facebook' and c.extra ? 'ad_id'
      and c.created_at >= p_since and (p_until is null or c.created_at <= p_until)
  )
  select l.ad_id, count(*)::int,
    count(*) filter (where not l.called)::int,
    count(*) filter (where l.called and not l.reached)::int,
    count(*) filter (where l.reached)::int,
    count(*) filter (where s.is_advanced)::int,
    count(*) filter (where s.outcome = 'won')::int,
    count(*) filter (where l.st = 'not_interested')::int,
    count(*) filter (where l.stage = 'dnc' or l.wrong_number)::int,
    count(*) filter (where not s.is_terminal and not s.is_advanced)::int,
    coalesce(percentile_cont(0.5) within group (
      order by extract(epoch from (l.first_call_at - l.created_at))/60
    ) filter (where l.first_call_at is not null), 0)::int
  from lead l
  join public.lead_stages s on s.code = l.stage
  where l.ad_id is not null group by l.ad_id
$function$;
