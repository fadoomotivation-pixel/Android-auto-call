-- 0236 One plan for the day, read by the app, the web app and her WhatsApp.
--
-- 24 Oct, Nidhi's Daily Pulse:
--   "🤝 19 things you said on a call are still not done — Tell price details
--    later for Mamta, 8 days (+18 more)"
-- The founder: "ab +18 se uske kya pta chalega" — what does "+18" tell her?
-- Nothing. No screen listed those eighteen, and the app's own Today's Plan
-- printed "+N more" as plain text you could not tap either.
--
-- And: "android me kuch or aaye, waha kuch or" — the app must not say one
-- thing and the other place another. It did, because each place built its
-- own list. Android ordered Call now with five tiers in Kotlin
-- (CallNowQueue.kt). The web app ordered it by due time in TypeScript. The
-- report picked "Priority next" from follow_ups in Deno, compared a UTC date
-- with an IST one, and called this morning's missed 11 AM callbacks "next".
--
-- So the day's plan is now ONE function, and everything reads it:
--
--   1. v_lead_workstate gains call_tier and call_key — the Call now order the
--      Android app has used (waiting buyer → promise not kept → spoke before →
--      rung under 4 times → rung 4+), written once, here. Sort by
--      (call_tier, call_key nulls last).
--   2. rep_plan(rep) returns her day: Call now, what she promised on recorded
--      calls (every one, grouped by person), buyers waiting for a WhatsApp
--      reply, site visits today and tomorrow, visits waiting on an outcome,
--      and the WhatsApps already written for her. Same filters the app's own
--      buckets use, so a count in one place is the count in the other.
--
-- security invoker: it reads as the person asking. A rep gets her own plan. A
-- company admin can ask for one of their reps; the super admin for anyone;
-- the service role (the WhatsApp report) for anyone. Anyone else gets null.

-- ---------------------------------------------------------------------------
-- 1. The Call now order, once.
-- ---------------------------------------------------------------------------
create or replace view public.v_lead_workstate with (security_invoker = true) as
 SELECT c.id AS contact_id,
    c.company_id,
    c.salesperson_id,
    c.name,
    c.phone,
    c.status AS disposition,
    c.stage,
    s.label AS stage_label,
    s.short_label AS stage_short_label,
    s.color AS stage_color,
    s.sort_order AS stage_sort,
    s.outcome,
    s.is_terminal,
    s.is_pipeline,
    s.is_advanced,
    s.counts_as_sale,
    s.rep_visible,
    s.analytics_visible,
    a.action_state,
    a.due_at,
    c.site_visit_at,
    c.created_at,
    c.last_contacted_at,
    c.handled_at,
    c.temperature,
    lc.last_call_at,
    lc.last_call_seconds,
    lc.calls_total,
    a.due_at IS NOT NULL AND timezone('Asia/Kolkata'::text, a.due_at)::date = timezone('Asia/Kolkata'::text, now())::date AS is_due_today,
    timezone('Asia/Kolkata'::text, c.handled_at)::date = timezone('Asia/Kolkata'::text, now())::date AS handled_today,
    a.waiting_since,
    a.promise_due_since,
    a.promise_text,
    lc.best_call_seconds,
    -- 0 the buyer wrote and nobody answered · 1 a promise was not kept ·
    -- 2 someone has really spoken to them (30s+) · 3 rung under 4 times ·
    -- 4 rung 4+ times, never answered.
    CASE
      WHEN a.waiting_since IS NOT NULL THEN 0
      WHEN a.promise_due_since IS NOT NULL THEN 1
      WHEN COALESCE(lc.best_call_seconds, 0) >= 30 THEN 2
      WHEN COALESCE(lc.calls_total, 0) < 4 THEN 3
      ELSE 4
    END AS call_tier,
    -- Inside tier 2 the warmest first (latest real talk). Everywhere else the
    -- oldest due time, then when the lead arrived.
    CASE
      WHEN a.waiting_since IS NULL AND a.promise_due_since IS NULL AND COALESCE(lc.best_call_seconds, 0) >= 30
        THEN - EXTRACT(epoch FROM lc.last_call_at)
      ELSE EXTRACT(epoch FROM COALESCE(a.due_at, c.created_at))
    END AS call_key
   FROM contacts c
     JOIN lead_stages s ON s.code = c.stage
     JOIN v_lead_action_state a ON a.contact_id = c.id
     LEFT JOIN LATERAL ( SELECT max(cl.started_at) AS last_call_at,
            COALESCE((array_agg(cl.duration_seconds ORDER BY cl.started_at DESC))[1], 0) AS last_call_seconds,
            count(*)::integer AS calls_total,
            COALESCE(max(cl.duration_seconds), 0) AS best_call_seconds
           FROM call_logs cl
          WHERE cl.contact_id = c.id AND COALESCE(cl.off_crm, false) = false
         HAVING count(*) > 0) lc ON true;

