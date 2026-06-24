-- ============================================================
-- Bulk lead-assignment push
--   When an admin assigns leads to a rep — whether by importing a
--   batch or reassigning existing leads — send the rep ONE summary
--   push ("40 new leads assigned to you") instead of 40 separate
--   pings. Uses STATEMENT-level triggers with transition tables so a
--   single INSERT/UPDATE statement (the import inserts in chunks) is
--   collapsed to one notification per rep.
--
--   Auth: reuses the service_role_key Vault secret as the Bearer token,
--   same trusted-server pattern as the hot-lead trigger (migration 0040).
--   Rings on the "lead_assignments" Android channel.
-- ============================================================
create extension if not exists pg_net;

-- Shared sender: one push to one rep with a count.
create or replace function public.send_assignment_push(p_salesperson uuid, p_count int)
returns void language plpgsql security definer set search_path = public, vault, net as $$
declare
  v_body text;
begin
  if p_salesperson is null or coalesce(p_count, 0) < 1 then
    return;
  end if;
  v_body := case
    when p_count = 1 then '1 new lead assigned to you — tap to start calling'
    else p_count::text || ' new leads assigned to you — tap to start calling'
  end;

  perform net.http_post(
    url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/notify-rep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), '')
    ),
    body := jsonb_build_object(
      'user_ids', jsonb_build_array(p_salesperson),
      'title', '📋 New leads assigned',
      'body', v_body,
      'channel', 'lead_assignments'
    )
  );
end $$;

-- New leads inserted already owned by a rep (e.g. an Import-Leads batch).
create or replace function public.notify_bulk_assign_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.send_assignment_push(salesperson_id, count(*)::int)
  from new_rows
  where salesperson_id is not null
  group by salesperson_id;
  return null;
end $$;

-- Existing leads (re)assigned to a rep — only rows whose owner actually changed.
create or replace function public.notify_bulk_assign_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.send_assignment_push(n.salesperson_id, count(*)::int)
  from new_rows n
  join old_rows o on o.id = n.id
  where n.salesperson_id is not null
    and o.salesperson_id is distinct from n.salesperson_id
  group by n.salesperson_id;
  return null;
end $$;

drop trigger if exists trg_notify_bulk_assign_ins on public.contacts;
create trigger trg_notify_bulk_assign_ins
  after insert on public.contacts
  referencing new table as new_rows
  for each statement execute function public.notify_bulk_assign_insert();

drop trigger if exists trg_notify_bulk_assign_upd on public.contacts;
-- NOTE: a column list (`update of salesperson_id`) is incompatible with
-- transition tables, so we trigger on any UPDATE and filter inside the
-- function to rows whose owner actually changed.
create trigger trg_notify_bulk_assign_upd
  after update on public.contacts
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.notify_bulk_assign_update();
