-- A follow-up message that knows what it said last time, and whether it worked.
--
-- WHAT WAS ALREADY HERE, AND WHY IT WAS NOT ENOUGH
--
-- The lead screen has had a "💬 Message" drafter for a while. It takes a
-- purpose the rep picks from a list, pastes it into a hand-written sentence
-- ("a gentle follow-up after your last conversation"), and asks the model.
--
-- It has never read the recording. It has never read the WhatsApp thread. It
-- has never known what the rep promised, what the buyer objected to, how the
-- rep herself writes, what was sent to this person last week, or whether any
-- message it ever produced got a single reply.
--
-- So it writes the same polite nothing to a man who is waiting for a floor
-- plan and to a woman who said the rate is too high. And on day four it writes
-- it again.
--
-- WHAT THIS ADDS
--
--   1. EVIDENCE      every draft is built from lead_memory (what was said on
--                    the call AND on WhatsApp), lead_promises (what she owes
--                    them), and her own last messages so it sounds like her.
--   2. PROOF OF SEND the app does not get to claim a message went. The Baileys
--                    observer already watches her own number — a draft becomes
--                    'sent' only when an outbound message to that lead is
--                    actually observed afterwards. What she edited it to is
--                    stored too.
--   3. THE LOOP      a reply within seven days is the success signal — seven
--                    and not two, because a property buyer answers on Sunday.
--                    Reply rate
--                    per ANGLE, per company, is then fed back into the next
--                    draft. The brain gets better because buyers answered,
--                    not because anyone said it was clever.
--   4. THE BRAKE     the founder's actual words: "4 din ek jaisa message gya
--                    to brain apne aap update ho". That is not left to the
--                    prompt to remember. followup_plan() BANS an angle that
--                    was tried twice on this lead with no reply, and when four
--                    messages in a fortnight have produced nothing it refuses
--                    to draft at all and says: stop typing, ring them.
--
-- WHY ANGLES AND NOT FREE TEXT
--
-- The same reason objection_code is a fixed set: a thing you cannot count is a
-- thing you cannot learn from. Seven angles, each one a different reason to be
-- in someone's phone.
--
-- HONESTY GUARD: an angle needs five sends before its reply rate is allowed to
-- influence anything. One lucky message is not evidence, and a brain that
-- learns from n=1 is a brain that repeats a coincidence forever.
--
-- APPLIED TO PRODUCTION BY HAND on 2026-09-20.

create table if not exists public.followup_drafts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  salesperson_id uuid references public.profiles(id) on delete set null,
  angle text not null check (angle in (
    'deliver_promise', 'answer_objection', 'visit_invite',
    'new_information', 'reply_to_them', 're_engage', 'soft_check_in'
  )),
  -- What the AI suggested.
  body text not null,
  -- One line for the rep: why THIS message, not a generic one. She is allowed
  -- to disagree with it, and she can only disagree if she can see it.
  reason text,
  -- What it read to get here, so a bad draft can be traced rather than argued
  -- about: {promise_id, used_memory, style_samples, last_angles}.
  based_on jsonb not null default '{}'::jsonb,
  status text not null default 'suggested' check (status in (
    'suggested', 'opened', 'sent', 'skipped', 'stale'
  )),
  created_at timestamptz not null default now(),
  -- She pressed "Send on WhatsApp" and the chat opened with this text in it.
  opened_at timestamptz,
  -- The observer SAW a message go. This is the only thing that counts as sent.
  sent_at timestamptz,
  -- What actually went, which may not be what we wrote. Her edits are the
  -- best training signal in this whole table — she is the one who knows.
  sent_body text,
  replied_at timestamptz,
  reply_minutes integer,
  settled_at timestamptz
);

comment on table public.followup_drafts is
  'Every follow-up message this product suggested, whether it was really sent (proved by the WhatsApp observer, not claimed by the app), and whether the buyer replied. The reply is what the drafter learns from.';

create index if not exists followup_drafts_contact_idx on public.followup_drafts (contact_id, created_at desc);
create index if not exists followup_drafts_company_idx on public.followup_drafts (company_id, angle, status);
create index if not exists followup_drafts_rep_idx on public.followup_drafts (salesperson_id, status);
-- One live suggestion per lead. Two half-answered drafts on one buyer is how a
-- rep ends up sending both.
create unique index if not exists followup_drafts_one_live
  on public.followup_drafts (contact_id) where status in ('suggested', 'opened');

