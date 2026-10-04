-- A WhatsApp call the buyer picked up is contact. Call now was not told.
--
-- THE LIST THE PHONE ALREADY SORTS
--
-- v_lead_workstate is read by every telecaller's phone on every poll. The
-- phone does not have a rank column. It files Call now into five tiers from
-- the columns this view already returns:
--
--   0  waiting_since is set           the buyer wrote, nobody answered
--   1  promise_due_since is set       a promise was not kept
--   2  best_call_seconds >= 30        someone has actually spoken to them
--   3  calls_total < 4                rung a few times, never answered
--   4  otherwise                      rung 4+ times, never once answered
--
-- Tier 2 is the only "we have spoken" test, and best_call_seconds is the
-- longest row in call_logs. wa_observed_calls (0171) has been storing the
-- WhatsApp call since it shipped, and v_rep_wa_calls_daily already calls
-- status = 'accept' an answer. Nothing that orders a lead reads either of
-- them. A buyer who picked up on WhatsApp, and has only ever rung out on the
-- SIM, stays in tier 4 under "Rung N times — never picked up", below numbers
-- she has never reached.
--
-- WHAT COUNTS, AND WHAT DOES NOT
--
-- status = 'accept' is the definition 0171 already published. offer, ringing,
-- reject and timeout are a ring nobody took. terminate is not contact either.
-- Baileys fires it when a call ends after an answer, after a reject, or
-- because the caller hung up, and the ingest keeps only the latest status.
-- Calling terminate a conversation would promote a hang-up.
--
-- The call table has no duration. The phone's own bar for "spoken" is 30
-- seconds, so an accepted WhatsApp call raises best_call_seconds TO 30 and
-- no higher. A longer SIM conversation is kept, via greatest(). 30 means
-- "this counts as contact". It is not a claim that the WhatsApp call lasted
-- half a minute. last_call_at, last_call_seconds and calls_total stay the
-- SIM call, so the last-call line does not invent a length either.
--
-- THE 30 AND THE KOTLIN THRESHOLD MUST CHANGE TOGETHER.
--
-- 30 is not a measured length. It is the same number the installed app uses
-- as its tier-2 test: `(w?.bestCallSeconds ?: 0) >= 30` in
-- TelecallerScreens.kt. Raising one without the other splits the list. If
-- this sentinel becomes 45 and the phone still says >= 30, an accepted
-- WhatsApp call still counts and the comment is the only thing that lied.
-- If the phone's bar becomes 45 and this sentinel stays 30, that buyer falls
-- straight back into "never answered". Change both, or neither.
--
-- The value is computed outside the call_logs lateral. That lateral returns
-- no row when the SIM has never rung, and a WhatsApp-only conversation would
-- otherwise stay null and keep reading as "never spoken".
--
-- No column moves. create or replace can only append, and this view is the
-- contract the installed app already decodes. The app does not need a new
-- field: it already treats 30 as contact. Adding a badge column the phone
-- does not read would leave tier 4 exactly where it is.
--
-- A partial index, because the exists runs once per lead on every poll.
-- idx_wa_call_contact is (contact_id, started_at) and still has to throw
-- away every ring. Accepted calls are the only ones this question asks about.
--
-- Measured while writing this, on the live database: wa_observed_calls held
-- one row, and its status was 'offer'. An offer does not move. No lead
-- changes tier until an accept is actually stored.

create index if not exists idx_wa_call_accepted
  on public.wa_observed_calls (contact_id)
  where status = 'accept';

comment on index public.idx_wa_call_accepted is
  'Accepted WhatsApp calls only. v_lead_workstate asks "did this buyer ever pick up on WhatsApp?" once per lead, on every phone poll.';

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
    -- SIM conversation, or 30 once a WhatsApp call was accepted. 30 is not a
    -- measured WhatsApp length. It is the Kotlin tier-2 threshold
    -- (bestCallSeconds >= 30 in TelecallerScreens.kt). The sentinel and that
    -- threshold must change together.
    greatest(
      coalesce(lc.best_call_seconds, 0),
      case
        when exists (
          select 1
            from public.wa_observed_calls k
           where k.contact_id = c.id
             and k.status = 'accept'
        ) then 30
        else 0
      end
    ) as best_call_seconds
   from public.contacts c
     join public.lead_stages s on s.code = c.stage
     join public.v_lead_action_state a on a.contact_id = c.id
     left join lateral (
       select cl.started_at as last_call_at,
              coalesce(cl.duration_seconds, 0) as last_call_seconds,
              (select count(*)::integer from public.call_logs x
                where x.contact_id = c.id and coalesce(x.off_crm, false) = false) as calls_total,
              -- Longest SIM call only. The WhatsApp floor is applied outside
              -- this lateral, so a lead with no SIM row still gets it.
              (select coalesce(max(x.duration_seconds), 0)::integer from public.call_logs x
                where x.contact_id = c.id and coalesce(x.off_crm, false) = false) as best_call_seconds
       from public.call_logs cl
       where cl.contact_id = c.id and coalesce(cl.off_crm, false) = false
       order by cl.started_at desc
       limit 1) lc on true;

comment on view public.v_lead_workstate is
  'One row per lead with everything a rep''s phone needs to decide what to do next. best_call_seconds is the longest SIM conversation, raised to 30 when a WhatsApp call was accepted (status = accept). 30 is not a measured WhatsApp duration: it is the same number as the Kotlin tier-2 test, bestCallSeconds >= 30 in TelecallerScreens.kt. The sentinel and that threshold must change together — moving one without the other puts an accepted WhatsApp call back under "never answered", or leaves the two definitions describing different things. A ring, a reject, a timeout or a terminate does not count.';
