-- The conversation list and the thread read the name directory, and the thread
-- reports what happened to each file. See 0198 for both.
--
-- APPLIED TO PRODUCTION BY HAND on 2026-09-16.

drop function if exists public.super_rep_conversations(uuid);

create or replace function public.super_rep_conversations(p_rep uuid)
returns table(
  peer_phone text, peer_name text, lead_name text, contact_id uuid,
  messages integer, they_sent integer, rep_sent integer, calls integer,
  first_at timestamptz, last_at timestamptz, last_body text, last_media text,
  is_group boolean, peer_is_lid boolean, files_saved integer, files_total integer
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
           bool_or(m.peer_is_lid) as lid,
           max(m.peer_name) filter (where m.peer_name is not null) as nm,
           (array_agg(m.contact_id) filter (where m.contact_id is not null))[1] as cid,
           count(*)::int as total,
           count(*) filter (where m.direction = 'in')::int as inbound,
           count(*) filter (where m.direction = 'out')::int as outbound,
           count(*) filter (where m.has_media)::int as files_total,
           count(*) filter (where m.media_path is not null)::int as files_saved,
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
  select a.peer_phone,
         -- The directory first: the name the rep has this number saved as, or
         -- the group's real subject. Only if there is none does this fall back
         -- to a name lifted off a message.
         coalesce(pn.name, a.nm),
         ct.name, a.cid,
         a.total, a.inbound, a.outbound,
         case when a.grp or a.lid then 0 else coalesce(d.n, 0) end,
         a.first_at, a.last_at,
         left(coalesce(t.body, ''), 160), t.media_kind, a.grp, a.lid,
         a.files_saved, a.files_total
  from agg a
  left join dialled d on d.l10 = a.l10 and not a.grp and not a.lid
  left join tail t on t.peer_phone = a.peer_phone
  left join public.contacts ct on ct.id = a.cid
  left join public.wa_peer_names pn
    on pn.salesperson_id = p_rep and pn.peer_phone = a.peer_phone
  order by a.last_at desc
  limit 2000;
end
$function$;

drop function if exists public.super_rep_peer_thread(uuid, text, integer);

create or replace function public.super_rep_peer_thread(p_rep uuid, p_peer text, p_limit integer default 400)
returns table(
  direction text, body text, media_kind text, file_name text, media_path text,
  transcript text, duration_seconds integer, signal text,
  deleted_at timestamptz, edited_at timestamptz, body_original text,
  peer_name text, sent_at timestamptz, sender_phone text, is_group boolean,
  decrypt_failed boolean, decrypt_error text, sender_name text,
  media_status text, media_error text, file_size bigint
)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;
  return query
  select m.direction, m.body, m.media_kind, m.file_name,
         m.media_path, m.transcript, m.duration_seconds,
         m.signal, m.deleted_at, m.edited_at, m.body_original,
         coalesce(sn.name, m.peer_name), m.sent_at, m.sender_phone, m.is_group,
         m.decrypt_failed, m.decrypt_error,
         -- The speaker's saved name beats the one they chose for themselves.
         coalesce(sp.name, m.sender_name),
         m.media_status, m.media_error, m.file_size::bigint
  from public.wa_observed_messages m
  left join public.wa_peer_names sn
    on sn.salesperson_id = p_rep and sn.peer_phone = m.peer_phone
  left join public.wa_peer_names sp
    on sp.salesperson_id = p_rep and sp.peer_phone = m.sender_phone
  where m.salesperson_id = p_rep
    and m.archived_at is null
    and right(regexp_replace(m.peer_phone, '\D', '', 'g'), 10)
      = right(regexp_replace(p_peer, '\D', '', 'g'), 10)
  order by m.sent_at desc
  limit greatest(p_limit, 1);
end
$function$;
