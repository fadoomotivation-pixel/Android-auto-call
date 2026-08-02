-- A second way to reach a founder's WhatsApp, and a queue so a report is never
-- simply lost.
--
-- Meta's Cloud API is the right default and stays the default: it is official,
-- it survives, and it is the only thing allowed anywhere near a CUSTOMER. But
-- it has one rule that a nightly report keeps walking into — plain text is only
-- allowed within 24 hours of that person messaging the business number — and
-- the answer to it (an approved template) cannot carry a multi-line report,
-- because Meta forbids newlines in template parameters. So the founder's own
-- daily digest is the one message the official pipe is worst at delivering.
--
-- Baileys speaks the WhatsApp Web protocol from a real logged-in account, so
-- there is no 24-hour window and no template. It is also an unofficial
-- reverse-engineered client: WhatsApp's terms do not permit it and numbers do
-- get banned for it. That risk is acceptable for ONE internal number sending a
-- report to its own founder, and it is not acceptable anywhere near a lead —
-- which is why the provider column lives here but the customer-facing senders
-- never read it.
--
-- provider is on whatsapp_integrations rather than its own table because
-- "which pipe does this company send on" is the same question the row already
-- answers, and a second table would let the two disagree.
alter table public.whatsapp_integrations
  add column if not exists provider text not null default 'meta';

do $$ begin
  alter table public.whatsapp_integrations
    add constraint whatsapp_integrations_provider_ck
    check (provider in ('meta', 'baileys'));
exception when duplicate_object then null; end $$;

comment on column public.whatsapp_integrations.provider is
  'meta = Cloud API (default, the only one allowed for customer messaging). baileys = experimental WhatsApp Web session, founder notifications ONLY.';

-- A company on Baileys may have no phone_number_id at all, so the row has to be
-- allowed to exist for the provider choice alone.
alter table public.whatsapp_integrations
  alter column phone_number_id drop not null;


-- Where that company's Baileys worker lives, and what it last told us.
--
-- The worker is a separate always-on process (Baileys holds a live WebSocket to
-- WhatsApp and keeps session state in memory, which no edge function can do).
-- We only ever hold its address and a shared secret; the WhatsApp session itself
-- never leaves that box.
create table if not exists public.whatsapp_baileys (
  company_id     uuid primary key references public.companies(id) on delete cascade,
  -- e.g. https://callpro-baileys.up.railway.app — no trailing slash.
  base_url       text not null,
  -- Vault id for the bearer the worker demands. NEVER the secret itself: this
  -- table is read by the admin page, and a shared secret in a page payload is a
  -- shared secret in a browser's memory.
  secret_id      uuid,
  -- disconnected | connecting | qr | connected
  status         text not null default 'disconnected',
  -- The account that is actually logged in, so an admin can see at a glance
  -- that the QR was scanned with the right phone.
  wa_number      text,
  last_seen_at   timestamptz,
  last_error     text,
  updated_at     timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

alter table public.whatsapp_baileys enable row level security;

drop policy if exists whatsapp_baileys_rw on public.whatsapp_baileys;
create policy whatsapp_baileys_rw on public.whatsapp_baileys for all
  using ((company_id = public.current_company_id() and public.is_admin()) or public.is_super_admin())
  with check ((company_id = public.current_company_id() and public.is_admin()) or public.is_super_admin());


-- The queue. Requirement 7 of the brief: if the provider is down, hold the
-- message and retry.
--
-- This exists because Baileys disconnects for ordinary reasons — the phone lost
-- data, the worker restarted on deploy, WhatsApp logged the session out. A
-- digest that vanished because a container was restarting is exactly the kind
-- of silent failure the delivery-truth work was about. Queue it, retry it, and
-- when it finally gives up, say so with the reason.
--
-- Kept provider-agnostic on purpose: nothing in here names Meta or Baileys, so
-- a third pipe later inherits the retry behaviour for free.
create table if not exists public.notification_outbox (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  -- Digits with country code, no '+', the same shape pulse_subscribers uses.
  to_phone        text not null,
  body            text not null,
  -- What this was, so a failure can be reported next to the feature that made
  -- it rather than in a generic list nobody opens.
  kind            text not null default 'pulse',
  -- Set for a daily pulse, so a successful retry can update the founder's row
  -- on the Pulse page instead of leaving yesterday's verdict showing.
  subscriber_id   uuid references public.pulse_subscribers(id) on delete set null,
  status          text not null default 'queued',
  attempts        int  not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

do $$ begin
  alter table public.notification_outbox
    add constraint notification_outbox_status_ck
    check (status in ('queued', 'sent', 'failed'));
exception when duplicate_object then null; end $$;

-- The only query the drainer runs.
create index if not exists notification_outbox_due
  on public.notification_outbox(next_attempt_at)
  where status = 'queued';

alter table public.notification_outbox enable row level security;

-- Read-only for admins: this is a diagnostic, not something to hand-edit. Only
-- the service role (the sender and the drainer) writes here.
drop policy if exists notification_outbox_read on public.notification_outbox;
create policy notification_outbox_read on public.notification_outbox for select
  using ((company_id = public.current_company_id() and public.is_admin()) or public.is_super_admin());


-- The shared secret, handled the same way every other token on this platform is.
create or replace function public.set_baileys_secret(p_company uuid, p_secret text)
returns void language plpgsql security definer set search_path = public as $$
declare
  existing uuid;
  new_id uuid;
begin
  if not (public.is_super_admin() or (p_company = public.current_company_id() and public.is_admin())) then
    raise exception 'not allowed';
  end if;

  select secret_id into existing from public.whatsapp_baileys where company_id = p_company;
  if existing is not null then
    perform vault.update_secret(existing, p_secret);
    return;
  end if;

  new_id := vault.create_secret(p_secret, 'baileys_' || p_company::text, 'Baileys worker bearer');
  update public.whatsapp_baileys set secret_id = new_id where company_id = p_company;
end $$;

-- Service-role only in practice: the callers are edge functions. It is not
-- granted to authenticated, so the browser can never read the bearer back out.
create or replace function public.get_baileys_secret(p_company uuid)
returns text language sql security definer set search_path = public as $$
  select s.decrypted_secret
    from public.whatsapp_baileys b
    join vault.decrypted_secrets s on s.id = b.secret_id
   where b.company_id = p_company;
$$;

revoke all on function public.get_baileys_secret(uuid) from public, anon, authenticated;
