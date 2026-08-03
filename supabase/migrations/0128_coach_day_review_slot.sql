-- The 7pm day review needs somewhere to live for the rest of the day.
--
-- coach_briefs already caches one generated thing per rep per date per slot,
-- which is exactly the shape the review needs: a rep who closes the card and
-- reopens the app twice more before bed must not cost three Groq calls, and
-- must not be shown three different reviews of the same day.
--
-- 'review' rather than reusing 'evening': the evening brief is 3-4 lines of
-- free text that the floating coach panel prints as-is, and the review is a
-- JSON object the app lays out as a card. Same table, different content
-- contract — putting them in one slot would mean one of the two readers always
-- getting a shape it cannot parse.
alter table public.coach_briefs drop constraint if exists coach_briefs_slot_check;
alter table public.coach_briefs add constraint coach_briefs_slot_check
  check (slot in ('morning', 'evening', 'tip', 'review'));
