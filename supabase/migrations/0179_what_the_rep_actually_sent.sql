-- The three things a WhatsApp watcher could see and was throwing away.
--
-- 1. VOICE NOTES. Indian real-estate reps do not type — they hold the button.
--    The watcher recorded media_kind='audio' and nothing else, so the single
--    most common way a rep actually talks to a buyer was stored as the word
--    "audio". Now the file itself is kept, and it lands in the same shape the
--    call recordings already use so the existing transcription path can read
--    it later.
--
-- 2. DELETED MESSAGES. "Delete for everyone" is invisible to the CRM today: the
--    row stays as if nothing happened. A rep quietly retracting a price, a
--    promise or an abuse is exactly the thing a super admin is asking this
--    feature for, and WhatsApp tells us it happened — we just never wrote it
--    down. The original text is KEPT; that is the entire point.
--
-- 3. EDITED MESSAGES. Same reasoning, softer. WhatsApp allows an edit within
--    15 minutes and reports it; body_original preserves what was first sent.
--
-- Nothing here weakens the company-SIM model: a non-lead conversation still
-- never gets its body stored, so it can never get its media stored either.

alter table public.wa_observed_messages
  add column if not exists deleted_at   timestamptz,
  add column if not exists edited_at    timestamptz,
  -- What the message said BEFORE it was edited or deleted. Null when neither
  -- has happened — the live text stays in `body` so every existing read keeps
  -- working untouched.
  add column if not exists body_original text,
  -- Path inside the wa-media bucket. Null when the file was not captured:
  -- capture is off, too large, or the download failed. Never a URL — signed
  -- links are minted per view, the same rule call recordings follow.
  add column if not exists media_path   text,
  -- Filled by the existing transcription path, not by this migration.
  add column if not exists transcript   text;

create index if not exists wa_observed_messages_deleted_idx
  on public.wa_observed_messages (salesperson_id, deleted_at)
  where deleted_at is not null;

-- Private, like call-recordings. A buyer's voice note is not public content and
-- must only ever be reachable through a signed URL minted for someone who has
-- already passed the super-admin check.
insert into storage.buckets (id, name, public, file_size_limit)
values ('wa-media', 'wa-media', false, 26214400)
on conflict (id) do nothing;

-- super_rep_threads gains the new columns. Shape change, so it must be dropped
-- rather than replaced.
drop function if exists public.super_rep_threads(uuid, int);

create or replace function public.super_rep_threads(p_rep uuid, p_limit int default 200)
returns table (
  contact_id uuid, lead_name text, lead_phone text, stage text,
  direction text, body text, media_kind text, file_name text,
  shared_details boolean, read_at timestamptz, sent_at timestamptz,
  signal text, deleted_at timestamptz, edited_at timestamptz,
  body_original text, media_path text, transcript text,
  duration_seconds int
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;

  return query
  select m.contact_id, ct.name, ct.phone, ct.stage,
         m.direction, m.body, m.media_kind, m.file_name,
         m.shared_details, m.read_at, m.sent_at, m.signal,
         m.deleted_at, m.edited_at, m.body_original, m.media_path, m.transcript,
         m.duration_seconds
  from public.wa_observed_messages m
  join public.contacts ct on ct.id = m.contact_id
  where m.salesperson_id = p_rep
  order by m.sent_at desc
  limit greatest(p_limit, 1);
end
$function$;

revoke all on function public.super_rep_threads(uuid, int) from public, anon;
grant execute on function public.super_rep_threads(uuid, int) to authenticated;

-- WHAT A REP TOOK BACK, ACROSS THE PLATFORM.
--
-- One deleted message is a typo. A rep who deletes several a week, always to
-- buyers who then go quiet, is a conversation a founder needs to have. This is
-- the only place that pattern is visible.
create or replace function public.super_deleted_messages(p_days int default 30)
returns table (
  company_id uuid, company_name text, rep_id uuid, rep_name text,
  contact_id uuid, lead_name text, lead_phone text,
  body_original text, direction text, sent_at timestamptz, deleted_at timestamptz
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;

  return query
  select m.company_id, co.name, m.salesperson_id, p.full_name,
         m.contact_id, ct.name, ct.phone,
         coalesce(m.body_original, m.body), m.direction, m.sent_at, m.deleted_at
  from public.wa_observed_messages m
  join public.companies co on co.id = m.company_id
  left join public.profiles p on p.id = m.salesperson_id
  left join public.contacts ct on ct.id = m.contact_id
  where m.deleted_at is not null
    and m.deleted_at >= now() - make_interval(days => greatest(p_days, 1))
  order by m.deleted_at desc
  limit 500;
end
$function$;

revoke all on function public.super_deleted_messages(int) from public, anon;
grant execute on function public.super_deleted_messages(int) to authenticated;
