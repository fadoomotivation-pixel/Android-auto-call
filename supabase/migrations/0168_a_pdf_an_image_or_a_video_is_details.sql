-- "Koi bhi PDF ya image ya video ko details send maan sakte ho."
--
-- The founder's definition, and it closes a hole in 0167.
--
-- THE HOLE: the observer reported one boolean, has_media, and anything true
-- counted as details shared. WhatsApp's audioMessage is media. Indian real
-- estate runs on voice notes — a rep sending forty of them in a morning would
-- have scored forty "details shared" without sharing a single thing. The one
-- number an admin was going to judge a telecaller by would have rewarded the
-- easiest possible activity, which is worse than not having the number at all.
--
-- THE RULE NOW: a document, an image or a video is details. A voice note is
-- work worth recording, and is recorded — but it is not details, and it is not
-- counted as any. A link still counts, because that is how a tracked brochure
-- from content_shares goes out.
--
-- media_kind is stored rather than re-derived so the admin can see WHAT went
-- out — "4 PDFs and 2 photos" reads very differently from "6 files" when you
-- are deciding whether a rep actually sent the plot layout.

alter table public.wa_observed_messages
  add column if not exists media_kind text;

alter table public.wa_observed_messages
  drop constraint if exists chk_wa_observed_media_kind;
alter table public.wa_observed_messages
  add constraint chk_wa_observed_media_kind
  check (media_kind is null or media_kind in ('document', 'image', 'video', 'audio', 'sticker', 'other'));

comment on column public.wa_observed_messages.media_kind is
  'What was attached. document/image/video count as project details; audio is '
  'a voice note and deliberately does not, or the metric would reward the '
  'easiest thing a rep can do.';

-- ── 'whatsapp' has to be a legal activity type ───────────────────────────────
--
-- 0167's trigger inserts lead_activities with type 'whatsapp', and
-- lead_activities_type_check does not allow it. That trigger would have thrown
-- on the very first observed message and taken the whole ingest batch with it —
-- caught here by a dry run before any worker was ever pointed at it, so no rows
-- were lost. Nothing had written yet.
--
-- Adding the type rather than reusing 'note': an admin wants to filter WhatsApp
-- work, and the lead page's JourneyRow already falls through to a default icon
-- for types it does not know, so nothing breaks while the app catches up.

alter table public.lead_activities
  drop constraint if exists lead_activities_type_check;
alter table public.lead_activities
  add constraint lead_activities_type_check
  check (type = any (array[
    'status', 'temperature', 'note', 'budget', 'site_visit',
    'follow_up', 'call', 'system', 'update', 'reminder', 'whatsapp'
  ]));

-- ── the lead's history says what actually went out ───────────────────────────

create or replace function public.wa_observed_to_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_actor text;
  v_what  text;
begin
  -- Only what the REP did. A buyer's reply belongs on the lead but is not the
  -- rep's work and must never inflate their day.
  if new.direction <> 'out' then
    return null;
  end if;

  select p.full_name into v_actor from public.profiles p where p.id = new.salesperson_id;

  v_what := case new.media_kind
    when 'document' then 'Sent a PDF on WhatsApp'
    when 'image'    then 'Sent a photo on WhatsApp'
    when 'video'    then 'Sent a video on WhatsApp'
    when 'audio'    then 'Sent a voice note on WhatsApp'
    when 'sticker'  then 'Messaged on WhatsApp'
    else case
      when new.shared_details then 'Sent project details on WhatsApp'
      else 'Messaged on WhatsApp'
    end
  end;

  insert into public.lead_activities (company_id, contact_id, actor_id, actor_name, type, detail)
  values (
    new.company_id, new.contact_id, new.salesperson_id,
    coalesce(nullif(btrim(v_actor), ''), 'Rep') || ' 💬',
    'whatsapp',
    v_what
  );
  return null;
end $fn$;

-- ── the admin sees the breakdown, not just a total ───────────────────────────

-- Dropped, not replaced. CREATE OR REPLACE VIEW can add columns at the END but
-- cannot insert one in the middle — Postgres reads that as renaming an existing
-- column and refuses. leads_given_details belongs beside leads_messaged, where
-- an admin reads it, not bolted on after the totals. Nothing consumes this view
-- yet, so dropping it costs nothing.
drop view if exists public.v_rep_whatsapp_daily;

create view public.v_rep_whatsapp_daily
with (security_invoker = true) as
select
  m.company_id,
  m.salesperson_id,
  (m.sent_at at time zone 'Asia/Kolkata')::date as day_ist,
  count(*) filter (where m.direction = 'out')                       as messages_sent,
  count(distinct m.contact_id) filter (where m.direction = 'out')   as leads_messaged,
  -- The headline: how many leads actually received the plot details, not how
  -- many messages went out. One rep sending six files to one lead is not six.
  count(distinct m.contact_id) filter (where m.direction = 'out' and m.shared_details)
                                                                    as leads_given_details,
  count(*) filter (where m.direction = 'out' and m.shared_details)  as details_shared,
  count(*) filter (where m.direction = 'out' and m.media_kind = 'document') as pdfs_sent,
  count(*) filter (where m.direction = 'out' and m.media_kind = 'image')    as images_sent,
  count(*) filter (where m.direction = 'out' and m.media_kind = 'video')    as videos_sent,
  -- Recorded, never counted as details. Kept visible so an admin can tell the
  -- difference between a rep who explains on voice and one who shares nothing.
  count(*) filter (where m.direction = 'out' and m.media_kind = 'audio')    as voice_notes_sent,
  count(distinct m.contact_id) filter (where m.direction = 'in')    as leads_who_replied,
  min(m.sent_at) filter (where m.direction = 'out')                 as first_message_at,
  max(m.sent_at) filter (where m.direction = 'out')                 as last_message_at
from public.wa_observed_messages m
group by m.company_id, m.salesperson_id, (m.sent_at at time zone 'Asia/Kolkata')::date;

comment on view public.v_rep_whatsapp_daily is
  'Per rep per IST day. leads_given_details and leads_who_replied are the two '
  'honest columns: neither can be inflated by sending the same lead more.';
