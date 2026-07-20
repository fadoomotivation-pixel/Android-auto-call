-- ============================================================
-- Every "callback" lead must carry a callback reminder (follow-up).
--
-- The telecaller app rests a callback lead in "Working" only while it has a
-- pending follow-up with a future due time; the moment that time passes it
-- surfaces in "Today". A callback with NO follow-up has nothing to wait for, so
-- the app drops it back into "New" — making already-called leads look fresh.
--
-- Some dispositions (app quick-chips, voice notes with no spoken date) set
-- status='callback' without creating a follow-up. This trigger guarantees one:
-- when a lead becomes 'callback' and has no pending follow-up, schedule a
-- default reminder for the next day 11:00 IST. The telecaller can always change
-- the time; this just stops the lead from falling back into New.
-- ============================================================

create or replace function public.ensure_callback_followup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_due timestamptz;
begin
  if new.status = 'callback'
     and new.salesperson_id is not null
     and new.company_id is not null
     and not exists (
       select 1 from public.follow_ups f
       where f.contact_id = new.id and f.status = 'pending'
     )
  then
    -- next day 11:00 IST, expressed as a UTC timestamptz
    v_due := (date_trunc('day', (now() at time zone 'Asia/Kolkata'))
              + interval '1 day' + interval '11 hour') at time zone 'Asia/Kolkata';
    insert into public.follow_ups (company_id, salesperson_id, contact_id, phone, name, due_at, note)
    values (new.company_id, new.salesperson_id, new.id, new.phone, new.name, v_due,
            'Auto: callback ka time set nahi tha — kal 11 AM');
  end if;
  return new;
end $$;

drop trigger if exists trg_ensure_callback_followup on public.contacts;
create trigger trg_ensure_callback_followup
  after insert or update of status on public.contacts
  for each row
  when (new.status = 'callback')
  execute function public.ensure_callback_followup();

-- One-time backfill: existing assigned callbacks with no pending reminder.
insert into public.follow_ups (company_id, salesperson_id, contact_id, phone, name, due_at, note)
select c.company_id, c.salesperson_id, c.id, c.phone, c.name,
       (date_trunc('day', (now() at time zone 'Asia/Kolkata')) + interval '1 day' + interval '11 hour') at time zone 'Asia/Kolkata',
       'Auto: callback ka time set nahi tha — kal 11 AM (backfill)'
from public.contacts c
where c.status = 'callback'
  and c.salesperson_id is not null
  and c.company_id is not null
  and not exists (select 1 from public.follow_ups f where f.contact_id = c.id and f.status = 'pending');
