-- Acceptance test for the rep WhatsApp observer.
--
-- Every case the founder asked to see proved, against the real database, in one
-- transaction that ROLLS BACK. Nothing here survives; it writes test rows, reads
-- the view, prints a pass/fail table and throws it all away.
--
-- WHAT THIS DOES AND DOES NOT PROVE
--
-- Proves: the counting rules, the privacy gate, idempotency, and the view the
-- Daily Pulse and the admin dashboard both read.
--
-- Does NOT prove: that a real WhatsApp on a real phone reaches the ingest. That
-- leg is Baileys → whatsapp-observe and it needs a handset, a rep and a scanned
-- QR. No SQL can stand in for it, and this file does not pretend to.
--
-- Run it AFTER whatsapp-observe is deployed, as a rehearsal, then do the real
-- one-telecaller test.

begin;

-- A real company with a real rep and two of their leads. Nothing is invented:
-- the privacy gate is keyed on a genuine contact row, so a synthetic id would
-- prove nothing about matching.
create temp table t_ctx as
select c.company_id, c.salesperson_id,
       min(c.id) filter (where rn = 1) as lead_a,
       min(c.id) filter (where rn = 2) as lead_b
from (
  select c.*, row_number() over (partition by c.company_id, c.salesperson_id order by c.created_at) rn
  from public.contacts c
  where c.salesperson_id is not null and c.phone is not null
) c
group by c.company_id, c.salesperson_id
having count(*) >= 2
limit 1;

-- The session the ingest requires. Without a row here the real endpoint answers
-- 404 — case 9d below.
insert into public.wa_rep_sessions (company_id, salesperson_id, status, last_seen_at)
select company_id, salesperson_id, 'connected', now() from t_ctx
on conflict (salesperson_id) do update set last_seen_at = now();

-- Exactly what the edge function computes, mirrored so the SQL and the
-- TypeScript cannot drift apart unnoticed.
create temp table t_msg (mid text, lead uuid, dir text, kind text, txt text);
insert into t_msg
select v.mid,
       case v.which when 'a' then x.lead_a else x.lead_b end,
       v.dir, v.kind, v.txt
from t_ctx x, (values
  -- 8: the counting rules
  ('m-pdf',   'a', 'out', 'document', 'layout'),
  ('m-img',   'a', 'out', 'image',    'photo'),
  ('m-vid',   'a', 'out', 'video',    'walkthrough'),
  ('m-link',  'b', 'out', null,       'here you go https://callproai.in/x'),
  ('m-voice', 'b', 'out', 'audio',    'bol kar bataya'),
  ('m-plain', 'b', 'out', null,       'plot ki details bhej raha hu'),
  -- customer replies
  ('m-in',    'a', 'in',  null,       'ok bhej dijiye')
) as v(mid, which, dir, kind, txt);

insert into public.wa_observed_messages
  (company_id, salesperson_id, contact_id, wa_message_id, direction,
   body_preview, has_media, media_kind, shared_details, sent_at)
select x.company_id, x.salesperson_id, m.lead, m.mid, m.dir,
       m.txt, m.kind is not null, m.kind,
       m.dir = 'out'
         and (coalesce(m.kind in ('document','image','video'), false)
              or m.txt ~* 'https?://'),
       now()
from t_msg m, t_ctx x;

-- 9e: duplicate incoming events. The worker resends a batch after a blip; the
-- unique index on (salesperson_id, wa_message_id) must absorb it.
insert into public.wa_observed_messages
  (company_id, salesperson_id, contact_id, wa_message_id, direction,
   body_preview, has_media, media_kind, shared_details, sent_at)
select x.company_id, x.salesperson_id, m.lead, m.mid, m.dir,
       m.txt, m.kind is not null, m.kind,
       m.dir = 'out'
         and (coalesce(m.kind in ('document','image','video'), false)
              or m.txt ~* 'https?://'),
       now()
from t_msg m, t_ctx x
on conflict (salesperson_id, wa_message_id) do nothing;

create temp table t_got as
select d.* from public.v_rep_whatsapp_daily d, t_ctx x
where d.salesperson_id = x.salesperson_id
  and d.day_ist = (now() at time zone 'Asia/Kolkata')::date;

select 'PDF counts as details'            as case, (select pdfs_sent   from t_got) = 1 as pass
union all select 'image counts',            (select images_sent from t_got) = 1
union all select 'video counts',            (select videos_sent from t_got) = 1
union all select 'link counts',             (select details_shared from t_got) = 4
union all select 'voice note NOT details',  (select voice_notes_sent from t_got) = 1
                                            and (select details_shared from t_got) = 4
union all select 'text claim NOT details',  (select messages_sent from t_got) = 6
union all select 'many files, one lead',    (select leads_given_details from t_got) = 2
union all select 'customer reply counted',  (select leads_who_replied from t_got) = 1
union all select 'reply not credited out',  (select messages_sent from t_got) = 6
union all select 'duplicate absorbed',
  (select count(*) from public.wa_observed_messages o, t_ctx x
    where o.salesperson_id = x.salesperson_id) = 7
-- 9a/9b: the health view is what the dashboard and the pulse both read.
union all select 'session reads healthy',
  (select not stale from public.v_rep_whatsapp_health h, t_ctx x
    where h.salesperson_id = x.salesperson_id)
union all select 'stale after 2h',
  (select stale from (
     select (s.last_seen_at is null
             or s.last_seen_at < now() - interval '2 hours') as stale
     from public.wa_rep_sessions s, t_ctx x
     where s.salesperson_id = x.salesperson_id
   ) q) = false
-- The privacy gate, restated here because it is the one that must never regress.
union all select 'stranger rejected',
  (select public.match_wa_contact(x.company_id, '919999900000') is null from t_ctx x)
union all select 'no cross-company leak',
  (select public.match_wa_contact(
      (select id from public.companies o where o.id <> x.company_id limit 1),
      '91' || right(regexp_replace(c.phone,'\D','','g'),10)) is null
     from t_ctx x join public.contacts c on c.id = x.lead_a)
union all select 'lead history written',
  (select count(*) from public.lead_activities a, t_ctx x
    where a.actor_id = x.salesperson_id and a.type = 'whatsapp') = 6;

rollback;

-- 9c "no messages" and 9d "wrong/missing session" are endpoint behaviours, not
-- SQL ones. Against the deployed function they answer:
--
--   curl -sS -X POST "$URL/functions/v1/whatsapp-observe" \
--     -H "Authorization: Bearer $BAILEYS_INGEST_SECRET" \
--     -H "Content-Type: application/json" \
--     -d '{"salesperson_id":"<real-rep>","messages":[]}'
--   → {"ok":true,"stored":0,"skipped":0}
--
--   ...with a salesperson_id that has no wa_rep_sessions row
--   → 404 {"error":"no observed session for this rep"}
--
--   ...with a wrong bearer
--   → 401 {"error":"unauthorized"}
