-- The conversations were there the whole time; nothing would show them.
--
-- super_rep_threads joins contacts, so it can only ever return chats with a
-- KNOWN lead. For Ankita that join matches zero rows, and the page had no other
-- way in — 13,289 stored messages and a screen that said "no conversations".
--
-- Since the company-SIM pivot these bodies ARE stored on purpose: the whole
-- point was that a buyer messaging a company number who is not yet in the CRM
-- is a lead nobody wrote down, and dropping it unread reported the loss as a
-- reassuring zero. Storing it and then refusing to display it is the same
-- failure one step later. The page's old footnote claimed the opposite and was
-- simply out of date.
--
-- Super admin only, same gate as every other function on that screen.

create or replace function public.super_rep_peer_thread(p_rep uuid, p_peer text, p_limit int default 400)
returns table (
  direction text, body text, media_kind text, file_name text,
  media_path text, transcript text, duration_seconds int,
  signal text, deleted_at timestamptz, edited_at timestamptz,
  body_original text, peer_name text, sent_at timestamptz
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;

  return query
  select m.direction, m.body, m.media_kind, m.file_name,
         m.media_path, m.transcript, m.duration_seconds,
         m.signal, m.deleted_at, m.edited_at, m.body_original,
         m.peer_name, m.sent_at
  from public.wa_observed_messages m
  where m.salesperson_id = p_rep
    -- Matched on the last ten digits, the same identity every other phone
    -- comparison in this system uses, so a stored 91XXXXXXXXXX and a typed
    -- XXXXXXXXXX find the same conversation.
    and right(regexp_replace(m.peer_phone, '\D', '', 'g'), 10)
      = right(regexp_replace(p_peer, '\D', '', 'g'), 10)
  order by m.sent_at desc
  limit greatest(p_limit, 1);
end
$function$;

revoke all on function public.super_rep_peer_thread(uuid, text, int) from public, anon;
grant execute on function public.super_rep_peer_thread(uuid, text, int) to authenticated;
