-- A telecaller hears about their own calls every Monday.
--
-- The weekly review (0139) sent seven days of counts and named the best and
-- worst SCORED component — "Calls with a note or next step, 18% of the time".
-- Its own comment said what was missing: "Best skill: handling objections"
-- needs the recordings put through the coaching brain, and it was not built.
--
-- It is now. rep-week-review reads the week's recorded calls (each already has
-- an English summary, the buyer's objections and, for some, a coach rating),
-- counts the patterns itself — "16 of 18 interested buyers ended with no visit
-- day" is arithmetic, not AI — and asks the coaching brain for two things done
-- well and two to fix, each tied to a real call by the buyer's name and day.
-- One AI call per telecaller per week.
--
-- Stored here, once per rep per week, because:
--   * the founder previews it and the rep then receives THE SAME text, not a
--     second roll of the dice;
--   * the AI is paid for once, early Monday, not inside the 10 AM send loop;
--   * the app can show it to the rep later without asking anyone again.

create table if not exists public.rep_week_reviews (
  salesperson_id  uuid not null references public.profiles(id) on delete cascade,
  -- The last day of the week the review is about (the 7 days ending here).
  week_to         date not null,
  company_id      uuid not null references public.companies(id) on delete cascade,
  week_from       date not null,
  -- How many recorded calls the coaching was built from. 0 = numbers only.
  recorded_calls  int  not null default 0,
  -- { did_well: [{text, call}], fix: [{text, say, call}], focus, best_call }
  coaching        jsonb,
  text            text not null,
  model           text,
  built_at        timestamptz not null default now(),
  sent_at         timestamptz,
  primary key (salesperson_id, week_to)
);

create index if not exists rep_week_reviews_company_idx
  on public.rep_week_reviews (company_id, week_to desc);

alter table public.rep_week_reviews enable row level security;

-- The rep reads their own; an admin reads their company's; the platform owner
-- reads every company's. Only the service role writes.
drop policy if exists rep_week_reviews_read on public.rep_week_reviews;
create policy rep_week_reviews_read on public.rep_week_reviews
  for select using (
    salesperson_id = auth.uid()
    or is_super_admin()
    or (is_admin() and company_id = current_company_id())
  );

comment on table public.rep_week_reviews is
  'One weekly report card per telecaller: their numbers plus feedback from their own recorded calls. '
  'Built by rep-week-review, sent Monday 10 AM IST by pulse-broadcast.';

-- ---------- one number per telecaller ----------
--
-- The review went to profiles.phone, and 15 of 20 telecallers have none — while
-- several of them DO have a number on a Daily Pulse "telecaller's own report"
-- row. Nidhi gets her daily report on WhatsApp and would have been skipped for
-- the weekly one for want of a number we already had. The profile wins; the
-- pulse row fills the gap. Same company only.
create or replace view public.v_rep_review_recipients as
  select
    p.id            as salesperson_id,
    p.company_id,
    p.full_name,
    coalesce(nullif(p.phone, ''), ps.phone) as phone,
    c.name          as company_name,
    c.rep_review_hour_ist,
    (coalesce(nullif(p.phone, ''), ps.phone, '') <> '')        as has_phone,
    (not c.rep_review_off)                                       as company_on,
    (select a.rep_review_on from public.platform_automation a)   as platform_on,
    coalesce(d.state, 'never_reported')                          as device_state,
    coalesce(d.trustworthy, false)                               as device_trustworthy,
    (
      coalesce(nullif(p.phone, ''), ps.phone, '') <> ''
      and not c.rep_review_off
      and (select a.rep_review_on from public.platform_automation a)
    )                                                            as enrolled
  from public.profiles p
  join public.companies c on c.id = p.company_id
  left join public.v_device_sync_health d on d.salesperson_id = p.id
  left join lateral (
    select s.phone
    from public.pulse_subscribers s
    where s.salesperson_id = p.id
      and s.company_id = p.company_id
      and coalesce(s.phone, '') <> ''
    order by s.active desc, s.created_at desc
    limit 1
  ) ps on true
  where p.role = 'salesperson'
    and coalesce(p.is_active, true);

alter view public.v_rep_review_recipients set (security_invoker = on);

-- ---------- built before it is sent ----------
--
-- Monday 05:30–09:20 IST, every ten minutes, three telecallers a run. The
-- 10 AM send then only reads rows. A rep whose card is not built by then still
-- gets their numbers; the feedback is never what makes the message late.
-- The function itself checks the platform switch, so this costs nothing while
-- the weekly review is off.
select cron.unschedule('rep-week-review-build')
where exists (select 1 from cron.job where jobname = 'rep-week-review-build');

select cron.schedule(
  'rep-week-review-build',
  '*/10 0-3 * * 1',
  $$
  select net.http_post(
    url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/rep-week-review',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := jsonb_build_object('mode', 'build', 'limit', 3)
  );
  $$
);
