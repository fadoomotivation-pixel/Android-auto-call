-- Retire a rep's old capture before a fresh link, without destroying it.
--
-- WHY THIS IS NEEDED NOW
--
-- Telling WhatsApp we were "available" (worker 2026.09.15-17) made live
-- messages arrive for the first time in the life of this feature — today's
-- chats, with names, images and PDFs, within minutes of the upload. But the
-- host's log filled with:
--
--   Failed to decrypt message with any known session...
--   Session error: Bad MAC
--
-- Bad MAC means the Signal session store no longer matches what WhatsApp is
-- encrypting with. Ours had been copied between directories and shuffled
-- between credential generations for a fortnight while we chased the wrong
-- bugs, and a Signal store does not survive that. Some messages decrypt, most
-- do not, and media downloads — which need the same keys — fail outright: 11
-- new attachments arrived and 0 files could be fetched.
--
-- There is no repair for Bad MAC. A fresh pairing mints new identity keys and
-- new sessions, and that is the only fix. So the rep scans once more, and this
-- time the screen must not read the new capture through a year of stale data.
--
-- WHY archived_at AND NOT delete
--
-- The founder asked for the old data to be removed so it cannot merge. It is
-- also, still, the only surviving copy of a year of that rep's conversations —
-- she lost WhatsApp off her own phone and this database is where it was
-- recovered from, over about a week. "Hidden" satisfies the request; "deleted"
-- cannot be undone if it turns out to have been the wrong call.
--
-- Deduplication does the rest: the ingest upserts on (salesperson_id,
-- wa_message_id) with ignoreDuplicates, so the history sync that follows the
-- re-scan cannot resurrect a retired row. The new capture stays clean on its
-- own, with no filtering rule anyone has to remember.

alter table public.wa_observed_messages
  add column if not exists archived_at timestamptz;

comment on column public.wa_observed_messages.archived_at is
  'Set when a rep is re-linked and the old capture is retired. The rows stay — they are still the only copy of that history — but every supervision screen hides them so a fresh scan is not read through a year of stale data.';

-- Every reader now filters on this, so the partial index is the one that
-- matters: it covers the live rows only and stays small as archives pile up.
create index if not exists wa_observed_messages_live_idx
  on public.wa_observed_messages (salesperson_id, sent_at desc)
  where archived_at is null;

create or replace function public.super_rep_conversations(p_rep uuid)
returns table(
  peer_phone text, peer_name text, lead_name text, contact_id uuid,
  messages integer, they_sent integer, rep_sent integer, calls integer,
  first_at timestamptz, last_at timestamptz, last_body text, last_media text,
  is_group boolean
)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;
  return query
  with dialled as (
    select right(regexp_replace(cl.phone, '\D', '', 'g'), 10) as l10, count(*)::int as n
    from public.call_logs cl
    where cl.salesperson_id = p_rep and cl.phone is not null
    group by 1
  ),
  agg as (
    select m.peer_phone,
           right(regexp_replace(m.peer_phone, '\D', '', 'g'), 10) as l10,
           bool_or(m.is_group) as grp,
           max(m.peer_name) filter (where m.peer_name is not null) as nm,
           (array_agg(m.contact_id) filter (where m.contact_id is not null))[1] as cid,
           count(*)::int as total,
           count(*) filter (where m.direction = 'in')::int as inbound,
           count(*) filter (where m.direction = 'out')::int as outbound,
           min(m.sent_at) as first_at, max(m.sent_at) as last_at
    from public.wa_observed_messages m
    where m.salesperson_id = p_rep and m.peer_phone is not null
      and m.archived_at is null
    group by m.peer_phone
  ),
  tail as (
    select distinct on (m.peer_phone) m.peer_phone, m.body, m.media_kind
    from public.wa_observed_messages m
    where m.salesperson_id = p_rep and m.peer_phone is not null
      and m.archived_at is null
    order by m.peer_phone, m.sent_at desc
  )
  select a.peer_phone, a.nm, ct.name, a.cid,
         a.total, a.inbound, a.outbound,
         case when a.grp then 0 else coalesce(d.n, 0) end,
         a.first_at, a.last_at,
         left(coalesce(t.body, ''), 160), t.media_kind, a.grp
  from agg a
  left join dialled d on d.l10 = a.l10
  left join tail t on t.peer_phone = a.peer_phone
  left join public.contacts ct on ct.id = a.cid
  order by a.last_at desc
  limit 2000;
end
$function$;

create or replace function public.super_rep_peer_thread(p_rep uuid, p_peer text, p_limit integer default 400)
returns table(
  direction text, body text, media_kind text, file_name text, media_path text,
  transcript text, duration_seconds integer, signal text,
  deleted_at timestamptz, edited_at timestamptz, body_original text,
  peer_name text, sent_at timestamptz, sender_phone text, is_group boolean
)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;
  return query
  select m.direction, m.body, m.media_kind, m.file_name,
         m.media_path, m.transcript, m.duration_seconds,
         m.signal, m.deleted_at, m.edited_at, m.body_original,
         m.peer_name, m.sent_at, m.sender_phone, m.is_group
  from public.wa_observed_messages m
  where m.salesperson_id = p_rep
    and m.archived_at is null
    and right(regexp_replace(m.peer_phone, '\D', '', 'g'), 10)
      = right(regexp_replace(p_peer, '\D', '', 'g'), 10)
  order by m.sent_at desc
  limit greatest(p_limit, 1);
end
$function$;

create or replace function public.super_rep_unknown_numbers(p_rep uuid, p_days integer default 0)
returns table(
  peer_phone text, peer_name text, messages integer, they_sent integer,
  rep_sent integer, calls integer, first_seen timestamptz, last_seen timestamptz
)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;
  return query
  with dialled as (
    select right(regexp_replace(cl.phone, '\D', '', 'g'), 10) as l10, count(*)::int as n
    from public.call_logs cl
    where cl.salesperson_id = p_rep and cl.phone is not null
    group by 1
  ),
  msgs as (
    select m.peer_phone,
           right(regexp_replace(m.peer_phone, '\D', '', 'g'), 10) as l10,
           max(m.peer_name) filter (where m.peer_name is not null) as nm,
           count(*)::int as total,
           count(*) filter (where m.direction = 'in')::int as inbound,
           count(*) filter (where m.direction = 'out')::int as outbound,
           min(m.sent_at) as first_at, max(m.sent_at) as last_at
    from public.wa_observed_messages m
    where m.salesperson_id = p_rep and m.contact_id is null and m.peer_phone is not null
      and m.archived_at is null
      and (p_days <= 0 or m.sent_at >= now() - make_interval(days => p_days))
    group by m.peer_phone
  )
  select x.peer_phone, x.nm, x.total, x.inbound, x.outbound,
         coalesce(d.n, 0), x.first_at, x.last_at
  from msgs x
  left join dialled d on d.l10 = x.l10
  order by coalesce(d.n, 0) desc, x.total desc
  limit 1000;
end
$function$;

create or replace function public.super_rep_retire_capture(p_rep uuid)
returns integer
language plpgsql security definer set search_path to 'public'
as $function$
declare n integer;
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;
  update public.wa_observed_messages
     set archived_at = now()
   where salesperson_id = p_rep and archived_at is null;
  get diagnostics n = row_count;
  return n;
end
$function$;
