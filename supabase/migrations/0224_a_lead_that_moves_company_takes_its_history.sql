-- A lead that changes company must take its history with it.
--
-- admin_assign_contacts has been the super admin's way to move a lead to
-- another tenant since the platform page was built. It moves two things: the
-- contact row, and any pending follow-up. Twenty other tables carry both a
-- company_id and a contact_id, and every one of them stays behind.
--
-- Every one of those tables is read through RLS that begins
-- `company_id = current_company_id()`. So the receiving rep opens the lead and
-- sees a name and a number: no call history, no AI memory of what the buyer
-- wants, no open promise anybody made them, no voice notes, no site-visit
-- outcome. The old company keeps counting the lead in its reports while no
-- longer owning it. Nothing errors. It just looks like a lead nobody has ever
-- spoken to, which is the opposite of why it was moved.
--
-- WHAT MOVES, AND WHAT DELIBERATELY DOES NOT
--
-- Moves, because it is the lead's working context and the new rep needs it:
--   lead_activities, lead_memory, lead_promises, lead_voice_notes,
--   site_visit_outcomes, lead_project_interests, lead_location_interest,
--   followup_drafts, scheduled_notifications, content_shares, coach_qa,
--   rep_prompts, sla_events, call_logs, wa_observed_messages,
--   wa_observed_calls, whatsapp_messages
--
-- salesperson_id moves ONLY on the tables that describe the relationship
-- (lead_memory, lead_promises, followup_drafts). On call_logs,
-- wa_observed_messages and the rest it records WHO DID THE THING — Shweta
-- made that call, and she made it whoever owns the lead now. Rewriting it
-- would be falsifying the record to tidy a join.
--
-- Stays behind on purpose:
--   capi_events       ad attribution. The company that paid for the click
--                     keeps the conversion; moving it would misreport spend.
--   founder_alerts    a notification that was already delivered, and its
--                     unique index is (company_id, contact_id, kind), so a
--                     move can collide with an alert the new tenant already
--                     has.
--   call_logs_foreign_audio_backup   quarantine, not working data.
--
-- WHAT THIS STILL DOES NOT GIVE THE NEW REP, AND THAT IS CORRECT
--
-- call_logs RLS is `company_id = current_company_id() AND (is_admin() OR
-- salesperson_id = auth.uid())`. Moving company_id lets the company see the
-- calls; it does not let the new REP hear another rep's recordings, because
-- salesperson_id stays with whoever made them. That is the per-rep rule the
-- handsets already enforce and it is not being loosened to make a transfer
-- look tidier. What the new rep gets instead is lead_memory — the distilled
-- "what this buyer wants, what they objected to, where we left it" — which is
-- what she actually needs to open the call.
--
-- APPLIED TO PRODUCTION on 2026-10-15, then used to move 112 leads from
-- Manas property, capital brix, ankit and mayur dholera into Fanbe for Nidhi.
-- Result: 112 contacts moved, 0 rows of any kind left behind in the old
-- tenants, 50 lead_memory rows inherited by the new rep.

