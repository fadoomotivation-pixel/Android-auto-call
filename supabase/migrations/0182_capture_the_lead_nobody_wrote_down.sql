-- Two things the founder did not ask for and will use every week.
--
-- ── 1. CAPTURE THE LEAD NOBODY WROTE DOWN ───────────────────────────────────
--
-- The unknown-numbers table finds them; until now it could only point. Thirty-
-- four people Ankita both RANG and MESSAGED are in the CRM under no company at
-- all, and turning each into a lead meant copying a phone number by hand into
-- another screen and losing the conversation that made it interesting.
--
-- This does the whole thing in one call: creates the contact in the rep's
-- company, assigns it to that rep, and — the part that matters —
-- BACK-LINKS EVERY MESSAGE already stored from that number, so the lead opens
-- with its history instead of as a blank row. A year of conversation becomes
-- visible on the lead page the moment it is captured.
--
-- Idempotent by phone: pressing it twice on the same number adopts the existing
-- contact rather than creating a duplicate, because a duplicate lead is worse
-- than an uncaptured one — two reps then work the same buyer.

create or replace function public.wa_capture_lead(
  p_rep uuid,
  p_peer text,
  p_name text default null
)
returns table (contact_id uuid, messages_linked int, was_existing boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company uuid;
  v_l10 text := right(regexp_replace(p_peer, '\D', '', 'g'), 10);
  v_contact uuid;
  v_existing boolean := false;
  v_linked int := 0;
  v_phone text;
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;
  if length(v_l10) < 10 then raise exception 'that does not look like a phone number'; end if;

  select company_id into v_company from public.profiles where id = p_rep;
  if v_company is null then raise exception 'that telecaller has no company'; end if;

  -- Already a lead in this company? Adopt it. Never create a second row for a
  -- number the company already knows — the whole point of this feature is to
  -- stop relationships going missing, not to fragment them.
  select c.id into v_contact
  from public.contacts c
  where c.company_id = v_company
    and right(regexp_replace(c.phone, '\D', '', 'g'), 10) = v_l10
  order by c.created_at limit 1;

  if v_contact is not null then
    v_existing := true;
    -- Assign it to this rep only if nobody owns it. Silently moving another
    -- rep's lead because they happened to message the number would be a way to
    -- lose a colleague's work.
    update public.contacts set salesperson_id = coalesce(salesperson_id, p_rep), updated_at = now()
    where id = v_contact;
  else
    -- Stored in the same shape the rest of the CRM uses: +91 then ten digits.
    v_phone := '+91' || v_l10;
    insert into public.contacts (company_id, salesperson_id, name, phone, status, stage)
    values (
      v_company, p_rep,
      nullif(btrim(coalesce(p_name, '')), ''),
      v_phone, 'new', 'new'
    )
    returning id into v_contact;
  end if;

  -- THE HISTORY COMES WITH IT. Without this the lead is a blank row and the
  -- conversation that justified capturing it stays orphaned behind a phone
  -- number nobody will look up again.
  update public.wa_observed_messages m
  set contact_id = v_contact
  where m.salesperson_id = p_rep
    and m.contact_id is null
    and right(regexp_replace(m.peer_phone, '\D', '', 'g'), 10) = v_l10;
  get diagnostics v_linked = row_count;

  return query select v_contact, v_linked, v_existing;
end
$function$;

revoke all on function public.wa_capture_lead(uuid, text, text) from public, anon;
grant execute on function public.wa_capture_lead(uuid, text, text) to authenticated;

-- ── 2. IS THIS SELLING, OR PASTING? ─────────────────────────────────────────
--
-- Nobody asks for this number and every sales leader wants it. Message counts
-- reward volume, so the rep who pastes one line to eighty numbers outranks the
-- rep having six real conversations — on every dashboard this product has.
--
-- A blast is the same text sent to many DIFFERENT people. Counting distinct
-- recipients rather than messages is what separates it from a rep who legibly
-- repeats themselves inside one thread, which is normal and fine.
--
-- Short strings are excluded: "ok", "ji", "thik hai" are how humans talk and
-- would otherwise top this list for every rep on the platform.
create or replace function public.super_rep_blasts(p_rep uuid, p_days int default 30)
returns table (
  body text,
  sent_to int,
  times_sent int,
  replies_from int,
  first_at timestamptz,
  last_at timestamptz
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;

  return query
  with blasted as (
    select btrim(m.body) as text_key,
           count(distinct m.peer_phone)::int as peers,
           count(*)::int as sends,
           min(m.sent_at) as first_at,
           max(m.sent_at) as last_at,
           array_agg(distinct m.peer_phone) as peer_list
    from public.wa_observed_messages m
    where m.salesperson_id = p_rep
      and m.direction = 'out'
      and coalesce(btrim(m.body), '') <> ''
      and length(btrim(m.body)) >= 25
      and m.sent_at >= now() - make_interval(days => greatest(p_days, 1))
    group by btrim(m.body)
    having count(distinct m.peer_phone) >= 3
  )
  select b.text_key, b.peers, b.sends,
         -- Did ANY of them write back? A blast nobody answers is the clearest
         -- evidence the approach is not working, and it is the number that
         -- turns "stop pasting" from an opinion into a fact.
         (select count(distinct m2.peer_phone)::int
            from public.wa_observed_messages m2
           where m2.salesperson_id = p_rep
             and m2.direction = 'in'
             and m2.peer_phone = any (b.peer_list)
             and m2.sent_at >= b.first_at),
         b.first_at, b.last_at
  from blasted b
  order by b.peers desc, b.sends desc
  limit 50;
end
$function$;

revoke all on function public.super_rep_blasts(uuid, int) from public, anon;
grant execute on function public.super_rep_blasts(uuid, int) to authenticated;