alter table public.followup_drafts enable row level security;

drop policy if exists followup_drafts_select on public.followup_drafts;
create policy followup_drafts_select on public.followup_drafts
  for select using (
    is_super_admin()
    or (company_id = current_company_id() and (is_admin() or salesperson_id = auth.uid()))
  );

-- The rep marks her own draft opened or skipped. She can never invent a 'sent'
-- — that word belongs to the observer alone.
drop policy if exists followup_drafts_update on public.followup_drafts;
create policy followup_drafts_update on public.followup_drafts
  for update using (
    salesperson_id = auth.uid() and status in ('suggested', 'opened')
  ) with check (
    salesperson_id = auth.uid() and status in ('suggested', 'opened', 'skipped')
  );

-- ─────────────────────────────────────────────────────────────────────────
-- DID IT GO, AND DID THEY ANSWER?
--
-- Four statements, no model, no self-report. Same shape as settle_promises()
-- and for the same reason: a founder who does not believe a number must be
-- able to read the SQL that produced it.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.settle_followups()
returns integer
language plpgsql security definer set search_path to 'public'
as $function$
declare
  n integer;
  touched integer := 0;
begin
  -- 1. IT REALLY WENT. An outbound WhatsApp to that lead within six hours of
  --    her opening the chat. Six hours and not six minutes because she opens
  --    it, gets called away, and sends at lunch — that is still this draft.
  update public.followup_drafts d
     set status = 'sent',
         sent_at = w.at,
         sent_body = w.body,
         settled_at = now()
    from lateral (
      select m.sent_at as at, m.body
      from public.wa_observed_messages m
      where m.contact_id = d.contact_id and m.direction = 'out'
        and m.archived_at is null
        and m.sent_at >= d.opened_at
        and m.sent_at <= d.opened_at + interval '6 hours'
      order by m.sent_at
      limit 1
    ) w
   where d.status = 'opened' and d.opened_at is not null;
  get diagnostics n = row_count; touched := touched + n;

  -- 2. THEY ANSWERED. The only success this product is allowed to claim for a
  --    message. Seven days, because a property buyer answers on Sunday.
  update public.followup_drafts d
     set replied_at = r.at,
         reply_minutes = greatest(0, (extract(epoch from (r.at - d.sent_at)) / 60))::int,
         settled_at = now()
    from lateral (
      select m.sent_at as at
      from public.wa_observed_messages m
      where m.contact_id = d.contact_id and m.direction = 'in'
        and m.archived_at is null
        and m.sent_at > d.sent_at
        and m.sent_at <= d.sent_at + interval '7 days'
      order by m.sent_at
      limit 1
    ) r
   where d.status = 'sent' and d.sent_at is not null and d.replied_at is null;
  get diagnostics n = row_count; touched := touched + n;

  -- 3. SHE NEVER SENT IT. Opened the chat, thought better of it, typed nothing.
  --    That is a real answer about the draft and it must not sit as 'opened'
  --    forever pretending to still be in flight.
  update public.followup_drafts
     set status = 'skipped', settled_at = now()
   where status = 'opened' and opened_at < now() - interval '1 day';
  get diagnostics n = row_count; touched := touched + n;

  -- 4. A draft about last Tuesday's conversation is wrong by Friday.
  update public.followup_drafts
     set status = 'stale', settled_at = now()
   where status = 'suggested' and created_at < now() - interval '3 days';
  get diagnostics n = row_count; touched := touched + n;

  return touched;
end;
$function$;

comment on function public.settle_followups() is
  'Proves a suggested message was really sent (from the WhatsApp observer), records the buyer reply, and closes out the ones that were never sent.';

revoke all on function public.settle_followups() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- WHICH ANGLE ACTUALLY GETS ANSWERED, IN THIS COMPANY.
--
-- Sixty days. Five sends before an angle is allowed an opinion — see the
-- honesty guard in the header.
-- ─────────────────────────────────────────────────────────────────────────
create or replace view public.v_company_angle_performance as
select d.company_id,
       d.angle,
       count(*) filter (where d.status = 'sent')::int as sent,
       count(*) filter (where d.status = 'sent' and d.replied_at is not null)::int as replied,
       count(*) filter (where d.status = 'skipped')::int as skipped,
       case when count(*) filter (where d.status = 'sent') >= 5
            then round(100.0 * count(*) filter (where d.status = 'sent' and d.replied_at is not null)
                       / nullif(count(*) filter (where d.status = 'sent'), 0))::int
            else null end as reply_rate,
       percentile_cont(0.5) within group (
         order by d.reply_minutes) filter (where d.reply_minutes is not null)::int as median_reply_minutes
