-- Two thirds of a telecaller's relationships are not in the CRM.
--
-- Ankita talks to 216 people on WhatsApp. 70 of them are leads. The other 146
-- exist only on her handset — and if she leaves tomorrow, they leave with her.
--
-- WHY THE SHORTLIST IS 41 AND NOT 146
--
-- Most of those 146 are family, colleagues, the chemist. Handing a rep a list
-- of 146 strangers to sort is how a feature gets ignored on day one. So the
-- list is ranked by the only evidence that says "this is work":
--
--   104  uncaptured people (groups and hidden numbers already excluded)
--    82  …she also PHONED
--    41  …and who WROTE BACK          <- the list
--    26  …called twice and two-way    <- near certain
--
-- Somebody she rang, who replied, is a working relationship. That is a
-- judgement the data can make honestly; "is this a buyer" is one only she can,
-- which is why nothing here captures anything automatically.
--
-- WHAT THE REP GETS OUT OF IT
--
-- This has to be worth her time or it will not happen. Capturing a number
-- gives her the callback clock, the reminders, the coach and the history on
-- one page — and makes work that currently counts for nothing show up as hers.
-- 146 relationships producing zero in her numbers is not a reporting quirk; it
-- makes her look idle when she is the busiest rep on the platform.
--
-- SUPERSEDED IN THE SAME BREATH BY 0208 — the first ranking put two colleagues
-- at the top. Kept as its own file because the shortlist rule and the ranking
-- are different decisions and the second one had to be learned.
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
    -- A group is not a person, and a hidden number cannot be dialled or
    -- matched. Neither belongs on a list whose whole purpose is "make this a
    -- lead you can ring".
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
       (least(p.from_them, 20) * 3
        + least(coalesce(d.calls, 0), 20) * 2
        + case when p.last_at > now() - interval '7 days' then 10 else 0 end
       )::int as score
from peers p
left join dial d on d.salesperson_id = p.salesperson_id and d.l10 = p.l10
left join public.wa_peer_names n on n.salesperson_id = p.salesperson_id and n.peer_phone = p.peer_phone
-- THE LINE THAT MAKES THIS A SHORTLIST. She rang them and they wrote back.
where coalesce(d.calls, 0) > 0 and p.from_them > 0;
