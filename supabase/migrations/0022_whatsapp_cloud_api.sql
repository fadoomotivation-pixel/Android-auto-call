-- WhatsApp Cloud API: one company number, shared team inbox. Every inbound and
-- outbound message is logged and tagged by rep + lead for super-admin oversight.

-- Per-company connection to Meta WhatsApp Cloud API.
create table if not exists public.whatsapp_integrations (
  company_id uuid primary key references public.companies(id) on delete cascade,
  phone_number_id text not null,           -- Meta phone number id (for sending)
  waba_id text,                            -- WhatsApp Business Account id (optional)
  access_token text not null,              -- permanent system-user token
  verify_token text not null,              -- shared secret for webhook verification
  display_number text,                     -- the human-readable +91 number
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists whatsapp_integrations_phone_number_id_idx
  on public.whatsapp_integrations(phone_number_id);

alter table public.whatsapp_integrations enable row level security;
drop policy if exists wa_integrations_rw on public.whatsapp_integrations;
create policy wa_integrations_rw on public.whatsapp_integrations
  for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.company_id=whatsapp_integrations.company_id)
    or exists (select 1 from public.platform_admins pa where pa.user_id=auth.uid())
  )
  with check (
    exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.company_id=whatsapp_integrations.company_id)
    or exists (select 1 from public.platform_admins pa where pa.user_id=auth.uid())
  );

-- Every WhatsApp message, both directions.
create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  salesperson_id uuid references public.profiles(id) on delete set null,
  direction text not null check (direction in ('in','out')),
  wa_message_id text,
  counterparty text not null,              -- customer's number (digits)
  body text,
  msg_type text not null default 'text',
  template_name text,
  status text,                             -- sent|delivered|read|failed (outbound)
  created_at timestamptz not null default now()
);
create index if not exists wa_messages_company_contact_idx
  on public.whatsapp_messages(company_id, contact_id, created_at desc);
create index if not exists wa_messages_company_counterparty_idx
  on public.whatsapp_messages(company_id, counterparty, created_at desc);

alter table public.whatsapp_messages enable row level security;
drop policy if exists wa_messages_read on public.whatsapp_messages;
create policy wa_messages_read on public.whatsapp_messages
  for select to authenticated
  using (
    salesperson_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.company_id=whatsapp_messages.company_id)
    or exists (select 1 from public.platform_admins pa where pa.user_id=auth.uid())
  );

-- Find the contact (and owning rep) for an inbound number, matching on the last
-- 10 digits within the company. Used by the webhook to route replies. Service role only.
create or replace function public.wa_match_contact(p_company uuid, p_number text)
returns table(contact_id uuid, salesperson_id uuid)
language sql security definer set search_path = public as $$
  select c.id, c.salesperson_id
  from public.contacts c
  where c.company_id = p_company
    and right(regexp_replace(c.phone, '\D', '', 'g'), 10) = right(regexp_replace(p_number, '\D', '', 'g'), 10)
  order by c.updated_at desc nulls last
  limit 1;
$$;
revoke all on function public.wa_match_contact(uuid, text) from public, anon, authenticated;
grant execute on function public.wa_match_contact(uuid, text) to service_role;
