-- A telecaller's whole WhatsApp, in one read.
--
-- Ankita lost WhatsApp off her own phone while we were asking her to re-scan a
-- QR over and over, chasing a bug that re-scanning could never fix. This
-- database turned out to hold the only copy of a year of her conversations
-- that still existed anywhere.
--
-- Every other function on the supervision screens filters down to the
-- company's leads, which is right for supervision and wrong here: this is her
-- own record of her own work, so it returns every conversation on the watched
-- number, lead or not. Grouped by peer and oldest-first inside each — the
-- order a person reads their own history in, not the order a dashboard queries
-- it.
--
-- Gated by is_super_admin() like everything else that crosses company lines.
--
-- Applied by hand to production before this file existed.

create or replace function public.super_rep_full_archive(p_rep uuid)
returns table(
  peer_phone text, peer_name text, lead_name text, direction text, body text,
  media_kind text, file_name text, media_path text,
  deleted_at timestamp with time zone, sent_at timestamp with time zone
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;

  return query
  select m.peer_phone,
         max(m.peer_name) over (partition by m.peer_phone),
         c.name,
         m.direction, m.body, m.media_kind, m.file_name, m.media_path,
         m.deleted_at, m.sent_at
  from public.wa_observed_messages m
  left join public.contacts c on c.id = m.contact_id
  where m.salesperson_id = p_rep
  order by m.peer_phone, m.sent_at;
end
$function$;
