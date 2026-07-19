-- Every call recording must be attributed to its lead (commission depends on it).
-- Some app paths logged a call with contact_id = null, so the recording floated
-- as "Unknown" and never showed on the lead page. A BEFORE trigger now links any
-- call to the lead with the same phone in the same company whenever contact_id
-- is missing — so no recording is ever orphaned again, from any path.
create or replace function public.link_call_to_contact()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_tail text;
begin
  if new.contact_id is null and new.company_id is not null and new.phone is not null then
    v_tail := right(regexp_replace(new.phone, '\D', '', 'g'), 10);
    if length(v_tail) = 10 then
      select id into v_id from public.contacts
      where company_id = new.company_id
        and right(regexp_replace(phone, '\D', '', 'g'), 10) = v_tail
      limit 1;
      if v_id is not null then new.contact_id := v_id; end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_link_call_to_contact on public.call_logs;
create trigger trg_link_call_to_contact
  before insert or update of phone, contact_id, company_id on public.call_logs
  for each row execute function public.link_call_to_contact();

-- One-time backfill of already-orphaned calls (same-phone, same-company match).
update public.call_logs cl
set contact_id = ct.id
from public.contacts ct
where cl.contact_id is null
  and ct.company_id = cl.company_id
  and length(right(regexp_replace(cl.phone, '\D', '', 'g'), 10)) = 10
  and right(regexp_replace(ct.phone, '\D', '', 'g'), 10) = right(regexp_replace(cl.phone, '\D', '', 'g'), 10);
