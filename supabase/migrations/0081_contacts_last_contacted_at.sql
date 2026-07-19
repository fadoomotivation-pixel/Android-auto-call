-- The "Today" work view needs to know when a lead was last CALLED (any
-- direction, SIM or cloud). Stamp it on the contact whenever a call is logged,
-- so the app can drain worked leads out of "New" into "Today".
alter table public.contacts
  add column if not exists last_contacted_at timestamptz;

create index if not exists idx_contacts_last_contacted
  on public.contacts (salesperson_id, last_contacted_at);

create or replace function public.stamp_last_contacted()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_when timestamptz := coalesce(new.started_at, new.created_at, now());
begin
  if new.contact_id is not null then
    update public.contacts
    set last_contacted_at = greatest(coalesce(last_contacted_at, 'epoch'::timestamptz), v_when)
    where id = new.contact_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_stamp_last_contacted on public.call_logs;
create trigger trg_stamp_last_contacted
  after insert or update of contact_id, started_at on public.call_logs
  for each row execute function public.stamp_last_contacted();

-- Backfill from existing call history.
update public.contacts ct
set last_contacted_at = sub.mx
from (
  select contact_id, max(coalesce(started_at, created_at)) as mx
  from public.call_logs where contact_id is not null group by contact_id
) sub
where ct.id = sub.contact_id
  and (ct.last_contacted_at is null or ct.last_contacted_at < sub.mx);
