-- When a lead is (re)assigned to a telecaller it must look BRAND-NEW to them —
-- "Added" = the moment it was given, status back to New, sorted to the top —
-- and this must work on the app they already have installed (no update). Since
-- the app displays contacts.created_at, we make created_at = the assignment
-- time and preserve the true first-seen date in origin_created_at for owners.
-- (Applied live via MCP; verified with a throwaway reassignment.)

alter table public.contacts add column if not exists origin_created_at timestamptz;

create or replace function public.stamp_assigned_at()
returns trigger language plpgsql as $$
declare
  v_owner_changed boolean;
begin
  v_owner_changed := new.salesperson_id is not null
    and (tg_op = 'INSERT' or new.salesperson_id is distinct from old.salesperson_id);

  if v_owner_changed then
    new.assigned_at := now();
    if new.origin_created_at is null then
      new.origin_created_at := coalesce(
        case when tg_op = 'UPDATE' then old.created_at else new.created_at end, now());
    end if;
    new.created_at := now();
    if tg_op = 'UPDATE'
       and coalesce(new.status, 'new') not in ('booked','lost','not_interested','dnc') then
      new.status := 'new';
    end if;
  end if;
  return new;
end $$;

update public.contacts
  set origin_created_at = coalesce(created_at, now())
  where salesperson_id is not null and origin_created_at is null;
