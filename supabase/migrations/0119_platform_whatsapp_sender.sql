-- One WhatsApp number can send for every company.
--
-- Seven of the eight companies on the platform have no WhatsApp Cloud API
-- connection of their own, and asking each new customer to create a Meta app
-- before their founder can get a daily report means most of them never will —
-- the same objection already raised about Google Drive: the recordings all land
-- in one place, so why connect it separately every time.
--
-- So this names ONE connected company as the platform's sender, exactly like
-- the central Facebook ad account that advertises for many companies. A company
-- with its own number still uses its own — that always wins, because a founder
-- would rather hear from their own brand — and everyone else borrows this one.
--
-- What does NOT change is what gets sent: a subscriber still only ever receives
-- their OWN company's pulse. This shares the pipe, never the data.
create table if not exists public.platform_whatsapp (
  only_row   boolean primary key default true check (only_row),
  company_id uuid not null references public.companies(id) on delete cascade,
  updated_at timestamptz not null default now()
);

alter table public.platform_whatsapp enable row level security;

-- Platform-level, so platform-owner only. A company admin must never be able to
-- read (or repoint) the number every other tenant's reports go out through.
drop policy if exists platform_whatsapp_super on public.platform_whatsapp;
create policy platform_whatsapp_super on public.platform_whatsapp for all
  using (public.is_super_admin())
  with check (public.is_super_admin());
