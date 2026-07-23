-- Honest per-call rating for the floating coach's "rate my last call".
-- 1-5; null until scored. Stored alongside the good/improve feedback so the
-- coach shows a star rating and — when the call is genuinely good — only
-- motivates (no forced "improve" that just confuses a rep who did well).
alter table public.coach_feedback add column if not exists rating smallint
  check (rating is null or (rating between 1 and 5));
