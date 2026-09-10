-- "Is the WhatsApp linked?" and "are messages arriving?" are two questions.
--
-- WHAT WENT WRONG
--
-- The dashboard answered both from one column. `last_seen_at` is stamped by the
-- ingest — that is, only when the worker actually has something to report — and
-- the card's health was computed purely from how recently that happened:
--
--     no last_seen_at        -> "Disconnected — Never connected, have the rep scan the QR"
--     last_seen_at > 2h ago  -> "Stale"
--     otherwise              -> "Connected"
--
-- So a rep whose WhatsApp is linked and healthy, but who simply has not
-- messaged a lead this morning, is reported as DISCONNECTED and the card tells
-- you to make them scan again. Ankita's phone listed the device as active while
-- the dashboard said Never connected, and the only suggested remedy was the one
-- thing that could not help — another scan of another QR.
--
-- Worse, the reverse also lied: `status` from the worker was never consulted at
-- all, so a genuinely dead link kept reading "Connected" for two hours after
-- its last message.
--
-- THE FIX
--
-- link_ok_at answers "the WhatsApp connection was confirmed up at this moment",
-- and is stamped by anything that proves it: the worker's heartbeat, a status
-- poll from the dashboard, or a batch of real traffic. last_seen_at keeps its
-- existing meaning — when data last arrived — and goes back to being what it
-- was always good for: deciding whether today's counts can be trusted, and
-- saying how long a watcher has been quiet.
--
-- Nullable with no backfill on purpose. A null means "this worker has never
-- reported a heartbeat", which is exactly true of any worker build older than
-- 2026.09.10-13, and the dashboard falls back to the old traffic-based reading
-- for those rather than declaring every existing session dead.

alter table public.wa_rep_sessions
  add column if not exists link_ok_at timestamptz;

comment on column public.wa_rep_sessions.link_ok_at is
  'When the WhatsApp connection itself was last confirmed up (heartbeat, status poll, or traffic). Distinct from last_seen_at, which is when data last arrived. Null means the worker predates heartbeats.';

comment on column public.wa_rep_sessions.last_seen_at is
  'When the CRM last received data from this watcher. Says nothing about whether the link is up — a linked rep who has not messaged anyone has an old value here. Use link_ok_at for connection health.';
