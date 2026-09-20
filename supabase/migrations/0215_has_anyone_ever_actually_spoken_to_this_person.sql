-- Ankita's "Call now" list, counted today:
--
--   320  leads the app says to call now
--   186  have been rung FOUR OR MORE TIMES and never once picked up
--   119  have been rung EIGHT or more times
--    79  calls to a single number. Seventy-nine.
--    75  had a real conversation last time — the only ones with a thread
--     0  have never been dialled
--
-- Every morning the app hands her this list, sorted oldest first, and offers
-- to power-dial all 320 back to back. More than half of it is numbers that
-- have never answered a phone. She cannot do 320 calls; she will do forty, and
-- the app has been choosing which forty by age, which is the one thing that
-- carries no information at all.
--
-- That is the whole story behind a 2.0/5 calling score and a rep who stopped
-- believing the number on the tab — the same disbelief CLAUDE.md records about
-- "Follow-up 107".
--
-- WHAT WAS MISSING TO FIX IT
--
-- v_lead_workstate already carries calls_total and last_call_seconds, but
-- last_call_seconds only describes the LAST attempt. A buyer who talked for
-- six minutes in August and then missed four rings in September looks
-- identical to a number that has never once been answered. The app could not
-- tell the two apart, so it treated them the same.
--
-- best_call_seconds is the honest question: HAS ANYONE EVER ACTUALLY SPOKEN TO
-- THIS PERSON? One number, one meaning, and the phone can finally put the
-- forty winnable calls above the hundred and eighty-six that will ring out.
--
-- Nothing is hidden and nothing is deleted. A lead rung seventy-nine times is
-- still in the list — it just stops outranking a buyer who talked last week,
-- and the row now says out loud what it is. Whether to give up on it is the
-- founder's call, not a migration's.
--
-- Appended at the end: create-or-replace cannot insert a column in the middle,
-- and this view is read by every rep's phone on every poll.
--
-- APPLIED TO PRODUCTION BY HAND on 2026-09-20.

create or replace view public.v_lead_workstate as
 select c.id as contact_id,
    c.company_id, c.salesperson_id, c.name, c.phone,
    c.status as disposition, c.stage,
    s.label as stage_label, s.short_label as stage_short_label, s.color as stage_color,
    s.sort_order as stage_sort, s.outcome, s.is_terminal, s.is_pipeline, s.is_advanced,
    s.counts_as_sale, s.rep_visible, s.analytics_visible,
    a.action_state, a.due_at,
    c.site_visit_at, c.created_at, c.last_contacted_at, c.handled_at, c.temperature,
    lc.last_call_at, lc.last_call_seconds, lc.calls_total,
    a.due_at is not null and timezone('Asia/Kolkata', a.due_at)::date = timezone('Asia/Kolkata', now())::date as is_due_today,
    timezone('Asia/Kolkata', c.handled_at)::date = timezone('Asia/Kolkata', now())::date as handled_today,
    a.waiting_since,
    a.promise_due_since,
    a.promise_text,
    lc.best_call_seconds
   from public.contacts c
     join public.lead_stages s on s.code = c.stage
     join public.v_lead_action_state a on a.contact_id = c.id
     left join lateral (
       select cl.started_at as last_call_at,
              coalesce(cl.duration_seconds, 0) as last_call_seconds,
              (select count(*)::integer from public.call_logs x
                where x.contact_id = c.id and coalesce(x.off_crm, false) = false) as calls_total,
              -- The longest anyone has EVER been on the phone with this person.
              -- Zero means nobody has, however many times the number was rung.
              (select coalesce(max(x.duration_seconds), 0)::integer from public.call_logs x
                where x.contact_id = c.id and coalesce(x.off_crm, false) = false) as best_call_seconds
       from public.call_logs cl
       where cl.contact_id = c.id and coalesce(cl.off_crm, false) = false
       order by cl.started_at desc
       limit 1) lc on true;

comment on view public.v_lead_workstate is
  'One row per lead with everything a rep''s phone needs to decide what to do next. best_call_seconds answers the question the list could never answer before: has anyone ever actually spoken to this person?';
