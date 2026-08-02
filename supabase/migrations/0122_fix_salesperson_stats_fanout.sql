-- Ankita made 714 calls. This view reported 107,100.
--
-- It LEFT JOINed contacts AND call_logs to the same profile row:
--
--     from profiles p
--     left join contacts  c  on c.salesperson_id  = p.id
--     left join call_logs cl on cl.salesperson_id = p.id
--
-- Two independent one-to-many joins off one row is a cross product: every call
-- gets repeated once per contact that rep owns. count(DISTINCT c.id) hid the
-- damage on the contacts column, so the number that looked most obviously wrong
-- was the one that happened to be right — and nobody suspected the rest.
--
--   Ankita   714 calls  →  107,100      (150 contacts of multiplier)
--   Shweta   120 calls  →   15,840
--   talk time 8 hours   →   50 days
--
-- Any per-rep target, leaderboard or "calls today" built on this was fiction,
-- and it scaled with how many leads a rep held — so the busiest rep looked the
-- most productive by the widest margin, which is exactly the reading a manager
-- would never question.
--
-- Each side is now counted on its own and joined on the finished totals, so the
-- two can never multiply again.
create or replace view public.v_salesperson_stats as
with calls as (
  select salesperson_id,
         count(*)                                                as total_calls,
         count(*) filter (where outcome = 'connected')           as connected_calls,
         count(*) filter (where outcome = 'no_answer')           as no_answer_calls,
         coalesce(sum(duration_seconds), 0)                      as total_talk_seconds,
         max(started_at)                                         as last_call_at
    from public.call_logs
   where salesperson_id is not null
   group by salesperson_id
),
leads as (
  select salesperson_id, count(*) as total_contacts
    from public.contacts
   where salesperson_id is not null
   group by salesperson_id
)
select p.id                                as salesperson_id,
       p.full_name,
       p.company_id,
       coalesce(l.total_contacts, 0)       as total_contacts,
       coalesce(c.total_calls, 0)          as total_calls,
       coalesce(c.connected_calls, 0)      as connected_calls,
       coalesce(c.no_answer_calls, 0)      as no_answer_calls,
       coalesce(c.total_talk_seconds, 0)   as total_talk_seconds,
       c.last_call_at
  from public.profiles p
  left join calls c on c.salesperson_id = p.id
  left join leads l on l.salesperson_id = p.id
 where p.role = 'salesperson';
