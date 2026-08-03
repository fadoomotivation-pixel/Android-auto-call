-- Is the CRM telling the truth? One row per telecaller, five ways it might not be.
--
-- Every report, funnel, alert and score built on top of this database assumes
-- the reps keep it updated. Nobody has ever checked. And the numbers say the
-- assumption is worth checking: across 738 leads and two months there is not
-- one lead at 'booked', not one at 'token_paid', and token_amount is empty on
-- every single row. Either the company has genuinely sold nothing since June,
-- or deals close and never get written down — and until this view exists there
-- is no way to tell those two apart.
--
-- That distinction is the whole point. A founder looking at "0 bookings" has to
-- know whether they are looking at a sales problem or a data-entry problem,
-- because the responses are opposite: one needs a conversation about pricing,
-- the other needs a button moved.
--
-- Deliberately NOT a rep scoreboard. Every column is a COUNT OF MISSING FACTS,
-- phrased as work the CRM still needs, not as an accusation. The same numbers
-- would read as surveillance with different labels, and a rep who feels
-- audited starts writing plausible fiction instead of leaving blanks — which
-- destroys the very data this is meant to protect.
--
-- security_invoker: the view runs as the caller, so contacts/call_logs RLS
-- decides what they see. A company admin gets their own company, the platform
-- super admin gets everyone. No new isolation rule to keep in sync.
create or replace view public.v_crm_data_quality
with (security_invoker = on) as
with active as (
  select * from public.contacts
  where status not in ('lost', 'not_interested', 'dnc', 'invalid')
)
select
  p.id                                                as salesperson_id,
  p.company_id,
  p.full_name,

  -- 1. Dialled, and nobody wrote down what happened.
  --    handled_at is the honest marker (migration 0101): a call on its own
  --    proves nothing, a recorded outcome does. Counted over 7 days because a
  --    single day's figure swings too much to act on.
  (select count(distinct cl.contact_id)
     from public.call_logs cl
     join public.contacts c on c.id = cl.contact_id
    where cl.salesperson_id = p.id
      and cl.started_at > now() - interval '7 days'
      and coalesce(cl.off_crm, false) = false
      and (c.handled_at is null or c.handled_at < cl.started_at)
  )                                                   as calls_no_outcome_7d,

  -- 2. A site visit whose day has passed with nobody saying whether the
  --    customer turned up. This is the single most expensive blank in the
  --    table: an unanswered visit keeps counting as a qualified lead in every
  --    report and in the ad autopsy, forever.
  (select count(*) from active c
    where c.salesperson_id = p.id
      and c.site_visit_at is not null
      and c.site_visit_at < now()
      and c.site_visit_arrived_at is null
  )                                                   as visits_attendance_unknown,

  -- 3. A won deal with no money on it. If this is ever non-zero the founder's
  --    revenue line is understated by an unknown amount, which is worse than
  --    it being zero.
  (select count(*) from public.contacts c
    where c.salesperson_id = p.id
      and c.status in ('booked', 'token_paid')
      and coalesce(c.token_amount, 0) = 0
  )                                                   as bookings_without_amount,

  -- 4. Alive in the pipeline, untouched for a fortnight. Not a scolding —
  --    usually it means the lead quietly died and nobody closed it, which is
  --    what makes a pipeline look twice its real size.
  (select count(*) from active c
    where c.salesperson_id = p.id
      and coalesce(c.handled_at, c.created_at) < now() - interval '14 days'
  )                                                   as stale_14d,

  -- 5. Talked to them, and booked nothing next. The commonest way a warm lead
  --    is lost: not a bad call, just no next date.
  (select count(*) from active c
    where c.salesperson_id = p.id
      and c.handled_at is not null
      and c.status not in ('booked', 'token_paid')
      and not exists (
        select 1 from public.follow_ups f
         where f.contact_id = c.id and f.status = 'pending'
      )
  )                                                   as no_next_step,

  -- Denominators, so a rep with 400 leads is not compared to one with 40.
  (select count(*) from active c where c.salesperson_id = p.id) as active_leads,
  (select count(*) from public.call_logs cl
    where cl.salesperson_id = p.id
      and cl.started_at > now() - interval '7 days'
      and coalesce(cl.off_crm, false) = false)                  as calls_7d
from public.profiles p
where p.role = 'salesperson';

comment on view public.v_crm_data_quality is
  'Per-telecaller count of facts the CRM is missing. Counts of blanks, never a score — see 0130.';
