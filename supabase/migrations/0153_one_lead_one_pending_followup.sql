-- One lead = one pending follow-up, enforced by the database.
--
-- "Follow up ka bug abhi bhi chl raha h."
--
-- Four Manas leads were carrying TWO open callbacks each, and the pattern is
-- identical every time — the rep's own booking, plus an automatic one:
--
--   Monu Singh      06 Aug 10:00 [—]        ·  06 Aug 11:00 [Auto: callback ka time set n]
--   Nitu Bhardwaj   04 Aug 10:00 [—]        ·  04 Aug 11:00 [Auto: callback ka time set n]
--   Abhay Kumar     03 Aug 15:46 [—]        ·  04 Aug 11:00 [Auto: callback ka time set n]
--   Dr R K Gupta    02 Aug 16:00 [—]        ·  03 Aug 11:00 [Auto: callback ka time set n]
--
-- So the rep books 10:00, and an hour later the same lead also wants calling at
-- 11:00. Work one, the other is still sitting there. That is what "the
-- follow-up bug is still running" looks like from the rep's chair.
--
-- EVERY WRITER ALREADY TRIES TO PREVENT THIS, AND A RACE BEATS ALL OF THEM.
--
--   Repository.scheduleFollowUp  selects the pending row and UPDATEs it
--   voice-note-ai                "move the existing one instead of stacking"
--   ensure_callback_followup     books only `if not exists (... pending)`
--   book_callback_if_missing     same guard (0151)
--
-- Four independent check-then-insert pairs, none of them atomic. The app's
-- postCallDispose fires setDisposition in one coroutine while the rep picks a
-- time in another: setDisposition flips status to 'callback', which fires
-- ensure_callback_followup, which finds nothing pending and books tomorrow
-- 11:00 — meanwhile scheduleFollowUp has already run its own SELECT, also found
-- nothing, and inserts the rep's row. Both land. Neither writer did anything
-- wrong on its own.
--
-- You cannot fix that by reordering the app. The invariant has to live where the
-- write happens, so it holds for every caller — the app, the edge functions, the
-- triggers, and any backfill I write at eleven at night.
--
-- NEWEST WINS. Whatever is being inserted is the most recent decision about when
-- to call this person, so older pending rows are closed as it lands. In the four
-- cases above the automatic 11:00 default was created first and the rep's
-- explicit time second, so the rep's choice survives — which is the right way
-- round: a person who picked a time beats a fallback that guessed one.
--
-- Also reaches Shweta, whose phone has never once synced and who is on a build
-- old enough to have none of this week's app fixes. Server-side, no install.

create or replace function public.one_pending_followup_per_lead()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.contact_id is null then
    return new;
  end if;
  -- Close every other open callback for this lead. `completed_at is null` and
  -- `status = 'pending'` are the two spellings of "open" in this codebase and
  -- they agree on every row today (239 pending / 353 done, no disagreement);
  -- both are set so they cannot start disagreeing here.
  update public.follow_ups f
     set status = 'done', completed_at = now()
   where f.contact_id = new.contact_id
     and f.completed_at is null
     and f.id is distinct from new.id;
  return new;
end $$;

-- BEFORE INSERT, so the row being inserted is not a candidate for closing and
-- the table is left with exactly one open callback the moment the insert lands.
-- The UPDATE above fires only trg_follow_ups_touch (BEFORE UPDATE) — there is no
-- INSERT trigger to re-enter, so this does not recurse.
drop trigger if exists trg_one_pending_followup on public.follow_ups;
create trigger trg_one_pending_followup
  before insert on public.follow_ups
  for each row execute function public.one_pending_followup_per_lead();

-- ── clean up the leads already carrying two ──
--
-- Keep the SOONEST one: it is the time somebody promised the customer, and in
-- every one of the four cases that is the rep's own booking rather than the
-- automatic 11:00 fallback. Closing the later duplicate cannot lose work — the
-- lead is still due at the earlier time, which is when it should have been.

with ranked as (
  select f.id, f.contact_id,
         row_number() over (partition by f.contact_id order by f.due_at, f.created_at) as rn
  from public.follow_ups f
  where f.completed_at is null
)
update public.follow_ups f
   set status = 'done', completed_at = now()
from ranked r
where f.id = r.id and r.rn > 1;
