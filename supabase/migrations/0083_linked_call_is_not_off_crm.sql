-- A call that matches a real CRM lead is NOT an off-CRM call. Record-all-calls
-- flags every captured number off_crm=true up front; once we link it to a lead
-- (same phone, same company) it must flip off_crm=false, otherwise the recording
-- shows on the dashboard as "⚠ Off-CRM number" instead of under the lead's name.
-- Shweta's call to Mahak surfaced this: linked to the lead, yet still labelled
-- off-CRM, so the recording looked "missing".
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
  -- Any call tied to a lead is a CRM call, never off-CRM.
  if new.contact_id is not null then
    new.off_crm := false;
  end if;
  return new;
end $$;

-- Backfill: every already-linked call that is still flagged off-CRM.
update public.call_logs
set off_crm = false
where off_crm = true and contact_id is not null;
