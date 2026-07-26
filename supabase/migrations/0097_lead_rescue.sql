-- Auto-Rescue: the accountability loop that lead-sla is missing.
--
-- lead-sla nudges the rep and escalates — then stops. If the rep still doesn't
-- call, nothing moves the lead, which is how 55% of leads ended up never called.
-- Rescue takes the next step a human manager would: hand the lead to a DIFFERENT
-- rep and tell the manager. Because that is an autonomous action on real
-- customer data, it is governed, bounded and fully audited:
--   • per-company policy the admin controls, off by default (opt in knowingly),
--   • a hard cap on how many rescues can fire per run,
--   • every action written to sla_events so a human can review exactly what the
--     system did, to which lead, and why.
create table if not exists public.sla_policy (
  company_id          uuid primary key references public.companies(id) on delete cascade,
  enabled             boolean not null default false,
  reassign_after_min  int not null default 120 check (reassign_after_min between 15 and 1440),
  notify_admin        boolean not null default true,
  updated_at          timestamptz not null default now()
);

create table if not exists public.sla_events (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  contact_id   uuid references public.contacts(id) on delete set null,
  action       text not null,                    -- 'reassigned' | 'admin_alerted' | 'skipped'
  from_rep     uuid references public.profiles(id) on delete set null,
  to_rep       uuid references public.profiles(id) on delete set null,
  waited_min   int,
  detail       text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_sla_events_company on public.sla_events(company_id, created_at desc);

alter table public.sla_policy enable row level security;
alter table public.sla_events enable row level security;

-- A company admin governs and reviews their own company; the platform super
-- admin sees and sets everything. Nobody else can read either table.
drop policy if exists sla_policy_rw on public.sla_policy;
create policy sla_policy_rw on public.sla_policy for all
  using ((company_id = public.current_company_id() and public.is_admin()) or public.is_super_admin())
  with check ((company_id = public.current_company_id() and public.is_admin()) or public.is_super_admin());

drop policy if exists sla_events_read on public.sla_events;
create policy sla_events_read on public.sla_events for select
  using ((company_id = public.current_company_id() and public.is_admin()) or public.is_super_admin());

-- Runs a few times an hour; the function itself stays quiet outside IST calling
-- hours and does nothing at all for companies that haven't switched it on.
select cron.schedule(
  'lead-rescue-15min',
  '7,22,37,52 * * * *',
  $$
  select net.http_post(
    url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/lead-rescue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
