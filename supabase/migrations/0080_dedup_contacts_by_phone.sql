-- ============================================================
-- No duplicate lead per company, ever — enforced at the DB level.
--
-- Duplicates kept appearing (same CSV imported twice, Meta test tool, etc.).
-- The Facebook webhook already dedups by phone, but imports and other paths
-- didn't reliably. Rather than patch each path, guarantee it in one place: a
-- BEFORE INSERT trigger SILENTLY SKIPS a new contact whose phone (last 10
-- digits) already exists in the same company. It never raises, so no insert
-- path (import UI, webhook, manual add, external tool) errors — duplicates
-- simply are not created.
-- ============================================================

create index if not exists idx_contacts_company_phone10
  on public.contacts (company_id, (right(regexp_replace(phone, '\D', '', 'g'), 10)));

create or replace function public.dedup_contact_by_phone()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := new.company_id;
  v_sp uuid;
  v_tail text := right(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), 10);
begin
  if v_tail is null or length(v_tail) < 10 then
    return new; -- not a real 10-digit phone; let it through
  end if;
  -- Resolve the effective company the same way sync_contact_company (0079) does,
  -- so the check is correct regardless of trigger firing order.
  if new.salesperson_id is not null then
    select company_id into v_sp from public.profiles where id = new.salesperson_id;
    if v_sp is not null then v_company := v_sp; end if;
  end if;
  if v_company is not null and exists (
    select 1 from public.contacts c
    where c.company_id = v_company
      and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) = v_tail
  ) then
    return null; -- duplicate → skip the insert silently
  end if;
  return new;
end $$;

drop trigger if exists trg_dedup_contact_by_phone on public.contacts;
create trigger trg_dedup_contact_by_phone
  before insert on public.contacts
  for each row execute function public.dedup_contact_by_phone();

-- NOTE: existing duplicates were cleaned in the same session (childless copies
-- deleted, the most-progressed row kept per company+phone). One group with call
-- history in the platform-owner's own test company was intentionally left.
