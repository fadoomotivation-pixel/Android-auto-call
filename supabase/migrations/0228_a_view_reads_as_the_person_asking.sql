-- A view reads as the person asking, not as the person who wrote it.
--
-- Twelve views in public were created without security_invoker, so Postgres
-- ran them as their owner, postgres, which has BYPASSRLS. Every policy on
-- contacts, call_logs and profiles was skipped the moment a query went through
-- a view instead of the table. And every one of them was granted to anon.
--
-- Measured on 2026-10-21, before this migration:
--   anon (no login, only the public key every browser already has)
--     v_lead_workstate      2,446 leads, 6 companies, name + phone on every row
--     v_broken_recordings   32 calls with phone numbers
--     v_salesperson_stats   67 reps' call and talk-time totals
--   Nidhi (a Fanbe rep, logged in)
--     contacts table        317 leads, 1 company   — RLS doing its job
--     v_lead_workstate    2,446 leads, 6 companies — 1,584 of them other tenants'
--
-- The rule "a company's rows never leak to another company" held on every
-- table and failed on every view. The Android app and the new /app web app
-- both read v_lead_workstate, and /app reads it with no filter at all.
--
-- THE FIX
--
-- security_invoker = true on all twelve, so the existing RLS applies. Nothing
-- new is invented: a rep sees her own leads, an admin her company, the super
-- admin every company (contacts_super, call_logs_super, profiles_super,
-- companies_super, campaigns_super already exist).
--
-- follow_ups was the one table the super admin could not read across
-- companies. Through the owner-run view she could; through an invoker view the
-- other tenants' leads would lose their due_at and fall out of "Call now".
-- followups_super closes that, the same shape as contacts_super.
--
-- Verified in a rolled-back transaction before applying:
--   action_state changed on 0 rows, for a rep, an admin and the super admin.
--   Call now: Nidhi 155 → 155, Fanbe admin 517 → 517, super admin 1,814 → 1,814.
--   As the owner, the rewritten v_lead_workstate equals the old one on all
--   2,617 rows.
--
-- What does change: calls_total / best_call_seconds now count only calls the
-- reader may see. For a rep that means her own, which is exactly what "hand it
-- over as new" promised — the view was leaking the old rep's history through
-- these counts (60 of Nidhi's leads).
--
-- v_lead_workstate is also rewritten to read call_logs once per lead instead
-- of three times. With RLS now evaluated on every call_logs row, the triple
-- scan took an admin's read from 42 ms to 320 ms; one scan brings it to 142 ms.
-- HAVING count(*) > 0 keeps "never called" as NULLs, the same as before.
--
-- anon loses every privilege on these views; nothing reads them before login
-- (app and admin read as authenticated, edge functions as service_role).
-- authenticated keeps SELECT only: v_broken_recordings is a single-table view
-- and therefore auto-updatable, so UPDATE on it was UPDATE on call_logs.
--
-- cb_attendance_code11_backup: a hand-made backup with RLS off — 223 check-ins
-- with GPS coordinates and selfie URLs, readable and DELETABLE by anon. No code
-- references it. RLS on with no policy keeps the rows for service_role only.
--
-- APPLIED TO PRODUCTION on 2026-10-21 — everything above the REVOKE block.
-- That alone closes the leak: re-measured as anon, ten views now raise
-- "permission denied for function current_company_id" and two return 0 rows;
-- the attendance backup returns 0 rows. The REVOKE/GRANT block is defence in
-- depth and was held for a human to approve; run it as written.

create or replace view public.v_lead_workstate with (security_invoker = true) as
 SELECT c.id AS contact_id,
    c.company_id,
    c.salesperson_id,
    c.name,
    c.phone,
    c.status AS disposition,
    c.stage,
    s.label AS stage_label,
    s.short_label AS stage_short_label,
    s.color AS stage_color,
    s.sort_order AS stage_sort,
    s.outcome,
    s.is_terminal,
    s.is_pipeline,
    s.is_advanced,
    s.counts_as_sale,
    s.rep_visible,
    s.analytics_visible,
    a.action_state,
    a.due_at,
    c.site_visit_at,
    c.created_at,
    c.last_contacted_at,
    c.handled_at,
    c.temperature,
    lc.last_call_at,
    lc.last_call_seconds,
    lc.calls_total,
    a.due_at IS NOT NULL AND timezone('Asia/Kolkata'::text, a.due_at)::date = timezone('Asia/Kolkata'::text, now())::date AS is_due_today,
    timezone('Asia/Kolkata'::text, c.handled_at)::date = timezone('Asia/Kolkata'::text, now())::date AS handled_today,
    a.waiting_since,
    a.promise_due_since,
    a.promise_text,
    lc.best_call_seconds
   FROM contacts c
     JOIN lead_stages s ON s.code = c.stage
     JOIN v_lead_action_state a ON a.contact_id = c.id
     LEFT JOIN LATERAL ( SELECT max(cl.started_at) AS last_call_at,
            COALESCE((array_agg(cl.duration_seconds ORDER BY cl.started_at DESC))[1], 0) AS last_call_seconds,
            count(*)::integer AS calls_total,
            COALESCE(max(cl.duration_seconds), 0) AS best_call_seconds
           FROM call_logs cl
          WHERE cl.contact_id = c.id AND COALESCE(cl.off_crm, false) = false
         HAVING count(*) > 0) lc ON true;

alter view public.v_lead_action_state         set (security_invoker = true);
alter view public.v_broken_recordings         set (security_invoker = true);
alter view public.v_salesperson_stats         set (security_invoker = true);
alter view public.v_telecaller_overview       set (security_invoker = true);
alter view public.v_foreign_audio             set (security_invoker = true);
alter view public.v_company_angle_performance set (security_invoker = true);
alter view public.v_company_objections        set (security_invoker = true);
alter view public.v_company_promises          set (security_invoker = true);
alter view public.v_wa_signal_hits            set (security_invoker = true);
alter view public.v_wa_signals_daily          set (security_invoker = true);
alter view public.v_wa_uncaptured_leads       set (security_invoker = true);

drop policy if exists followups_super on public.follow_ups;
create policy followups_super on public.follow_ups
  for select to authenticated using (public.is_super_admin());

revoke all on public.v_lead_workstate, public.v_lead_action_state, public.v_broken_recordings,
  public.v_salesperson_stats, public.v_telecaller_overview, public.v_foreign_audio,
  public.v_company_angle_performance, public.v_company_objections, public.v_company_promises,
  public.v_wa_signal_hits, public.v_wa_signals_daily, public.v_wa_uncaptured_leads
  from anon, authenticated;
grant select on public.v_lead_workstate, public.v_lead_action_state, public.v_broken_recordings,
  public.v_salesperson_stats, public.v_telecaller_overview, public.v_foreign_audio,
  public.v_company_angle_performance, public.v_company_objections, public.v_company_promises,
  public.v_wa_signal_hits, public.v_wa_signals_daily, public.v_wa_uncaptured_leads
  to authenticated;

alter table public.cb_attendance_code11_backup enable row level security;
revoke all on public.cb_attendance_code11_backup from anon, authenticated;
