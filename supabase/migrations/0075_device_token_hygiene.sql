-- ============================================================
-- Device-token hygiene: stop cross-company notification leaks.
--
-- Incident: a lead-assignment push for one company rang on a phone used by
-- another company's telecaller. Root cause: device_tokens rows go stale —
--   1. logout never removed the row, so an old login haunts the phone;
--   2. when a DIFFERENT user signs in on the same phone, the app's upsert of
--      the same FCM token was silently blocked by RLS (the row still belongs
--      to the previous user), so the row kept pointing at the old user;
--   3. when a user is moved to another company, their token rows kept the old
--      company stamp.
-- ============================================================

-- (2) Let a signed-in user CLAIM a token row. An FCM token is an unguessable
-- per-install secret: whoever presents it holds the physical device, so they
-- may take the row over. with check still forces the row onto the caller.
drop policy if exists dt_update on public.device_tokens;
create policy dt_update on public.device_tokens for update to authenticated
  using (true) with check (user_id = auth.uid());

-- (3) When a user is moved to another company, drop their device tokens —
-- their app re-registers with the right company stamp on next open. Until
-- then they simply get no pushes, which is the safe direction.
create or replace function public.purge_tokens_on_company_move()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.company_id is distinct from old.company_id then
    delete from public.device_tokens where user_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists trg_purge_tokens_on_company_move on public.profiles;
create trigger trg_purge_tokens_on_company_move
  after update of company_id on public.profiles
  for each row execute function public.purge_tokens_on_company_move();

-- One-time cleanup of rows already stale (idempotent):
--   tokens stamped with a company the user no longer belongs to → gone;
--   tokens missing a company stamp → backfilled from the profile.
delete from public.device_tokens dt
using public.profiles p
where p.id = dt.user_id and dt.company_id is not null
  and dt.company_id is distinct from p.company_id;

update public.device_tokens dt
set company_id = p.company_id, updated_at = now()
from public.profiles p
where p.id = dt.user_id and dt.company_id is null and p.company_id is not null;
