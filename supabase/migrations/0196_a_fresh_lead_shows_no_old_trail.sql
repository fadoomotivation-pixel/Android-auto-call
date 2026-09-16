-- Resetting the contact row is only half of it.
--
-- Three tables grant a telecaller access on "this contact is currently assigned
-- to me". Which means that the instant a lead is reassigned — reset or not —
-- the new owner inherits the whole of the previous owner's trail:
--
--   lead_activities        the entire timeline, every outcome, every stage move
--   lead_voice_notes       the last rep's voice notes and their transcripts
--   lead_project_interests what the last rep logged the buyer wanted
--
-- A lead handed over as new would have opened at "New" with a clean face and a
-- full diary underneath it.
--
-- call_logs, follow_ups and content_shares were already safe by accident: they
-- are scoped to the rep's OWN rows, so another rep's calls were never visible.
-- One gap remained even there — a lead handed BACK to someone who worked it
-- last year still opened with their own old calls, which is not a fresh lead
-- either. Same rule, same cut-off.
--
-- Admins and the super admin are untouched. They see everything, which is the
-- entire reason this hides rather than deletes.
--
-- APPLIED TO PRODUCTION BY HAND on 2026-09-16.

drop policy if exists lead_activities_select on public.lead_activities;
create policy lead_activities_select on public.lead_activities
  for select using (
    is_super_admin()
    or (company_id = current_company_id() and (
      is_admin()
      or actor_id = auth.uid()
      or exists (
        select 1 from public.contacts c
        where c.id = lead_activities.contact_id
          and c.salesperson_id = auth.uid()
          and (c.fresh_start_at is null or lead_activities.created_at >= c.fresh_start_at)
      )
    ))
  );

drop policy if exists voice_notes_select on public.lead_voice_notes;
create policy voice_notes_select on public.lead_voice_notes
  for select using (
    company_id = current_company_id() and (
      is_admin()
      or actor_id = auth.uid()
      or exists (
        select 1 from public.contacts c
        where c.id = lead_voice_notes.contact_id
          and c.salesperson_id = auth.uid()
          and (c.fresh_start_at is null or lead_voice_notes.created_at >= c.fresh_start_at)
      )
    )
  );

drop policy if exists lpi_select on public.lead_project_interests;
create policy lpi_select on public.lead_project_interests
  for select using (
    company_id = current_company_id() and (
      is_admin()
      or exists (
        select 1 from public.contacts c
        where c.id = lead_project_interests.contact_id
          and c.salesperson_id = auth.uid()
          and (c.fresh_start_at is null or lead_project_interests.created_at >= c.fresh_start_at)
      )
    )
  );

drop policy if exists calllogs_select on public.call_logs;
create policy calllogs_select on public.call_logs
  for select using (
    company_id = current_company_id() and (
      is_admin()
      or (salesperson_id = auth.uid() and not exists (
        select 1 from public.contacts c
        where c.id = call_logs.contact_id
          and c.fresh_start_at is not null
          and call_logs.started_at < c.fresh_start_at
      ))
    )
  );
