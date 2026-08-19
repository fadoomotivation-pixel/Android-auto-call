-- The last Hinglish left in the product was written by Postgres.
--
-- The app and the AI now speak simple Indian English, but three database
-- functions still wrote Hinglish straight onto a rep's screen, and the app has
-- no say in it — the text arrives already written:
--
--   * book_callback_if_missing stamps every auto-booked callback with
--     "Auto: callback ka time set nahi tha — kal 11 AM". 540 rows carry it,
--     102 of them still pending, and it is the note a rep reads on the
--     Follow Ups list today.
--   * on_checkin_release_leads pushes a Hindi notification when a check-in
--     lands outside the office.
--   * assign_pool_core returns a Hinglish note to the admin API.
--
-- Same meaning, plain words. Nothing about WHEN a callback is booked, WHO gets
-- it, or the geofence rule changes here — only the wording.

-- ── 1. the auto-booked callback note ──
--
-- "kal 11 AM" also aged badly: the note is written once and read for weeks, so
-- by the time a rep sees it "tomorrow" is a lie. The row already shows its own
-- due date next to the note, so the note only has to explain WHY it exists.

create or replace function public.book_callback_if_missing(
  p_contact_id uuid, p_company_id uuid, p_salesperson_id uuid,
  p_status text, p_stage text, p_phone text, p_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_due timestamptz;
begin
  if p_status is distinct from 'callback'
     or p_salesperson_id is null
     or p_company_id is null
     or not public.stage_is_open(p_stage) then
    return;
  end if;

  if exists (
    select 1 from public.follow_ups f
    where f.contact_id = p_contact_id and f.status = 'pending'
  ) then
    return;
  end if;

  -- next day 11:00 IST, expressed as a UTC timestamptz
  v_due := (date_trunc('day', (now() at time zone 'Asia/Kolkata'))
            + interval '1 day' + interval '11 hour') at time zone 'Asia/Kolkata';

  insert into public.follow_ups (company_id, salesperson_id, contact_id, phone, name, due_at, note)
  values (p_company_id, p_salesperson_id, p_contact_id, p_phone, p_name, v_due,
          'No call time was set, so we booked one for 11 AM');
end $function$;

-- The notes already written. A rep opening Follow Ups tomorrow should not find
-- half the list in one language and half in another, so the old rows get the
-- new wording too. Matched on the exact strings the two versions of this
-- function ever wrote — nothing a human typed is touched.

update public.follow_ups
   set note = 'No call time was set, so we booked one for 11 AM'
 where note = 'Auto: callback ka time set nahi tha — kal 11 AM';

update public.follow_ups
   set note = 'No call time was set, so we booked one for 11 AM'
 where note = 'Auto: callback ka time set nahi tha — kal 11 AM (backfill)';

-- ── 2. the off-site check-in push ──
--
-- Body text only. geo_ok, the distance test and the auto_distribute branch are
-- byte-for-byte what they were.

create or replace function public.on_checkin_release_leads()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'vault', 'net'
as $function$
declare v_pol public.lead_routing_policy%rowtype;
begin
  select * into v_pol from public.lead_routing_policy where company_id = new.company_id;

  if new.geo_ok is false then
    perform net.http_post(
      url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/notify-rep',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(
          (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), '')
      ),
      body := jsonb_build_object(
        'user_ids', jsonb_build_array(new.salesperson_id),
        'title', '📍 You checked in away from the office',
        'body', case
          when new.distance_m is null
            then 'Location was off, so the check-in could not be confirmed. Turn location on and check in again to start getting new leads.'
          else 'You checked in ' || new.distance_m || ' m away from the office. Reach the office and check in again to start getting new leads.'
        end,
        'channel', 'lead_assignments'
      )
    );
    return null;
  end if;

  if v_pol.auto_distribute and new.punch_in_at is not null then
    perform public.assign_pool_core(new.company_id, 200, false);
  end if;
  return null;
end $function$;

-- ── 3. the admin API note ──
--
-- assign_pool_core is long and its logic is not what is wrong with it, so this
-- swaps the one string in place rather than restating the function and risking
-- a transcription slip. It raises if the string is not there, so a drifted
-- function fails the migration instead of silently keeping the old wording.

do $mig$
declare
  v_old constant text := '''note'', ''koi eligible telecaller nahi (check-in / backlog)''';
  v_new constant text := '''note'', ''No telecaller is eligible right now (check-in or backlog)''';
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'assign_pool_core';

  if v_def is null then
    raise exception 'assign_pool_core not found';
  end if;
  if position(v_old in v_def) = 0 then
    raise exception 'the Hinglish note is not in assign_pool_core any more — check it by hand';
  end if;

  execute replace(v_def, v_old, v_new);

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'assign_pool_core';
  if position(v_old in v_def) <> 0 then
    raise exception 'substitution did not take in assign_pool_core';
  end if;
end
$mig$;
