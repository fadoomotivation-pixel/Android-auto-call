-- A buyer who just wrote outranks a diary entry.
--
-- WHAT THE CAPTURE FOUND, NOW THAT IT WORKS
--
-- Ankita talks to 216 people on WhatsApp. 46 of them sent the last message and
-- have had no answer; 43 of those have been waiting more than a day. She is not
-- ignoring them — she has two hundred chats and the ones that matter are buried
-- under group traffic that posts forty times a morning.
--
-- All of that has been visible only to the super admin. The rep whose WhatsApp
-- it is gets nothing from it, which is both unfair and unwise: a rep who gains
-- nothing from being watched will resent it, and one whose day gets easier will
-- protect it.
--
-- HOW IT REACHES HER WITHOUT A NEW SCREEN
--
-- The Follow-up tab is three groups and ONE clock, and that is load-bearing —
-- a fourth group is how it became unreadable the first time. So this adds no
-- group, no tab and no reminder engine. An unanswered buyer simply makes the
-- lead call_now, in the bucket the rep already works from.
--
-- WHY A COLUMN AND NOT A JOIN
--
-- v_lead_action_state is read by every rep's app on every poll. Aggregating
-- the message table into it would put a growing GROUP BY on the hot path. Two
-- stamped columns on contacts, maintained by a trigger, keep it a single
-- indexed comparison.
--
-- last_inbound_at already existed and had never once been written to — 0 rows
-- out of 542. This is the thing it was added for.
--
-- Thirty minutes of grace, so a lead does not flicker into Call now while the
-- rep is in the middle of typing a reply.
--
-- APPLIED TO PRODUCTION BY HAND on 2026-09-20.

alter table public.contacts
  add column if not exists last_reply_at timestamptz;

comment on column public.contacts.last_inbound_at is
  'When this buyer last wrote on WhatsApp. Maintained by trg_wa_touch_contact.';
comment on column public.contacts.last_reply_at is
  'When the rep last wrote back on WhatsApp. A CALL also counts as answering — that is last_contacted_at.';

create or replace function public.wa_touch_contact()
returns trigger
language plpgsql security definer set search_path to 'public'
as $function$
begin
  -- A group is not a buyer waiting for you.
  if new.contact_id is null or coalesce(new.is_group, false) then return new; end if;

  if new.direction = 'in' then
    update public.contacts
       set last_inbound_at = greatest(coalesce(last_inbound_at, new.sent_at), new.sent_at)
     where id = new.contact_id
       and (last_inbound_at is null or last_inbound_at < new.sent_at);
  else
    update public.contacts
       set last_reply_at = greatest(coalesce(last_reply_at, new.sent_at), new.sent_at)
     where id = new.contact_id
       and (last_reply_at is null or last_reply_at < new.sent_at);
  end if;
  return new;
end
$function$;

drop trigger if exists trg_wa_touch_contact on public.wa_observed_messages;
create trigger trg_wa_touch_contact
  -- Also on UPDATE OF contact_id: wa_capture_lead back-links a whole history
  -- onto a newly captured lead, and those rows were inserted before the lead
  -- existed. Without this they would never stamp anything.
  after insert or update of contact_id on public.wa_observed_messages
  for each row execute function public.wa_touch_contact();

update public.contacts c
   set last_inbound_at = x.in_at, last_reply_at = x.out_at
  from (
    select contact_id,
           max(sent_at) filter (where direction = 'in')  as in_at,
           max(sent_at) filter (where direction = 'out') as out_at
    from public.wa_observed_messages
    where contact_id is not null and archived_at is null and not coalesce(is_group, false)
    group by contact_id
  ) x
 where c.id = x.contact_id
   and (c.last_inbound_at is distinct from x.in_at or c.last_reply_at is distinct from x.out_at);

create index if not exists contacts_awaiting_reply_idx
  on public.contacts (salesperson_id, last_inbound_at)
  where last_inbound_at is not null;