-- ---------------------------------------------------------------------------
-- 2. Her day, as one answer.
-- ---------------------------------------------------------------------------
create or replace function public.rep_plan(p_rep uuid default null, p_limit int default 50)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_rep uuid := coalesce(p_rep, auth.uid());
  v_me  uuid := auth.uid();
  v_lim int  := least(greatest(coalesce(p_limit, 50), 1), 500);
  -- The day this plan is FOR: today until noon, tomorrow after. The evening
  -- WhatsApp and a rep opening the app at 8 PM are both planning tomorrow.
  v_ist timestamp := timezone('Asia/Kolkata', now());
  v_day date := v_ist::date + case when extract(hour from v_ist) >= 12 then 1 else 0 end;
  v_dayname text := to_char(v_day, 'FMDay');
  v_out jsonb;
begin
  if v_rep is null then
    return null;
  end if;

  -- Somebody else's plan: their own company's admin, or the super admin.
  if v_me is not null and v_me <> v_rep and not public.is_super_admin() and not exists (
    select 1 from public.profiles me
      join public.profiles r on r.company_id = me.company_id
     where me.id = v_me and me.role = 'admin' and r.id = v_rep
  ) then
    return null;
  end if;

  with
  ws as (
    select w.* from public.v_lead_workstate w where w.salesperson_id = v_rep
  ),
  -- Who to ring, in the app's order. Membership is action_state, exactly
  -- what the Call now chip counts.
  callnow as (
    select w.contact_id, w.name, w.phone, w.stage_label, w.call_tier, w.call_key, w.due_at,
           w.waiting_since, w.promise_due_since, w.promise_text, w.calls_total,
           w.best_call_seconds, w.last_call_at, m.where_we_left_it as memory
      from ws w
      left join public.lead_memory m on m.contact_id = w.contact_id
     where w.action_state in ('overdue', 'call_now')
  ),
  -- Everything she said on a recorded call she would do: not yet due ('open')
  -- and late ('missed'). Three weeks, the window Call now uses. Grouped by
  -- person, because "send the location and fix Sunday" is one call to Laxman,
  -- not two jobs.
  --
  -- A promise that names the plan's day comes first. On Saturday night Nidhi
  -- had four "Fix Sunday site visit"s, and sorted by age they sat under eight
  -- older ones — the four that could still turn into visits the next morning.
  promises as (
    select p.contact_id,
           min(p.lead_name) as name, min(p.lead_phone) as phone, min(p.stage) as stage,
           min(p.said_at) as first_said, max(p.days_open) as oldest_days,
           bool_or(p.promise ilike '%' || v_dayname || '%') as names_day,
           bool_or(p.status = 'missed') as late, count(*) as n,
           jsonb_agg(jsonb_build_object(
             'kind', p.kind, 'promise', p.promise, 'quote', p.quote,
             'days', p.days_open, 'late', p.status = 'missed', 'said_at', p.said_at
           ) order by p.said_at) as items
      from public.v_open_promises p
     where p.salesperson_id = v_rep and not p.is_terminal
       and p.said_at > now() - interval '21 days'
     group by p.contact_id
  ),
  -- The buyer wrote and nobody answered — the same rule that puts them first
  -- in Call now (waiting_since), with their last words when WhatsApp has them.
  waiting as (
    select w.contact_id, w.name, w.phone, w.waiting_since,
           floor(extract(epoch from now() - w.waiting_since) / 60)::int as minutes,
           a.their_last_message as last_text, a.media_kind
      from ws w
      left join lateral (
        select x.their_last_message, x.media_kind
          from public.v_wa_awaiting_reply x
         where x.contact_id = w.contact_id and x.salesperson_id = v_rep
         limit 1
      ) a on true
     where w.waiting_since is not null and w.action_state <> 'none'
  ),
  -- Booked for the rest of today or tomorrow, and nobody has arrived yet.
  visits as (
    select c.id as contact_id, c.name, c.phone, c.site_visit_at as at, c.site_visit_project as project
      from public.contacts c
      join public.lead_stages s on s.code = c.stage
     where c.salesperson_id = v_rep and not s.is_terminal
       and c.site_visit_arrived_at is null
       and c.site_visit_at >= now()
       and c.site_visit_at < (date_trunc('day', timezone('Asia/Kolkata', now())) + interval '2 days')
                              at time zone 'Asia/Kolkata'
  ),
  -- The visit day has gone and nobody wrote what happened. The app's
  -- "Waiting on an outcome" list reads the same view.
  visits_pending as (
    select v.contact_id, v.name, v.phone, v.visit_at, v.days_waiting
      from public.v_pending_site_visit_outcomes v
     where v.salesperson_id = v_rep
  ),
  -- Written at the end of a call, waiting for her Approve. Same filter as the
  -- app's "WhatsApp ready" bucket (Repository.readyDrafts).
  drafts as (
    select d.id, d.contact_id, c.name, c.phone, d.body, d.created_at
      from public.followup_drafts d
      join public.contacts c on c.id = d.contact_id
     where d.salesperson_id = v_rep and d.status = 'suggested' and d.source = 'after_call'
       and d.created_at >= now() - interval '24 hours'
  )
  select jsonb_build_object(
    'rep', v_rep,
    'at', now(),
    'plan_day', v_day,
    'counts', jsonb_build_object(
      'call_now', (select count(*) from callnow),
      'promise_people', (select count(*) from promises),
      'promises', (select coalesce(sum(n), 0) from promises),
      'promises_late', (select count(*) from promises where late),
      'waiting', (select count(*) from waiting),
      'visits', (select count(*) from visits),
      'visits_pending', (select count(*) from visits_pending),
      'drafts', (select count(*) from drafts)
    ),
    'call_now', coalesce((
      select jsonb_agg(jsonb_build_object(
        'contact_id', x.contact_id, 'name', x.name, 'phone', x.phone, 'tier', x.call_tier,
        'due_at', x.due_at, 'waiting_since', x.waiting_since, 'promise_since', x.promise_due_since,
        'promise', x.promise_text, 'calls', coalesce(x.calls_total, 0),
        'best_call_seconds', coalesce(x.best_call_seconds, 0), 'last_call_at', x.last_call_at,
        'memory', x.memory, 'stage', x.stage_label
      ) order by x.call_tier, x.call_key nulls last)
      from (select * from callnow order by call_tier, call_key nulls last limit v_lim) x), '[]'::jsonb),
    'promises', coalesce((
      select jsonb_agg(jsonb_build_object(
        'contact_id', x.contact_id, 'name', x.name, 'phone', x.phone, 'stage', x.stage,
        'late', x.late, 'oldest_days', x.oldest_days, 'names_day', x.names_day, 'items', x.items
      ) order by x.names_day desc, x.late desc, x.first_said)
      from (select * from promises order by names_day desc, late desc, first_said limit v_lim) x), '[]'::jsonb),
    'waiting', coalesce((
      select jsonb_agg(jsonb_build_object(
        'contact_id', x.contact_id, 'name', x.name, 'phone', x.phone,
        'since', x.waiting_since, 'minutes', x.minutes, 'text', x.last_text, 'media', x.media_kind
      ) order by x.waiting_since)
      from (select * from waiting order by waiting_since limit v_lim) x), '[]'::jsonb),
    'visits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'contact_id', x.contact_id, 'name', x.name, 'phone', x.phone, 'at', x.at, 'project', x.project
      ) order by x.at)
      from (select * from visits order by at limit v_lim) x), '[]'::jsonb),
    'visits_pending', coalesce((
      select jsonb_agg(jsonb_build_object(
        'contact_id', x.contact_id, 'name', x.name, 'phone', x.phone,
        'visit_at', x.visit_at, 'days_waiting', x.days_waiting
      ) order by x.days_waiting desc nulls last)
      from (select * from visits_pending order by days_waiting desc nulls last limit v_lim) x), '[]'::jsonb),
    'drafts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'contact_id', x.contact_id, 'name', x.name, 'phone', x.phone,
        'body', x.body, 'created_at', x.created_at
      ) order by x.created_at desc)
      from (select * from drafts order by created_at desc limit v_lim) x), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;

comment on function public.rep_plan(uuid, int) is
  'A telecaller''s day in one answer: Call now (app order), promises from recorded calls, buyers waiting '
  'for a WhatsApp reply, visits today/tomorrow, visits waiting on an outcome, drafts ready to approve. '
  'Read by the Android app, the /app web app and her Daily Pulse, so all three agree. 0236.';

revoke all on function public.rep_plan(uuid, int) from public, anon;
grant execute on function public.rep_plan(uuid, int) to authenticated, service_role;
