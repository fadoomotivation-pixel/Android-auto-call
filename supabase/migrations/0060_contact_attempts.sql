-- Attempt ladder: how many times we tried this lead without a real conversation.
-- No-answer / busy / wrong-person keeps the lead in the New bucket; the app
-- auto-schedules the next attempt (next day, opposite time slot) and after
-- 3 straight misses marks the lead cold and stops retrying.
alter table public.contacts add column if not exists attempts int not null default 0;
