-- 0165 — coach_briefs gets a 'pulse' slot
--
-- The Daily Pulse now caches each rep's AI win/risk against a fingerprint of
-- the numbers it was written from, so opening the page twice in an afternoon
-- does not pay for the same sentences twice. It stores that under
-- slot = 'pulse'.
--
-- coach_briefs_slot_check allows only morning / evening / tip / review, so the
-- upsert would have been rejected — and it sits inside a try/catch that keeps
-- the report alive when a model is rate-limited, so the rejection would have
-- been SILENT. The cache would simply never fill, the page would stay slow,
-- and the only evidence would be a wasted round trip per rep per load.
--
-- Reusing an existing slot was the other option and the wrong one: 'evening'
-- and 'tip' are rep-coach's own rows for the same (rep, day) key, and the two
-- writers would overwrite each other.
alter table public.coach_briefs drop constraint if exists coach_briefs_slot_check;
alter table public.coach_briefs add constraint coach_briefs_slot_check
  check (slot = any (array['morning'::text, 'evening'::text, 'tip'::text, 'review'::text, 'pulse'::text]));
