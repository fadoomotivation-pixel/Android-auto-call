-- The same call cannot be stored twice. Enforced HERE, so it holds for every
-- app version on every handset — including the ones we cannot update today.
--
-- I cleaned 5,243 duplicate rows this morning and by evening there were 6,068
-- again: 8,427 rows where 2,308 was the honest number, 515 of them created in
-- three hours. Worse, the cleanup CAUSED some of it. The phone decides "is this
-- call already in the CRM?" by searching the 500 most recent rows; deleting
-- history shrank the window that search covers, so more of the 7-day scan
-- looked new and was sent again. The app-side fix for that is merged (#402) and
-- is sitting in an APK nobody has installed yet.
--
-- So the invariant moves to where the write happens, the same way 0153 moved
-- "one pending follow-up per lead" out of four racing writers and into the
-- database. A rep on a three-week-old build gets it for free.
--
-- A TRIGGER, NOT A UNIQUE INDEX. A unique index cannot be created while
-- duplicates exist, and clearing the remaining ones would mean destroying real
-- recordings: 5,171 of the extra rows sit in groups where more than one row
-- carries its own recording or AI summary. Those stay. This stops the bleeding
-- without asking anyone to trade audio for tidiness.
--
-- Returning NULL cancels the insert silently. Deliberate: the phone's backfill
-- counts a thrown error as a failed row and retries it forever, which is the
-- loop this is here to break. A duplicate that never lands is not an error —
-- the CRM already has that call.

create or replace function public.refuse_duplicate_call()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Same rep, same number, same instant is the same call. started_at comes from
  -- the handset's own call log, so a genuine second call to the same person in
  -- the same second does not exist.
  if new.started_at is not null and new.salesperson_id is not null then
    if exists (
      select 1 from public.call_logs cl
      where cl.salesperson_id = new.salesperson_id
        and cl.started_at = new.started_at
        and right(regexp_replace(cl.phone, '\D', '', 'g'), 10)
          = right(regexp_replace(new.phone, '\D', '', 'g'), 10)
    ) then
      return null;   -- already have it; drop this copy without an error
    end if;
  end if;
  return new;
end $$;

-- Runs BEFORE link_call_to_contact so a rejected duplicate costs nothing else.
drop trigger if exists trg_00_refuse_duplicate_call on public.call_logs;
create trigger trg_00_refuse_duplicate_call
  before insert on public.call_logs
  for each row execute function public.refuse_duplicate_call();

create index if not exists call_logs_dupe_probe_idx
  on public.call_logs (salesperson_id, started_at);
