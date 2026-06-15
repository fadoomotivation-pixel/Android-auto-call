-- ============================================================
-- UrOperator cloud-calling: full SIP configuration + self-serve admin
--   • company_integrations gains the SIP server/port/transport/WSS fields
--     so they are configured per client (not hard-coded in the app).
--   • profiles gain optional per-agent SIP server/port overrides.
--   • Company admins can now manage their OWN company's integration row
--     (paste token/number, set server/port) — not just the super admin.
-- The raw uro_token stays server-side: the calling edge functions read it
-- via the service role; client users only ever send/receive sanitised data.
-- ============================================================

-- ---------- richer integration config ----------
alter table public.company_integrations
  add column if not exists sip_server     text not null default 'sip.uroperator.com',
  add column if not exists sip_port       integer not null default 6060,
  add column if not exists transport      text not null default 'udp',
  add column if not exists wss_url        text,
  add column if not exists outbound_proxy text,
  add column if not exists api_base_url   text not null default 'https://api.uroperator.com';

-- ---------- optional per-agent SIP overrides ----------
-- Most agents use the company SIP server; these let an admin point a single
-- rep at a different PBX address/port (e.g. a private trunk over VPN).
alter table public.profiles
  add column if not exists sip_server text,
  add column if not exists sip_port   integer;

-- ---------- self-serve: company admins manage their own integration ----------
-- Keeps the existing super-admin-all policy (ci_super) and adds an admin
-- policy scoped to the admin's own company.
drop policy if exists ci_admin on public.company_integrations;
create policy ci_admin on public.company_integrations for all to authenticated
  using (company_id = public.current_company_id() and public.is_admin())
  with check (company_id = public.current_company_id() and public.is_admin());
