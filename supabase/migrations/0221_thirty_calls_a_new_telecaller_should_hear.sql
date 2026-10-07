-- A new telecaller's first week, and the thirty calls that should fill it.
--
-- A fresher joins and is handed 300 numbers and a script. Nobody can tell her
-- what a good call SOUNDS like, because the good calls are scattered through
-- 17,582 rows and nothing has ever marked one.
--
-- They are in there. Ankita offering an 80-gaz plot after the 50 and the 60
-- sold out; Shweta placing a Jewar plot against the airport before price comes
-- up; a buyer asking about possession and registry and getting a straight
-- answer. That is the training material, and it already exists.
--
-- WHAT COUNTS AS A CANDIDATE, AND WHY EACH GATE IS THERE
--
--   17,582  all calls
--    3,873  are CRM calls — off_crm is the rep's personal life, never training
--    1,816  have a recording
--      301  ran a minute or more; under that nobody teaches anybody anything
--      223  carry a transcript worth reading (200+ characters)
--
-- Two of the gates exist because of a bug found the day before this was
-- written: audio_complete must not be false (an unfinished container plays as
-- one second), and audio_seconds must not run far past the call. 2,108 calls
-- in this database carry audio recorded during a DIFFERENT call. Handing a
-- fresher a stranger's conversation labelled as a model call is the one
-- failure this feature cannot survive, so the gates are repeated here rather
-- than trusted to 0220 having been applied.
--
-- HOW THEY ARE RANKED
--
-- score_base is deterministic, and it is honest about being a proxy. It knows
-- three things, all evidence rather than opinion:
--
--   where the lead ENDED UP        a call on a lead that reached Site visit
--                                  outranks one on a lead that stalled
--   whether the lead MOVED after   a stage change or a booked visit within 14
--                                  days, the closest thing on record to
--                                  "this call did something"
--   how much was actually SAID     the length of the call and of the transcript
--   what the COACH already said    coach_feedback.rating, 1-5, written by the
--                                  AI coach when it reviewed the rep's call
--
-- That last one is borrowed deliberately rather than re-derived. 188 calls
-- already carry a coach rating and the distribution is honest — average 2.18,
-- nothing above a 4 — so it is real evidence sitting in the database, and
-- scoring these calls from scratch while ignoring it would be building a
-- second opinion next to a perfectly good first one. It covers 63 of the 223
-- candidates, so it lifts and sinks those and leaves the rest where they were.
--
-- It is NOT the same question, which is why it is a signal and not the answer.
-- The coach asks "how did this rep do, and what should she fix". A training
-- library asks "what would a newcomer take away from hearing this". A call can
-- rate 2 for the rep who made it and still be the clearest example of a buyer
-- raising a price objection that exists in the database.
--
-- What none of it can know is whether the rep was any good in a way worth
-- COPYING. A long call on a lead that later booked a visit can still be a bad
-- call that got lucky. That judgement needs someone to read the call for this
-- purpose, which is what the training-picks function does: it writes score,
-- skill, why and listen_for into training_calls, and this view puts a call
-- that has been read above one that has not.
--
-- Until that function has run the library is still ordered and still useful.
-- It is ranking by circumstance instead of by craft, and the page says so in
-- as many words rather than letting anyone believe a machine has listened.
--
-- APPLIED TO PRODUCTION BY HAND on <date>.

-- ── The verdict, once something has actually read the call ──────────────────

