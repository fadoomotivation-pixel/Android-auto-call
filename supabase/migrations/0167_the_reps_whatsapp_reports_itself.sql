-- A telecaller's WhatsApp, observed — never driven.
--
-- The founder's call: run Baileys on the reps' own numbers, read only, "bus
-- data le rahe h". This encodes that decision so it cannot quietly drift into
-- the thing that gets numbers banned.
--
-- WHY OBSERVE-ONLY IS THE WHOLE DESIGN
--
-- Baileys is an unofficial WhatsApp client and accounts do get banned for it.
-- What gets banned fastest is a SENDING pattern: identical messages, bursts, a
-- number that talks to strangers all day. A linked device that watches the
-- conversations a human is already having by hand looks, to WhatsApp, like a
-- second phone — which is what it is. That is a materially smaller risk than
-- automated sending, and it is the only version of this the schema allows: no
-- table here holds an outbound queue, and nothing here can be sent from.
--
-- The rep keeps sending by hand from their own WhatsApp, exactly as today. This
-- only writes down what happened, so the admin's Daily Pulse stops pretending
-- that WhatsApp work does not exist.
--
-- WHY A NEW TABLE INSTEAD OF EXTENDING whatsapp_baileys
--
-- whatsapp_baileys is PRIMARY KEY (company_id) — one row per company — and
-- every reader fetches it with .eq('company_id', x).maybeSingle():
-- notify-provider, _shared/wa-provider.ts and the admin ProviderPicker. Adding
-- a second row for the same company makes maybeSingle() error, which would stop
-- the founder's daily pulse and break the WhatsApp settings page. A company's
-- notification sender and a rep's read-only watcher are different things with
-- different rules; they get different tables. whatsapp_baileys is untouched.
--
-- WHAT IS DELIBERATELY NOT STORED
--
-- A rep's WhatsApp carries their life: family, friends, salary talk. The rule
-- here is absolute and enforced in match_wa_contact() below — a message is only
-- ever recorded when the other party's number matches a LEAD IN THAT REP'S OWN
-- COMPANY. Everything else is dropped at the door and never reaches a row. The
-- body is a 300-character preview, not the message, for the same reason.

-- ── 1. one read-only watcher per rep ─────────────────────────────────────────

create table if not exists public.wa_rep_sessions (
  company_id     uuid not null references public.companies(id) on delete cascade,
  salesperson_id uuid not null references public.profiles(id) on delete cascade,
  -- Where that rep's worker process lives. One process per rep, one session
  -- directory per process: a ban on one number cannot take the floor down.
  base_url       text,
  -- Vault id for the worker's bearer, never the bearer itself.
  secret_id      uuid,
  status         text not null default 'disconnected',
  wa_number      text,
  last_seen_at   timestamptz,
  last_error     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (salesperson_id)
);

create index if not exists idx_wa_rep_sessions_company
  on public.wa_rep_sessions(company_id);

comment on table public.wa_rep_sessions is
  'Read-only Baileys watchers on telecallers own numbers. This table has no '
  'send path anywhere in the codebase and must never grow one — the company '
  'notification sender is whatsapp_baileys, which is a different thing.';

alter table public.wa_rep_sessions enable row level security;

-- A rep may see their own connection state (so the app can tell them to
-- rescan); an admin sees their company's; the super admin sees all.
drop policy if exists wa_rep_sessions_select on public.wa_rep_sessions;
create policy wa_rep_sessions_select on public.wa_rep_sessions
  for select using (
    public.is_super_admin()
    or (company_id = public.current_company_id()
        and (public.is_admin() or salesperson_id = auth.uid()))
  );

-- Only an admin sets one up.
drop policy if exists wa_rep_sessions_write on public.wa_rep_sessions;
create policy wa_rep_sessions_write on public.wa_rep_sessions
  for all using (
    public.is_super_admin()
    or (company_id = public.current_company_id() and public.is_admin())
  ) with check (
    public.is_super_admin()
    or (company_id = public.current_company_id() and public.is_admin())
  );

-- ── 2. what was observed ─────────────────────────────────────────────────────

create table if not exists public.wa_observed_messages (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  salesperson_id uuid not null references public.profiles(id) on delete cascade,
  -- Always set: a row that matched no lead is never written at all.
  contact_id     uuid not null references public.contacts(id) on delete cascade,
  -- WhatsApp's own id, so replaying a batch cannot double-count a rep's day.
  wa_message_id  text not null,
  direction      text not null check (direction in ('out', 'in')),
  -- A preview, never the message. Enough for an admin to see that details went
  -- out; not enough to read a rep's conversations over their shoulder.
  body_preview   text,
  has_media      boolean not null default false,
  -- Did this message carry the project details a buyer asked for? Set by the
  -- ingest function from a link or an attachment, not guessed here.
  shared_details boolean not null default false,
  sent_at        timestamptz not null,
  created_at     timestamptz not null default now()
);

create unique index if not exists uq_wa_observed_msg
  on public.wa_observed_messages(salesperson_id, wa_message_id);
