-- ============================================================
-- Never-miss lead assignments
-- Problem: the assignment push fires ONCE at assign time. If the
-- telecaller's device token isn't registered yet (fresh install, app
-- not opened, token rotated), notify-rep returns "no devices" and the
-- alert is lost forever.
-- Fix: stamp assigned_at whenever a lead becomes owned by a rep, so the
-- app can catch up on app-open ("2 new leads assigned while you were
-- away") — a pull that never depends on push timing.
-- ============================================================

alter table public.contacts
  add column if not exists assigned_at timestamptz;

-- Set assigned_at the moment salesperson_id becomes non-null (insert or
-- reassignment). Runs BEFORE so the value is written in the same row.
create or replace function public.stamp_assigned_at()
returns trigger language plpgsql as $$
begin
  if new.salesperson_id is not null
     and (tg_op = 'INSERT' or new.salesperson_id is distinct from old.salesperson_id) then
    new.assigned_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_stamp_assigned_at on public.contacts;
create trigger trg_stamp_assigned_at
  before insert or update of salesperson_id on public.contacts
  for each row execute function public.stamp_assigned_at();

-- Backfill: existing owned leads get assigned_at = created_at so the app's
-- "since last seen" logic has a baseline (won't re-alert old leads because
-- the app seeds last-seen = now() on first run).
update public.contacts
  set assigned_at = coalesce(created_at, now())
  where salesperson_id is not null and assigned_at is null;
