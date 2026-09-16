-- The worker's own counters, somewhere a select can reach them.
--
-- /status has carried `dropped`, `undecryptable`, `lids_known` and the queue
-- depths since v20. /status is a bearer-protected endpoint on a Hostinger box
-- that cannot be curled from here. So the one question five hours of silence
-- actually raises — is anything arriving and being dropped, or has WhatsApp
-- simply stopped talking? — needed SSH access to answer, and was therefore
-- answered with theories instead.
--
-- They ride the heartbeat now. Four minutes stale at worst.
--
-- APPLIED TO PRODUCTION BY HAND on 2026-09-16.

alter table public.wa_rep_sessions
  add column if not exists diag jsonb,
  add column if not exists worker_version text;

comment on column public.wa_rep_sessions.diag is
  'Last heartbeat''s counters from the worker: dropped addresses by suffix, undecryptable messages, LIDs resolved, groups named, queue depths, and how many events WhatsApp has sent this session. A frozen event count with a healthy socket means WhatsApp stopped talking; a rising one with nothing stored means we are dropping it.';

comment on column public.wa_rep_sessions.worker_version is
  'Which worker build is actually running, reported by the worker itself rather than guessed from behaviour.';