create index if not exists idx_wa_observed_contact
  on public.wa_observed_messages(contact_id, sent_at desc);
create index if not exists idx_wa_observed_rep_day
  on public.wa_observed_messages(company_id, salesperson_id, sent_at desc);

alter table public.wa_observed_messages enable row level security;

-- Same shape as lead_activities: super admin sees all, an admin sees their
-- company, a rep sees their own. A rep must never read another rep's WhatsApp.
drop policy if exists wa_observed_select on public.wa_observed_messages;
create policy wa_observed_select on public.wa_observed_messages
  for select using (
    public.is_super_admin()
    or (company_id = public.current_company_id()
        and (public.is_admin() or salesperson_id = auth.uid()))
  );

-- Writes come from the ingest edge function on the service role only. No
-- policy for insert/update/delete: nothing with a user JWT can write here.

-- ── 3. the matching rule, and the privacy gate ───────────────────────────────

create or replace function public.match_wa_contact(p_company uuid, p_phone text)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  -- Last ten digits: the CRM stores +91 98765 43210, WhatsApp hands back
  -- 919876543210, and a rep may have saved it either way.
  select c.id
  from public.contacts c
  where c.company_id = p_company
    and length(regexp_replace(p_phone, '\D', '', 'g')) >= 10
    and right(regexp_replace(c.phone, '\D', '', 'g'), 10)
      = right(regexp_replace(p_phone, '\D', '', 'g'), 10)
  order by c.created_at desc
  limit 1;
$$;

comment on function public.match_wa_contact(uuid, text) is
  'The privacy gate. Returns null for any number that is not a lead in this '
  'company, and the ingest function drops those messages unread. This is what '
  'keeps a reps personal chats out of the CRM.';

revoke execute on function public.match_wa_contact(uuid, text) from public, anon;

-- ── 4. it shows up where the rep and the admin already look ──────────────────
--
-- lead_activities is what "What I did today" reads and what the lead page's
-- Journey draws. Putting WhatsApp there means it appears in both without a
-- second feed to build, and it is why the Daily Pulse can finally count it.

create or replace function public.wa_observed_to_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor text;
begin
  -- Only what the REP did. A buyer's reply is worth storing and worth showing
  -- on the lead, but it is not the rep's work and must not inflate their day.
  if new.direction <> 'out' then
    return null;
  end if;

  select p.full_name into v_actor
  from public.profiles p where p.id = new.salesperson_id;

  insert into public.lead_activities (company_id, contact_id, actor_id, actor_name, type, detail)
  values (
    new.company_id, new.contact_id, new.salesperson_id,
    coalesce(nullif(btrim(v_actor), ''), 'Rep') || ' 💬',
    'whatsapp',
    case
      when new.shared_details then 'Sent project details on WhatsApp'
      when new.has_media then 'Sent a file on WhatsApp'
      else 'Messaged on WhatsApp'
    end
  );
  return null;
end $$;

drop trigger if exists trg_wa_observed_to_activity on public.wa_observed_messages;
create trigger trg_wa_observed_to_activity
  after insert on public.wa_observed_messages
  for each row execute function public.wa_observed_to_activity();

-- ── 5. what the admin gets ───────────────────────────────────────────────────
--
-- The question this exists to answer: who actually worked today, and on how
-- many leads — not who dialled the most numbers for eight seconds each.

create or replace view public.v_rep_whatsapp_daily
with (security_invoker = true) as
select
  m.company_id,
  m.salesperson_id,
  (m.sent_at at time zone 'Asia/Kolkata')::date            as day_ist,
  count(*) filter (where m.direction = 'out')              as messages_sent,
  count(distinct m.contact_id) filter (where m.direction = 'out') as leads_messaged,
  count(*) filter (where m.direction = 'out' and m.shared_details) as details_shared,
  count(distinct m.contact_id) filter (where m.direction = 'in')   as leads_who_replied,
  min(m.sent_at) filter (where m.direction = 'out')        as first_message_at,
  max(m.sent_at) filter (where m.direction = 'out')        as last_message_at
from public.wa_observed_messages m
group by m.company_id, m.salesperson_id, (m.sent_at at time zone 'Asia/Kolkata')::date;

comment on view public.v_rep_whatsapp_daily is
  'Per rep per IST day: messages sent, distinct leads messaged, project '
  'details shared, and leads who replied. leads_who_replied is the honest '
  'one — it cannot be inflated by sending more.';

-- Session health, so a rep whose WhatsApp quietly logged out three days ago is
-- visible instead of just looking like a rep who stopped working.
create or replace view public.v_rep_whatsapp_health
with (security_invoker = true) as
select s.company_id, s.salesperson_id, p.full_name as rep,
       s.status, s.wa_number, s.last_seen_at, s.last_error,
       (s.last_seen_at is null or s.last_seen_at < now() - interval '2 hours') as stale
from public.wa_rep_sessions s
join public.profiles p on p.id = s.salesperson_id;
