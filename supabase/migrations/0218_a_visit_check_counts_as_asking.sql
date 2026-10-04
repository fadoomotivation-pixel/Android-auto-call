-- A visit check counts as asking.
--
-- THE COLUMN WAS READING A KIND THE APP CANNOT WRITE
--
-- v_pending_site_visit_outcomes.times_asked, and needs_manager which was
-- "times_asked >= 2", counted rep_prompts rows with kind = 'site_visit'.
-- Nothing inserts that kind. It cannot: 0127 only allows visit_check,
-- callback_check and day_review. The phone asks with kind = 'visit_check'
-- (MainViewModel.visitCheckAsk) and stores that through logRepPrompt.
--
-- Measured 4 Oct 2026, before this view was changed:
--
--    23  pending visits
--    23  of them with times_asked = 0
--     0  with needs_manager
--     0  rep_prompts.kind = 'site_visit'
--    33  rep_prompts.kind = 'visit_check'
--    15  of the 23 pending leads have at least one visit_check
--     0  answer = 'not_yet' anywhere in rep_prompts
--
-- So every pending visit read "never asked". That was false for 15 of them.
-- The phone's own "asked twice, then stop" counter is AppPrefs.getVisitAsks.
-- It lives on the device and never reaches this table, so it cannot be the
-- thing this view counts.
--
-- WHAT THE 33 ROWS ACTUALLY ARE
--
--    29  dismissed     answer is null, dismissed = true  ("Not now")
--     2  not_reachable
--     1  no_show
--     1  postponed
--     0  not_yet
--
-- Among the 23 still pending, every visit_check is one of those dismissals.
-- The histogram, once this view counts visit_check, is:
--
--    8 leads asked 0 times
--    6 leads asked 1 time
--    5 leads asked 2 times
--    4 leads asked 3 times
--
-- DISMISSALS DO NOT SET needs_manager
--
-- times_asked counts every visit_check row, dismissals included. That column
-- means "how many times the question was shown", which is what the Action
-- Center prints ("Asked N×").
--
-- needs_manager is two answers of answer = 'not_yet' on a visit_check, and
-- nothing else. "Not yet — I'll find out" is the only button that writes
-- that answer (assistantVisitUnknown). The comment on the button says it is
-- a real answer, not a dismissal, and that it is logged so the lead surfaces
-- to a manager if it stays unanswered. Closing the card ("Not now", or the
-- dialog itself) calls assistantDismiss and writes dismissed = true with a
-- null answer. That function, and the column comment in 0127, both say a
-- dismissal is counted and never punished — a signal, not a strike.
-- v_rep_discipline already reports those as `ignored`, separate from answers.
--
-- Counting the dismissals would have flagged 9 of these 23 leads (the five
-- asked twice and the four asked three times) as "the app has stopped
-- chasing these" even though nobody pressed the answer the screen says is
-- what surfaces them. Those nine stay in "Site visits awaiting outcome".
-- A manager can still see them. They are not labelled as a person who said
-- "not yet" twice.
--
-- Callback "not yet" is a different question (kind = 'callback_check') and
-- is not counted here either.
--
-- COLUMN CONTRACT
--
-- create or replace can only append columns. This statement changes none of
-- the names, types or order. Readers select by name:
--   admin Action Center — contact_id, salesperson_id, name, phone,
--     telecaller, visit_at, days_waiting, times_asked, needs_manager
--   pulse.ts (PR 486) — name, phone, telecaller, days_waiting, needs_manager
--     as a mark on the line, not as a filter
-- No scheduler is added. The ask already lives in tickAssistant.
--
-- NUMBER
--
-- This file is 0218 because PR #484 already owns
-- 0217_a_whatsapp_call_counts_as_contact.sql. That migration replaces
-- v_lead_workstate and indexes wa_observed_calls. This one only replaces
-- v_pending_site_visit_outcomes. Neither statement reads the other's
-- objects, so this can be applied on its own, before or after 0217.
--
-- Not applied by this commit. The founder applies it by hand.
-- applied by hand on <date>

create or replace view public.v_pending_site_visit_outcomes as
select
  c.id as contact_id,
  c.company_id,
  c.salesperson_id,
  c.name,
  c.phone,
  p.full_name as telecaller,
  coalesce(c.site_visit_arrived_at, c.site_visit_at) as visit_at,
  floor(
    extract(epoch from now() - coalesce(c.site_visit_arrived_at, c.site_visit_at))
    / 86400::numeric
  )::integer as days_waiting,
  (
    select count(*)
    from public.rep_prompts rp
    where rp.contact_id = c.id
      and rp.kind = 'visit_check'
  ) as times_asked,
  (
    select count(*)
    from public.rep_prompts rp
    where rp.contact_id = c.id
      and rp.kind = 'visit_check'
      and rp.answer = 'not_yet'
  ) >= 2 as needs_manager
from public.contacts c
left join public.profiles p on p.id = c.salesperson_id
where coalesce(c.site_visit_arrived_at, c.site_visit_at) is not null
  and coalesce(c.site_visit_arrived_at, c.site_visit_at) < now()
  and c.site_visit_outcome is null
  and c.status <> all (array[
    'lost'::public.contact_status,
    'not_interested'::public.contact_status,
    'dnc'::public.contact_status,
    'invalid'::public.contact_status
  ])
  and not exists (
    select 1
    from public.site_visit_outcomes o
    where o.contact_id = c.id
  );

comment on view public.v_pending_site_visit_outcomes is
  'Site visits whose day has passed and nobody has written an outcome. times_asked counts visit_check prompts (the kind the app actually writes). needs_manager is two explicit not_yet answers on that question — a dismissal is not one.';

-- Already on in production. Restated so a fresh database gets the same
-- invoker behaviour the live view has: a company admin sees their own rows,
-- the super admin sees all of them, and the service role still can.
alter view public.v_pending_site_visit_outcomes set (security_invoker = on);
