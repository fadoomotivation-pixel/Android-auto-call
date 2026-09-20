-- Measured, not guessed. Timing every part of the conversations query on the
-- live data, with 4,290 messages across 228 people:
--
--   group the messages by peer          5ms
--   last message per peer              11ms
--   one thread, the one being opened     6ms
--   count the rep's dialled numbers   337ms   <- everything else put together
--
-- That last one is `group by right(regexp_replace(phone,'\D','','g'), 10)`
-- over every call this rep has ever made — a regexp per row, several thousand
-- rows, on every single render of the page. It exists to answer one small
-- question beside each conversation: has the rep also PHONED this number?
--
-- The expression is indexed now, so it is an index scan instead of a full
-- table scan with a regular expression on top. Same answer, same query, and
-- the page stops paying a third of a second for a badge.
--
-- Re-measured after: 337ms -> 20ms.
--
-- APPLIED TO PRODUCTION BY HAND on 2026-09-20.

create index if not exists call_logs_rep_phone10_idx
  on public.call_logs (salesperson_id, (right(regexp_replace(phone, '\D', '', 'g'), 10)))
  where phone is not null;

comment on index public.call_logs_rep_phone10_idx is
  'Matches the last-ten-digits expression used to join call history to WhatsApp peers. Without it, drawing the conversation list scanned every call log with a regexp — 337ms of a ~370ms query.';

analyze public.call_logs;
