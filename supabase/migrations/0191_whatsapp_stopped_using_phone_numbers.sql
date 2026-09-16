-- The one-to-one conversations were never missing. They were being thrown away.
--
-- WHAT THE DATA SAID
--
-- Ankita's capture, by month, before the re-link:
--
--   Aug 2026   673 messages   57 people   all one-to-one
--   Sep 2026    15 messages    3 people   then nothing
--
-- And the fresh two-week history sync that followed the re-link:
--
--   1,106 messages   10 conversations   EVERY ONE A GROUP
--
-- Not a sync that stopped, and not a pairing that failed. Groups are addressed
-- "@g.us" and came through untouched; one-to-one chats are addressed by the
-- other person, and WhatsApp changed how it addresses people.
--
-- WhatsApp has moved accounts onto LID addressing — an opaque per-account id at
-- "@lid" that does not reveal a phone number. The worker's every listener began
-- `if (!jid.endsWith("@s.whatsapp.net")) return;`, correct for years and now a
-- filter that discards every conversation with a migrated contact. September is
-- when Ankita's contacts finished migrating. Three re-scans were asked of her
-- for a bug no re-scan could have touched.
--
-- WHY A COLUMN IS NEEDED
--
-- The worker now accepts "@lid" and resolves the number from the sender_pn /
-- participant_pn attributes WhatsApp attaches for exactly this purpose, from
-- the contact list, and from chats.phoneNumberShare. Most conversations resolve.
-- Some will not, at least not immediately — and a conversation whose number is
-- not yet known must still be readable, because an unreadable number is a poor
-- outcome and a missing conversation is a worse one.
--
-- So those rows are stored with the LID in peer_phone and this flag set. It
-- says one thing to every reader: do not treat this as a phone number. Do not
-- match it against a lead, do not offer it as one to capture, do not put a
-- wa.me link on it. When the worker later learns the number it sends the
-- mapping, whatsapp-observe re-keys the rows, and the flag clears.

alter table public.wa_observed_messages
  add column if not exists peer_is_lid boolean not null default false;

comment on column public.wa_observed_messages.peer_is_lid is
  'True when peer_phone holds a WhatsApp LID rather than a phone number — WhatsApp addressed this contact anonymously and has not revealed their number yet. Never match a LID against a lead. Clears automatically when the worker reports the mapping.';

-- Every screen that offers a number as a capturable lead reads through here, so
-- the filter belongs in one place rather than in each of them.
create index if not exists wa_observed_messages_lid_idx
  on public.wa_observed_messages (salesperson_id, peer_phone)
  where peer_is_lid and archived_at is null;

-- ── Re-keying, when the number finally arrives ──────────────────────────────
--
-- Called by whatsapp-observe with the mappings the worker has learned. Without
-- it a buyer shows up as two conversations: the one captured while their number
-- was hidden and the one captured after.

create or replace function public.wa_resolve_lid(
  p_rep uuid, p_lid text, p_phone text
) returns integer
language plpgsql security definer set search_path to 'public'
as $function$
declare
  n integer;
  v_company uuid;
  v_contact uuid;
begin
  if p_rep is null or coalesce(p_lid, '') = '' or coalesce(p_phone, '') = '' then
    return 0;
  end if;

  select company_id into v_company
  from public.wa_rep_sessions where salesperson_id = p_rep;
  if v_company is null then return 0; end if;

  -- The number may well belong to a lead this CRM already has. That is the
  -- whole point of learning it: the conversation stops being an anonymous
  -- stranger's and attaches to the lead page it belongs on.
  select public.match_wa_contact(v_company, p_phone) into v_contact;

  update public.wa_observed_messages
     set peer_phone = p_phone,
         peer_is_lid = false,
         contact_id = coalesce(contact_id, v_contact)
   where salesperson_id = p_rep
     and peer_is_lid
     and peer_phone = p_lid;

  get diagnostics n = row_count;
  return n;
end
$function$;

comment on function public.wa_resolve_lid(uuid, text, text) is
  'Re-key a rep''s messages stored under a WhatsApp LID to the real phone number, and attach them to a lead if one matches. Called by whatsapp-observe when the worker learns the mapping.';
