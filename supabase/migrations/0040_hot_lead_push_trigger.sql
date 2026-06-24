-- ============================================================
-- Auto-fire hot-lead push
--   When a lead becomes HOT and is assigned to a rep, immediately
--   push "🔥 New hot lead — tap to call" to that rep's devices via the
--   notify-rep edge function. Closes the 5-minute digital-lead gap with
--   zero manual steps.
--
--   Auth: reuses the service_role_key Vault secret (same as the
--   manager-digest cron, migration 0021) as the Bearer token; notify-rep
--   recognises it as a trusted server caller.
-- ============================================================
create extension if not exists pg_net;

create or replace function public.notify_hot_lead()
returns trigger language plpgsql security definer set search_path = public, vault, net as $$
declare
  v_name text;
begin
  -- Only hot leads that actually have an owner to ring.
  if new.salesperson_id is null or coalesce(new.temperature, '') <> 'hot' then
    return new;
  end if;
  -- On UPDATE, only when it just turned hot or was just (re)assigned —
  -- not on every unrelated edit to the row.
  if tg_op = 'UPDATE'
     and old.temperature is not distinct from new.temperature
     and old.salesperson_id is not distinct from new.salesperson_id then
    return new;
  end if;

  v_name := coalesce(nullif(btrim(new.name), ''), new.phone);

  perform net.http_post(
    url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/notify-rep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), '')
    ),
    body := jsonb_build_object(
      'user_ids', jsonb_build_array(new.salesperson_id),
      'contact_id', new.id,
      'title', '🔥 New hot lead',
      'body', v_name || ' — tap to call now'
    )
  );
  return new;
end $$;

drop trigger if exists trg_notify_hot_lead on public.contacts;
create trigger trg_notify_hot_lead
  after insert or update of temperature, salesperson_id on public.contacts
  for each row execute function public.notify_hot_lead();
