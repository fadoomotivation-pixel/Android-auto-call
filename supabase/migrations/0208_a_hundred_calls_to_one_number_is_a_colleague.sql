-- The first version of this ranking put two colleagues at the top.
--
-- "Ravi Maurya" — 120 calls. "Ankita Mam" — 107. Both scored highest because
-- calls counted linearly, and both are obviously teammates: Ravi posts in
-- FANBE SALES STAFF GROUP every morning.
--
-- A BUYER IS NOT SOMEONE YOU RING A HUNDRED TIMES. A real-estate buyer gets
-- two calls, or eight, or fifteen if they are close to booking. Past about
-- twenty, the call count has stopped being evidence of a sale and started
-- being evidence of a colleague. So calls help up to a point and then stop —
-- and past forty they count against, because nothing else looks like that.
--
-- AND THE REP ALREADY LABELS HER OWN LEADS
--
-- What the shortlist surfaced, in her own address book:
--
--   "Sanju Kumawat, Asso. 26-06"
--   "Satinder Kumar, Balaji, 17-07"
--   "Ghanshyam, Balaji, 16-07"
--
-- Name, project, date. That is a filing system, and she built it herself
-- because the CRM was not holding these people. A saved name carrying a date
-- is about as strong a "this is a lead" signal as this data has, and it costs
-- one regex to read.
--
-- After: the top three are all leads by her own naming, and both colleagues
-- have dropped off the front of the list.
--
-- name_looks_like_a_lead is APPENDED after score: create or replace cannot
-- insert a view column in the middle.
--
-- APPLIED TO PRODUCTION BY HAND on 2026-09-20.

create or replace view public.v_wa_uncaptured_leads as
with dial as (
  select cl.salesperson_id,
         right(regexp_replace(cl.phone, '\D', '', 'g'), 10) as l10,
         count(*)::int as calls,
         max(cl.started_at) as last_call_at
  from public.call_logs cl
  where cl.phone is not null
  group by 1, 2
),
peers as (
  select m.salesperson_id, m.company_id, m.peer_phone,
         right(regexp_replace(m.peer_phone, '\D', '', 'g'), 10) as l10,
         count(*)::int as messages,
         count(*) filter (where m.direction = 'in')::int as from_them,
         count(*) filter (where m.direction = 'out')::int as from_rep,
         min(m.sent_at) as first_at,
         max(m.sent_at) as last_at
  from public.wa_observed_messages m
  where m.archived_at is null
    and m.contact_id is null
    and not coalesce(m.is_group, false)
    and not coalesce(m.peer_is_lid, false)
    and m.peer_phone is not null
  group by 1, 2, 3, 4
)
select p.salesperson_id, p.company_id, p.peer_phone, p.l10,
       n.name as wa_name,
       p.messages, p.from_them, p.from_rep,
       coalesce(d.calls, 0) as calls,
       d.last_call_at,
       p.first_at, p.last_at,
       (
         least(p.from_them, 20) * 3
         + case
             when coalesce(d.calls, 0) = 0 then 0
             when d.calls <= 20 then d.calls * 2
             when d.calls <= 40 then 40
             else 40 - least((d.calls - 40) / 2, 60)
           end
         + case when p.last_at > now() - interval '7 days' then 10 else 0 end
         + case when n.name ~ '\d{1,2}[-/]\d{1,2}' then 25 else 0 end
       )::int as score,
       (n.name ~ '\d{1,2}[-/]\d{1,2}') as name_looks_like_a_lead
from peers p
left join dial d on d.salesperson_id = p.salesperson_id and d.l10 = p.l10
left join public.wa_peer_names n on n.salesperson_id = p.salesperson_id and n.peer_phone = p.peer_phone
where coalesce(d.calls, 0) > 0 and p.from_them > 0;

comment on view public.v_wa_uncaptured_leads is
  'People a rep both phoned and exchanged WhatsApp messages with, who are not in the CRM. Ranked so buyers come first: two-way conversation counts most, calls help only up to about twenty and count AGAINST past forty (that is a colleague, not a buyer), and a saved name carrying a date is the rep''s own way of filing a lead.';

