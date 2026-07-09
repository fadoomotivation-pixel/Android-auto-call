-- Lead routing control: let a company choose whether incoming Meta/ad leads are
-- auto-assigned to the least-loaded telecaller (the fair router), or land
-- UNASSIGNED in the admin pool so a super-admin decides who works each lead.
--
-- Default true keeps today's behaviour (auto-assign). A company that wants
-- admin-controlled routing turns it off in Facebook settings; the lead then
-- lands with salesperson_id = null and the admin distributes it (per-lead
-- Assign, or the one-click distribute_unassigned_leads round-robin).
alter table public.facebook_integrations
  add column if not exists auto_assign boolean not null default true;

comment on column public.facebook_integrations.auto_assign is
  'When false, incoming Facebook leads are left unassigned for the admin to route manually.';
