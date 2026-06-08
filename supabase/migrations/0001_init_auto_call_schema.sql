-- ============================================================
-- SalesAutoCall :: core schema
-- Multi-tenant: each company is isolated. Two roles: admin, salesperson.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- enums ----------
do $$ begin
  create type public.user_role as enum ('admin', 'salesperson');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.contact_status as enum
    ('new','queued','called','no_answer','busy','interested','not_interested','callback','dnc','invalid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.call_outcome as enum
    ('connected','no_answer','busy','failed','voicemail','rejected','cancelled');
exception when duplicate_object then null; end $$;

-- ---------- companies ----------
create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------- profiles (1:1 with auth.users) ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  company_id  uuid references public.companies(id) on delete set null,
  full_name   text,
  phone       text,
  role        public.user_role not null default 'salesperson',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- import batches ----------
create table if not exists public.import_batches (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  salesperson_id uuid references public.profiles(id) on delete set null,
  filename       text,
  format         text check (format in ('csv','tsv')),
  total_rows     integer not null default 0,
  imported_rows  integer not null default 0,
  failed_rows    integer not null default 0,
  created_at     timestamptz not null default now()
);

-- ---------- contacts (the call list) ----------
create table if not exists public.contacts (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  salesperson_id  uuid references public.profiles(id) on delete set null,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  name            text,
  phone           text not null,
  email           text,
  company_name    text,
  notes           text,
  status          public.contact_status not null default 'new',
  extra           jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_contacts_company   on public.contacts(company_id);
create index if not exists idx_contacts_sales      on public.contacts(salesperson_id);
create index if not exists idx_contacts_status     on public.contacts(status);

-- ---------- call logs ----------
create table if not exists public.call_logs (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  salesperson_id   uuid not null references public.profiles(id) on delete cascade,
  contact_id       uuid references public.contacts(id) on delete set null,
  phone            text not null,
  direction        text not null default 'outgoing',
  outcome          public.call_outcome,
  started_at       timestamptz,
  ended_at         timestamptz,
  duration_seconds integer not null default 0,
  sim_slot         integer,
  notes            text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_calllogs_company on public.call_logs(company_id);
create index if not exists idx_calllogs_sales   on public.call_logs(salesperson_id);
create index if not exists idx_calllogs_contact on public.call_logs(contact_id);

-- ---------- updated_at trigger ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_contacts_updated on public.contacts;
create trigger trg_contacts_updated before update on public.contacts
  for each row execute function public.set_updated_at();