from public.followup_drafts d
where d.created_at > now() - interval '60 days'
group by 1, 2;

comment on view public.v_company_angle_performance is
  'Reply rate per follow-up angle per company, over 60 days. reply_rate is NULL until an angle has five real sends — one lucky message is not evidence.';

-- The same thing as a sentence the drafter can be handed. Ordered best first;
-- angles with no verdict yet come last and are marked as such, so the model is
-- never told a guess is a fact.
create or replace function public.followup_angle_hints(p_company uuid)
returns table(angle text, sent integer, reply_rate integer)
language sql stable security definer set search_path to 'public'
as $function$
  select a.angle, a.sent, a.reply_rate
  from public.v_company_angle_performance a
  where a.company_id = p_company and a.sent > 0
  order by a.reply_rate desc nulls last, a.sent desc;
$function$;

revoke all on function public.followup_angle_hints(uuid) from public, anon;
grant execute on function public.followup_angle_hints(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- THE BRAKE. "4 din ek jaisa message gya to brain apne aap update ho."
--
-- Not a line in a prompt hoping the model remembers. A function that removes
-- the option before the model is ever asked.
--
--   • an angle tried TWICE on this lead in three weeks with no reply is BANNED
--     for this lead — whatever its company-wide record
--   • four messages in a fortnight with not one reply and the verdict is
--     'call_instead': no draft is produced at all
--
-- The second one is the important half. Every messaging product ever built
-- answers "no reply" with "send another"; a telecaller's honest instinct is to
-- pick up the phone, and the app should say so out loud instead of handing her
-- a fifth polite sentence to be ignored.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.followup_plan(p_contact uuid)
returns table(verdict text, allowed text[], banned text[], sent_14d integer, replies_14d integer)
language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  all_angles text[] := array[
    'deliver_promise', 'answer_objection', 'visit_invite',
    'new_information', 'reply_to_them', 're_engage', 'soft_check_in'
  ];
  bad text[];
  n_sent integer;
  n_reply integer;
begin
  select coalesce(array_agg(x.angle), '{}')
    into bad
  from (
    select d.angle
    from public.followup_drafts d
    where d.contact_id = p_contact
      and d.status = 'sent'
      and d.sent_at > now() - interval '21 days'
    group by d.angle
    having count(*) >= 2 and count(*) filter (where d.replied_at is not null) = 0
  ) x;

  select count(*) filter (where d.status = 'sent' and d.sent_at > now() - interval '14 days'),
         count(*) filter (where d.status = 'sent' and d.sent_at > now() - interval '14 days'
                            and d.replied_at is not null)
    into n_sent, n_reply
  from public.followup_drafts d
  where d.contact_id = p_contact;

  return query select
    case when n_sent >= 4 and n_reply = 0 then 'call_instead' else 'draft' end,
    -- 'reply_to_them' is never banned: if the buyer has just written, answering
    -- them is not a follow-up tactic, it is basic manners.
    (select coalesce(array_agg(a), '{}')
       from unnest(all_angles) a
      where a = 'reply_to_them' or not (a = any (bad))),
    bad,
    coalesce(n_sent, 0),
    coalesce(n_reply, 0);
end;
$function$;

comment on function public.followup_plan(uuid) is
  'What this lead may be sent next: angles already tried twice without a reply are removed, and after four unanswered messages in a fortnight the verdict is call_instead and nothing is drafted.';

revoke all on function public.followup_plan(uuid) from public, anon;
grant execute on function public.followup_plan(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Pure SQL, four times an hour. No model, no HTTP, no edge function.
--
-- It has to be quick in one direction above all: the moment she actually
-- sends the message, the draft must stop being "waiting" — and the clock on
-- the buyer's reply has to start from the real send time, not from whenever
-- someone got round to checking.
-- ─────────────────────────────────────────────────────────────────────────

select cron.unschedule('followup-settle-15m')
 where exists (select 1 from cron.job where jobname = 'followup-settle-15m');

select cron.schedule('followup-settle-15m', '*/15 * * * *', $$
  select public.settle_followups();
$$);
