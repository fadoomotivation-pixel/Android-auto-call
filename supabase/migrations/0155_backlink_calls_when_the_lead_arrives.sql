-- "Jo CRM me lead number aaye hue hain, unko bhi match karke verify karke ek
--  correct pulse banaye — to isme 0 ho hi nahi sakta."
--
-- Exactly right, and one direction of that match was missing.
--
-- link_call_to_contact (0082) fires when a CALL arrives and looks for a matching
-- contact. Nothing fired when a CONTACT arrived and looked for matching calls.
-- So the ORDER decided the truth:
--
--   lead imported, THEN called  → linked, counted as work              ✓
--   called, THEN lead imported  → off_crm forever, counted as nothing  ✗
--
-- The second order is the normal one here. Facebook leads land by cron, imports
-- land in batches, and a rep often rings a number before it is in the CRM at
-- all. Every one of those calls stayed invisible to the Pulse, HQ and velocity
-- for the rest of time — one of the ways a working day reports zero.
--
-- This closes the loop: when a contact appears, or its phone is corrected, any
-- unlinked call already sitting in that company for that number is attached and
-- stops being off_crm. Same 10-digit-tail rule link_call_to_contact uses, so the
-- two directions can never disagree.
--
-- SECURITY DEFINER because the writer is usually the importer or a rep, and
-- neither needs rights over other people's call rows to make this true.

-- Makes the lookup an index scan rather than a sequential scan of call_logs on
-- every contact insert. A 2,000-lead import would otherwise be 2,000 full scans.
create index if not exists call_logs_company_phone_tail_idx
  on public.call_logs (company_id, (right(regexp_replace(phone, '\D', '', 'g'), 10)))
  where contact_id is null;

create or replace function public.backlink_calls_to_new_contact()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_tail text; v_n int;
begin
  if new.company_id is null or new.phone is null then
    return new;
  end if;
  v_tail := right(regexp_replace(new.phone, '\D', '', 'g'), 10);
  if length(v_tail) <> 10 then
    return new;
  end if;

  update public.call_logs cl
     set contact_id = new.id,
         off_crm    = false
   where cl.company_id = new.company_id
     and cl.contact_id is null
     and right(regexp_replace(cl.phone, '\D', '', 'g'), 10) = v_tail;

  get diagnostics v_n = row_count;
  if v_n > 0 then
    raise notice 'backlinked % call(s) to contact %', v_n, new.id;
  end if;
  return new;
end $$;

-- AFTER, so the contact row exists before call_logs points at it.
-- UPDATE is scoped to phone: a contact whose number is corrected should pick up
-- the calls that were really made to it.
drop trigger if exists trg_backlink_calls_on_contact_insert on public.contacts;
create trigger trg_backlink_calls_on_contact_insert
  after insert on public.contacts
  for each row execute function public.backlink_calls_to_new_contact();

drop trigger if exists trg_backlink_calls_on_phone_change on public.contacts;
create trigger trg_backlink_calls_on_phone_change
  after update of phone on public.contacts
  for each row when (new.phone is distinct from old.phone)
  execute function public.backlink_calls_to_new_contact();
