-- Seven different buyers, all called "fanbedevelopers0001".
--
-- That is Ankita's own WhatsApp name. pushName is the name of whoever SENT a
-- message, and the worker took it as the PEER's name in every case. So:
--
--   outbound one-to-one   pushName is the REP. Every chat she wrote to was
--                         labelled with her own name.
--   group                 pushName is the participant. A group renamed itself
--                         after whoever spoke in it last — the PVC-panels
--                         group filed under "sunder singh", who is a person in
--                         it, not the group.
--   inbound one-to-one    pushName IS the peer. The only case that was right,
--                         and the reason the bug looked like a feature: "ਰਾਜ"
--                         on 918448893816 is genuinely Raj.
--
-- The same number even appeared twice with two names — the buyer's, from what
-- they sent, and the rep's, from what she sent back.
--
-- The old values are CLEARED rather than corrected, because the right name is
-- not recoverable from the wrong one. They refill on their own: group subjects
-- come back from groupMetadata, and a buyer's name from their next inbound
-- message.
--
-- sender_name is new and is the other half of the fix. In a group, knowing who
-- spoke is the difference between a conversation and a wall of text — and since
-- a migrated account is addressed by an opaque id rather than a phone number,
-- the number alone was fifteen digits nobody can ring or recognise.
--
-- APPLIED TO PRODUCTION BY HAND on 2026-09-16.

alter table public.wa_observed_messages
  add column if not exists sender_name text;

comment on column public.wa_observed_messages.sender_name is
  'In a group, the display name of whoever sent this message. peer_name is the GROUP; this is the person. Null in a one-to-one chat, where peer_name already says who it is.';

update public.wa_observed_messages
   set peer_name = null
 where archived_at is null
   and peer_name is not null
   and (is_group or direction = 'out');

drop function if exists public.super_rep_peer_thread(uuid, text, integer);

create or replace function public.super_rep_peer_thread(p_rep uuid, p_peer text, p_limit integer default 400)
returns table(
  direction text, body text, media_kind text, file_name text, media_path text,
  transcript text, duration_seconds integer, signal text,
  deleted_at timestamptz, edited_at timestamptz, body_original text,
  peer_name text, sent_at timestamptz, sender_phone text, is_group boolean,
  decrypt_failed boolean, decrypt_error text, sender_name text
)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;
  return query
  select m.direction, m.body, m.media_kind, m.file_name,
         m.media_path, m.transcript, m.duration_seconds,
         m.signal, m.deleted_at, m.edited_at, m.body_original,
         m.peer_name, m.sent_at, m.sender_phone, m.is_group,
         m.decrypt_failed, m.decrypt_error, m.sender_name
  from public.wa_observed_messages m
  where m.salesperson_id = p_rep
    and m.archived_at is null
    and right(regexp_replace(m.peer_phone, '\D', '', 'g'), 10)
      = right(regexp_replace(p_peer, '\D', '', 'g'), 10)
  order by m.sent_at desc
  limit greatest(p_limit, 1);
end
$function$;
