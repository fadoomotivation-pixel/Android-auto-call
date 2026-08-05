-- Read the STORED stage, not a re-derivation from status.
--
-- 0145 swapped the hardcoded lists onto lead_is_open(status) and friends, which
-- map status -> stage on the fly. That quietly threw away the point of the
-- monotonic guard: once a no-answer lands on a won lead, status is 'no_answer',
-- so lead_is_won(status) says false while contacts.stage is still 'won'. The
-- stored column is the authority; these predicates take it.
--
-- The status-based predicates stay, for the genuine case of judging a
-- disposition before it is written. Nothing holding a row should use them.

create or replace function public.stage_outcome(p_stage text)
returns text language sql stable as $$
  select s.outcome from public.lead_stages s where s.code = p_stage;
$$;

create or replace function public.stage_is_open(p_stage text)
returns boolean language sql stable as $$
  select coalesce((select not s.is_terminal from public.lead_stages s where s.code = p_stage), true);
$$;

create or replace function public.stage_is_won(p_stage text)
returns boolean language sql stable as $$
  select coalesce((select s.outcome = 'won' from public.lead_stages s where s.code = p_stage), false);
$$;

create or replace function public.stage_counts_as_sale(p_stage text)
returns boolean language sql stable as $$
  select coalesce((select s.counts_as_sale from public.lead_stages s where s.code = p_stage), false);
$$;

create or replace function public.stage_is_advanced(p_stage text)
returns boolean language sql stable as $$
  select coalesce((select s.is_advanced from public.lead_stages s where s.code = p_stage), false);
$$;

comment on function public.stage_is_open(text) is
  'The one definition of an open lead, read from the stored contacts.stage.';

-- All of a function's replacements are applied to one text and executed ONCE.
-- Applying them one at a time re-creates the function in an intermediate state,
-- and Postgres validates a SQL body on creation: renaming a column in step one
-- makes step one's own function invalid until step two lands.
do $mig$
declare
  v_def text; v_new text; i int; fn text;
  fns text[] := array['campaign_lead_health','assign_pool_core','drain_lead_pools','routing_board',
                      'get_company_daily_stats','get_team_leaderboard','rep_week_summary','rep_integrity'];
  swaps text[][] := array[
    ['campaign_lead_health', 'c.status::text as status,', 'c.stage as stage,'],
    ['campaign_lead_health', 'public.lead_is_advanced(status::public.contact_status)', 'public.stage_is_advanced(stage)'],
    ['assign_pool_core',        'public.lead_is_open(status)',        'public.stage_is_open(stage)'],
    ['drain_lead_pools',        'public.lead_is_open(c.status)',      'public.stage_is_open(c.stage)'],
    ['routing_board',           'public.lead_is_open(c.status)',      'public.stage_is_open(c.stage)'],
    ['get_company_daily_stats', 'public.lead_is_open(c.status)',      'public.stage_is_open(c.stage)'],
    ['get_company_daily_stats', 'public.lead_is_won(status)',         'public.stage_is_won(stage)'],
    ['get_team_leaderboard',    'public.lead_is_advanced(ct.status)', 'public.stage_is_advanced(ct.stage)'],
    ['rep_week_summary',        'public.lead_counts_as_sale(status)', 'public.stage_counts_as_sale(stage)'],
    ['rep_integrity',           'public.lead_counts_as_sale(ct.status)', 'public.stage_counts_as_sale(ct.stage)'],
    ['rep_integrity',           'public.lead_outcome(ct.status) = ''lost''', 'public.stage_outcome(ct.stage) = ''lost''']
  ];
begin
  foreach fn in array fns loop
    select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = fn;
    if v_def is null then raise exception 'function % not found', fn; end if;
    v_new := v_def;
    for i in 1 .. array_length(swaps, 1) loop
      if swaps[i][1] = fn then
        if position(swaps[i][2] in v_new) = 0 then
          raise exception 'pattern not found in %: %', fn, swaps[i][2];
        end if;
        v_new := replace(v_new, swaps[i][2], swaps[i][3]);
      end if;
    end loop;
    execute v_new;
  end loop;
end
$mig$;

-- The follow-up closer keys off the STAGE transition, not the disposition. A
-- lead is finished only when its stage becomes terminal; a disposition change
-- the monotonic guard refused must never cancel anybody's callbacks.
create or replace function public.close_followups_on_lead_closed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.stage is distinct from old.stage
     and not public.stage_is_open(new.stage) then
    update public.follow_ups f
       set status = 'done', completed_at = now()
     where f.contact_id = new.id
       and f.status = 'pending';
  end if;
  return null;
end $function$;

-- BEHAVIOUR CHANGE, deliberate: the old list here was ('lost','not_interested')
-- and omitted 'dnc', so a customer who visited the site and then asked not to
-- be called could be closed with no visit outcome recorded - the one case where
-- knowing what happened at the visit matters most. All three map to
-- outcome='lost', so all three are now guarded.
--
-- Safe on ordering: BEFORE triggers fire alphabetically, and
-- trg_contacts_stage_sync ("c") runs before trg_require_visit_outcome ("r"),
-- so new.stage is already correct here.
create or replace function public.require_visit_outcome()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if public.stage_outcome(new.stage) = 'lost'
     and old.stage is distinct from new.stage
     and old.site_visit_arrived_at is not null
     and not exists (select 1 from public.site_visit_outcomes o where o.contact_id = new.id)
  then
    raise exception
      'This customer visited the site. Record what happened at the visit before closing the lead.'
      using errcode = 'check_violation', hint = 'site_visit_outcome_required';
  end if;
  return new;
end $function$;

-- The last four hand-written lists, all spelling out "the New stage" as
-- ('new','queued'), plus one spelling out Interested.
--
-- ensure_callback_followup's `new.status = 'callback'` is deliberately LEFT
-- ALONE: "did the rep pick Callback" is a disposition question, and disposition
-- is exactly what status means now. Same for apply_call_to_new_lead writing
-- status = 'no_answer'. The rule is not "never name a status" - it is "never
-- derive a lifecycle bucket by hand".
do $mig$
declare
  v_def text; v_new text; i int; fn text;
  fns text[] := array['apply_call_to_new_lead','stamp_handled_from_status','super_hq','get_company_daily_stats'];
  swaps text[][] := array[
    ['apply_call_to_new_lead',    'c.st not in (''new'', ''queued'')',             'c.stage <> ''new'''],
    ['stamp_handled_from_status', 'new.status::text not in (''new'', ''queued'')', 'public.lead_stage_for(new.status) <> ''new'''],
    ['super_hq',                  'ct.status in (''new'', ''queued'')',            'ct.stage = ''new'''],
    ['get_company_daily_stats',   'status::text = ''interested''',                 'stage = ''interested''']
  ];
begin
  foreach fn in array fns loop
    select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = fn;
    if v_def is null then raise exception 'function % not found', fn; end if;
    v_new := v_def;
    for i in 1 .. array_length(swaps, 1) loop
      if swaps[i][1] = fn then
        if position(swaps[i][2] in v_new) = 0 then
          raise exception 'pattern not found in %: %', fn, swaps[i][2];
        end if;
        v_new := replace(v_new, swaps[i][2], swaps[i][3]);
      end if;
    end loop;
    execute v_new;
  end loop;
end
$mig$;
