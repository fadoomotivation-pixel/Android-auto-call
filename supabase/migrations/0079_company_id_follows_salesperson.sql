-- ============================================================
-- Company isolation, enforced: a lead's company_id ALWAYS follows its
-- assigned rep's company.
--
-- This invariant was violated three times in the field — assignment paths
-- (bulk reassign, imports, external tools) that set salesperson_id but left the
-- old company_id — which made the leads invisible to the rep (the app filters by
-- company_id) and technically leaked a row's company pointer across companies.
--
-- A BEFORE trigger now forces company_id = the assigned rep's company on every
-- insert/assign, so NO code path can break it again, and cross-company overlap
-- is impossible by construction.
-- ============================================================

create or replace function public.sync_contact_company()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_company uuid;
begin
  if new.salesperson_id is not null then
    select company_id into v_company from public.profiles where id = new.salesperson_id;
    if v_company is not null and new.company_id is distinct from v_company then
      new.company_id := v_company;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_contact_company on public.contacts;
create trigger trg_sync_contact_company
  before insert or update of salesperson_id, company_id on public.contacts
  for each row execute function public.sync_contact_company();

-- One-time cleanup of any rows already mis-companied (idempotent).
update public.contacts ct
set company_id = p.company_id
from public.profiles p
where ct.salesperson_id = p.id
  and p.company_id is not null
  and ct.company_id is distinct from p.company_id;
