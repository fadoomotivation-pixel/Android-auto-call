-- "Maine call kar li, phir bhi due dikha raha hai."
--
-- Follow-ups were only ever closed by the rep tapping Done on the follow-up
-- screen. Nothing closed one when they actually CALLED the lead and recorded an
-- outcome — so the callback stayed pending, its due time slid into the past, and
-- the lead sat in Today wearing "Overdue 19h 52m" forever. Across the platform
-- the proof was stark: 174 pending follow-ups and exactly ONE ever marked done.
--
-- Two knock-on effects, both of which the telecallers felt:
--   • Today filled up with work that was already finished, so nobody could tell
--     what was actually left to do.
--   • Every one of those leads kept a red "Overdue" tag, which is the fastest
--     way to teach a rep to ignore red tags.
--
-- handled_at already means exactly the right thing (see 0101): the rep reported
-- what happened — a status, a voice note, a typed note or a booked callback. So
-- when that stamp moves, any callback that was already due is finished by
-- definition, and closes itself.
--
-- Deliberately only OVERDUE ones. A callback booked for 4 PM that the rep
-- happens to touch at 2 PM is still a real appointment and stays.
create or replace function public.close_followups_on_handled()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.handled_at is distinct from old.handled_at and new.handled_at is not null then
    update public.follow_ups f
       set status = 'done', completed_at = now()
     where f.contact_id = new.id
       and f.status = 'pending'
       and f.due_at <= now()
       -- Never close a follow-up created moments ago by this same flow (the rep
       -- booking the next callback also stamps handled_at).
       and f.created_at < now() - interval '30 seconds';
  end if;
  return new;
end $$;

drop trigger if exists trg_close_followups_on_handled on public.contacts;
create trigger trg_close_followups_on_handled
  after update of handled_at on public.contacts
  for each row execute function public.close_followups_on_handled();

-- Clear the backlog the same way: an overdue callback whose lead was handled at
-- or after the due time is finished work, not pending work.
update public.follow_ups f
   set status = 'done', completed_at = coalesce(c.handled_at, now())
  from public.contacts c
 where c.id = f.contact_id
   and f.status = 'pending'
   and f.due_at <= now()
   and c.handled_at is not null
   and c.handled_at >= f.due_at;