-- ── The rep presses the button ─────────────────────────────────────────────
--
-- wa_capture_lead is gated on is_super_admin(), which is right for the
-- founder's screen and useless for the person who actually knows whether a
-- number is a buyer. She is the only one who can answer that, and she is the
-- one this list is for.
--
-- Same work, authorisation turned around. A rep may capture a number SHE has
-- messaged, into HER company, assigned to HERSELF. She cannot name a rep, a
-- company, or a number she has never spoken to — each checked here rather than
-- trusted from the caller, because the caller is a phone.

create or replace function public.wa_rep_capture_lead(p_peer text, p_name text default null)
returns table(contact_id uuid, messages_linked integer, was_existing boolean)
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_rep uuid := auth.uid();
  v_company uuid;
  v_l10 text := right(regexp_replace(p_peer, '\D', '', 'g'), 10);
  v_contact uuid;
  v_existing boolean := false;
  v_linked int := 0;
begin
  if v_rep is null then raise exception 'not signed in'; end if;
  if length(v_l10) < 10 then raise exception 'that does not look like a phone number'; end if;

  select company_id into v_company from public.profiles where id = v_rep;
  if v_company is null then raise exception 'you are not set up in a company'; end if;

  -- HER OWN CONVERSATIONS ONLY. Without this the endpoint would let any
  -- signed-in rep mint a lead from any number at all, which is a way to take
  -- another rep's buyer rather than a way to write down your own.
  if not exists (
    select 1 from public.wa_observed_messages m
    where m.salesperson_id = v_rep
      and m.archived_at is null
      and not coalesce(m.is_group, false)
      and right(regexp_replace(m.peer_phone, '\D', '', 'g'), 10) = v_l10
  ) then
    raise exception 'you have no WhatsApp conversation with that number';
  end if;

  select c.id into v_contact
  from public.contacts c
  where c.company_id = v_company
    and right(regexp_replace(c.phone, '\D', '', 'g'), 10) = v_l10
  order by c.created_at limit 1;

  if v_contact is not null then
    v_existing := true;
    -- Adopt an unowned lead; never take one that belongs to a colleague.
    update public.contacts set salesperson_id = coalesce(salesperson_id, v_rep), updated_at = now()
    where id = v_contact;
  else
    insert into public.contacts (company_id, salesperson_id, name, phone, status, stage, assigned_at)
    values (v_company, v_rep, nullif(btrim(coalesce(p_name, '')), ''),
            '+91' || v_l10, 'new', 'new', now())
    returning id into v_contact;
  end if;

  -- The history comes with it, which is the whole point: the lead opens on the
  -- conversation that made it worth capturing rather than as a blank row.
  update public.wa_observed_messages m
  set contact_id = v_contact
  where m.salesperson_id = v_rep
    and m.contact_id is null
    and right(regexp_replace(m.peer_phone, '\D', '', 'g'), 10) = v_l10;
  get diagnostics v_linked = row_count;

  return query select v_contact, v_linked, v_existing;
end
$function$;

comment on function public.wa_rep_capture_lead(text, text) is
  'A telecaller turns a number she is already talking to into her own lead, with its WhatsApp history attached. Her own conversations only, her own company, assigned to herself — none of which the caller may choose.';

create or replace function public.wa_my_uncaptured()
returns table(
  peer_phone text, wa_name text, messages integer, from_them integer,
  calls integer, last_at timestamptz, score integer
)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  return query
  select u.peer_phone, u.wa_name, u.messages, u.from_them, u.calls, u.last_at, u.score
  from public.v_wa_uncaptured_leads u
  where u.salesperson_id = auth.uid()
  order by u.score desc, u.last_at desc
  limit 100;
end
$function$;

comment on function public.wa_my_uncaptured() is
  'The signed-in rep''s own shortlist of people to write down. Never another rep''s.';