create table if not exists public.training_calls (
  call_id uuid primary key references public.call_logs(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  -- 1-5, and 1 and 2 are real answers. A library that scores everything 4 is a
  -- library nobody trusts twice.
  score smallint not null check (score between 1 and 5),
  -- What this call teaches, in one word the founder can filter on:
  -- 'opening', 'objection', 'price', 'site_visit', 'listening', 'closing'.
  skill text,
  -- Why it is worth a fresher's twenty minutes. One sentence.
  why text,
  -- The moment to wait for, so she is listening FOR something rather than
  -- just listening.
  listen_for text,
  model text,
  scored_at timestamptz not null default now()
);

comment on table public.training_calls is
  'A read verdict on one call as teaching material. Written by the training-picks function from the transcript; absent until something has actually read the call.';

alter table public.training_calls enable row level security;

-- Same shape as lead_promises: the platform owner sees everything, a company
-- admin sees their own company and nothing else. A training call is still a
-- real customer conversation — playing Fanbe's call to a Manas fresher is a
-- leak, however useful it would be.
drop policy if exists training_calls_select on public.training_calls;
create policy training_calls_select on public.training_calls
  for select using (
    is_super_admin() or (company_id = current_company_id() and is_admin())
  );

-- Written only by the edge function, which holds the service role.
revoke insert, update, delete on public.training_calls from anon, authenticated;

create index if not exists training_calls_company_score
  on public.training_calls (company_id, score desc);

-- ── The library ─────────────────────────────────────────────────────────────

drop view if exists public.v_training_library;

create view public.v_training_library
with (security_invoker = true) as
with candidate as (
  select cl.id as call_id,
         cl.company_id,
         cl.salesperson_id,
         cl.contact_id,
         cl.started_at,
         cl.duration_seconds,
         coalesce(length(cl.transcript), 0) as transcript_chars,
         cl.summary,
         ct.name as lead_name,
         ct.stage,
         s.label as stage_label
  from public.call_logs cl
  join public.contacts ct on ct.id = cl.contact_id
  join public.lead_stages s on s.code = ct.stage
  where coalesce(cl.off_crm, false) = false
    and cl.recording_status = 'ready'
    and coalesce(cl.duration_seconds, 0) >= 60
    and coalesce(cl.audio_complete, true) = true
    and (cl.audio_seconds is null
         or cl.audio_seconds <= cl.duration_seconds + greatest(60, cl.duration_seconds))
    and coalesce(length(cl.transcript), 0) >= 200
), with_move as (
  select c.*,
         exists (
           select 1 from public.lead_activities a
            where a.contact_id = c.contact_id
              and a.created_at > c.started_at
              and a.created_at < c.started_at + interval '14 days'
              and (a.detail ilike 'Stage → Site Visit%'
                or a.detail ilike 'Stage → Interested%'
                or (a.type = 'site_visit' and a.detail ilike 'Site visit %'))
         ) as moved_after
  from candidate c
)
select m.call_id,
       m.company_id,
       co.name as company_name,
       m.salesperson_id,
       p.full_name as rep_name,
       m.contact_id,
       m.lead_name,
       m.stage,
       m.stage_label,
       m.started_at,
       m.duration_seconds,
       m.transcript_chars,
       m.summary,
       m.moved_after,
       t.score,
       t.skill,
       t.why,
       t.listen_for,
       t.scored_at,
       cf.rating as coach_rating,
       cf.good as coach_good,
       (
         case m.stage
           when 'won' then 50
           when 'token_paid' then 45
           when 'negotiation' then 40
           when 'site_visit' then 40
           when 'interested' then 28
           when 'contacted' then 14
           when 'lost' then 10
           else 4
         end
         + case when m.moved_after then 25 else 0 end
         + least(20, m.duration_seconds / 15)
         + least(15, m.transcript_chars / 150)
         -- The coach's own read, where it exists. Deliberately small: it
         -- answers a different question (see the header), so it nudges the
         -- order rather than deciding it, and an unrated call is not punished
         -- for the coach never having got to it.
         + case
             when cf.rating is null then 0
             when cf.rating >= 4 then 12
             when cf.rating = 3 then 4
             when cf.rating = 2 then -4
             else -12
           end
       )::int as score_base
from with_move m
left join public.training_calls t on t.call_id = m.call_id
left join public.coach_feedback cf on cf.call_id = m.call_id
left join public.profiles p on p.id = m.salesperson_id
left join public.companies co on co.id = m.company_id;

comment on view public.v_training_library is
  'Calls worth playing to a new telecaller. score (1-5) is a read verdict and is null until training-picks has run; score_base is a deterministic proxy built from the lead''s outcome, whether it moved after the call, and how much was said. Order by score first, then score_base.';
