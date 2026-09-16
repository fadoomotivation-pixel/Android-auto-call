-- "Still only one number." The rest arrived. None of them could be opened.
--
-- WHAT WE COULD NOT SEE
--
-- WhatsApp hands Baileys an encrypted envelope. If the Signal session no longer
-- matches what the sender encrypted with, decryption fails — and Baileys STILL
-- emits the message, with messageStubType CIPHERTEXT, an empty body, and the
-- libsignal error in messageStubParameters: "Bad MAC", "No session record",
-- "Failed to decrypt message with any known session".
--
-- The worker dropped those two lines later, at `if (!text.trim() && !kind)
-- return;`, without a word. So for a fortnight the host's log filled with
-- decryption failures while the dashboard showed a clean, healthy, empty
-- screen, and nobody could tell these two apart:
--
--   this rep has no one-to-one chats
--   every one of them arrived and not one could be opened
--
-- Opposite problems. Opposite fixes. Identical on screen.
--
-- WHY THE ROW IS KEPT
--
-- Because the conversation is real. A buyer messaging a rep is a fact worth
-- showing even when the words are unavailable — the number, the direction and
-- the time all survive, and the thread says plainly that its contents could not
-- be unlocked. A founder seeing "23 messages here could not be read" knows to
-- re-link. A founder seeing nothing concludes the rep is idle, which is what
-- happened, repeatedly, for weeks.
--
-- Bad MAC has no repair. Our Signal store was copied between directories and
-- shuffled between credential generations while we chased the LID bug and the
-- presence flag, and a Signal store does not survive that. Only a fresh pairing
-- mints new keys — which is exactly the scan the rep is being asked for, and
-- this is the screen that will prove it worked.
--
-- APPLIED TO PRODUCTION BY HAND on 2026-09-16.

alter table public.wa_observed_messages
  add column if not exists decrypt_failed boolean not null default false,
  add column if not exists decrypt_error text;

comment on column public.wa_observed_messages.decrypt_failed is
  'The message arrived from WhatsApp and could not be decrypted — the Signal session no longer matches. The row exists so the conversation is visible; the contents are unavailable and no re-sync can recover them. Only a fresh pairing mints working keys.';

create or replace function public.super_rep_locked_chats(p_rep uuid)
returns table(peer_phone text, peer_name text, locked integer, last_at timestamptz, why text)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;
  return query
  select m.peer_phone,
         max(m.peer_name) filter (where m.peer_name is not null),
         count(*)::int,
         max(m.sent_at),
         (array_agg(m.decrypt_error) filter (where m.decrypt_error is not null))[1]
  from public.wa_observed_messages m
  where m.salesperson_id = p_rep and m.decrypt_failed and m.archived_at is null
  group by m.peer_phone
  order by count(*) desc
  limit 200;
end
$function$;

comment on function public.super_rep_locked_chats(uuid) is
  'Conversations whose messages arrived but could not be decrypted. A non-empty result means the rep must re-link: the key store is damaged and no amount of waiting fixes it.';