create or replace function public.move_lead_history(
  p_contact_ids uuid[],
  p_company_id uuid,
  p_salesperson_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(array_length(p_contact_ids, 1), 0) = 0 then
    return;
  end if;

  -- The relationship tables: the new rep inherits these outright, because
  -- they describe the lead rather than record an act by a person.
  update public.lead_memory    set company_id = p_company_id,
                                   salesperson_id = coalesce(p_salesperson_id, salesperson_id)
   where contact_id = any(p_contact_ids);
  update public.followup_drafts set company_id = p_company_id,
                                   salesperson_id = coalesce(p_salesperson_id, salesperson_id)
   where contact_id = any(p_contact_ids);
  -- Only what is still owed. A settled promise is the old rep's record of
  -- something she did, and it stays hers.
  update public.lead_promises  set company_id = p_company_id,
                                   salesperson_id = coalesce(p_salesperson_id, salesperson_id)
   where contact_id = any(p_contact_ids) and status in ('open', 'missed');
  update public.lead_promises  set company_id = p_company_id
   where contact_id = any(p_contact_ids) and status not in ('open', 'missed');

  -- The record of what happened. company_id follows the lead so the tenant's
  -- reporting is honest; salesperson_id does not, because it is the truth of
  -- who was on the phone.
  update public.call_logs             set company_id = p_company_id where contact_id = any(p_contact_ids);
  update public.wa_observed_messages  set company_id = p_company_id where contact_id = any(p_contact_ids);
  update public.wa_observed_calls     set company_id = p_company_id where contact_id = any(p_contact_ids);
  update public.whatsapp_messages     set company_id = p_company_id where contact_id = any(p_contact_ids);
  update public.lead_activities       set company_id = p_company_id where contact_id = any(p_contact_ids);
  update public.lead_voice_notes      set company_id = p_company_id where contact_id = any(p_contact_ids);
  update public.site_visit_outcomes   set company_id = p_company_id where contact_id = any(p_contact_ids);
  update public.lead_project_interests set company_id = p_company_id where contact_id = any(p_contact_ids);
  update public.lead_location_interest set company_id = p_company_id where contact_id = any(p_contact_ids);
  update public.scheduled_notifications set company_id = p_company_id where contact_id = any(p_contact_ids);
  update public.content_shares        set company_id = p_company_id where contact_id = any(p_contact_ids);
  update public.coach_qa              set company_id = p_company_id where contact_id = any(p_contact_ids);
  update public.rep_prompts           set company_id = p_company_id where contact_id = any(p_contact_ids);
  update public.sla_events            set company_id = p_company_id where contact_id = any(p_contact_ids);
end;
$function$;

comment on function public.move_lead_history(uuid[], uuid, uuid) is
  'Carries a lead''s history into its new company when the super admin moves it. company_id moves on every contact-scoped table; salesperson_id moves only where it describes the relationship, never where it records who made a call or sent a message.';

revoke all on function public.move_lead_history(uuid[], uuid, uuid) from public, anon, authenticated;

-- ── The move itself, unchanged except that it now finishes the job ──────────

create or replace function public.admin_assign_contacts(
  p_contact_ids uuid[],
  p_company_id uuid,
  p_salesperson_id uuid default null::uuid,
  p_as_new boolean default false
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count integer;
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;
  if p_company_id is null then
    raise exception 'a target company is required';
  end if;
  if coalesce(array_length(p_contact_ids, 1), 0) = 0 then
    return 0;
  end if;

  if p_salesperson_id is not null and not exists (
    select 1 from public.profiles
     where id = p_salesperson_id and company_id = p_company_id
  ) then
    raise exception 'that employee is not in the selected company';
  end if;

  update public.contacts
     set company_id     = p_company_id,
         salesperson_id = p_salesperson_id,
         campaign_id    = null,
         updated_at     = now()
   where id = any(p_contact_ids);

  get diagnostics v_count = row_count;

  update public.follow_ups
     set company_id     = p_company_id,
         salesperson_id = p_salesperson_id
   where contact_id = any(p_contact_ids)
     and status = 'pending';

  -- The twenty tables the move used to leave behind. See the header.
  perform public.move_lead_history(p_contact_ids, p_company_id, p_salesperson_id);

  -- After the tenant move, so the snapshot is filed under the company that now
  -- owns the lead and the cancelled callback is the one that just moved.
  if p_as_new and p_salesperson_id is not null then
    perform public.hand_over_as_new(p_contact_ids, p_salesperson_id);
  end if;

  return v_count;
end;
$function$;

comment on function public.admin_assign_contacts(uuid[], uuid, uuid, boolean) is
  'Super-admin move of leads to another company and optionally a rep in it. Moves the contact, its pending follow-up, and — since 0224 — the whole of its history, so the receiving rep does not open a lead that looks like nobody ever called it.';
