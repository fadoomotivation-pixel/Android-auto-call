-- After the call, the message is already written.
--
-- Three things a founder asked for in one breath, and they share this file
-- because they ship together:
--
--   1. TAKE BACK A LIST. Sagar scanned 171 numbers on 21 Oct, called three of
--      them, scanned 134 more on 24 Oct, and the two lists now sit in his New
--      tab looking identical. "Remove all my numbers" is what he asked for;
--      what he needs is for the old LIST to go back to the company. Every scan
--      already carries its list name in lead_source, so an admin can now take
--      back one list (or all) from a telecaller. Nothing is deleted. A lead with
--      a callback booked stays with the rep by default — that is a live
--      conversation, not clutter.
--
--   2. THE MESSAGE AFTER THE CALL. followup_drafts has existed for weeks and
--      holds exactly one row, because it waits for a rep to open the lead and
--      press a button. Now the end of every real call writes one: when a call's
--      summary lands (and it was a conversation with a lead, not a ring-out),
--      follow-up-draft is asked for the message — in her own voice, from the
--      call she just had. She approves it in the app, edits it if she wants, and
--      it goes from her own WhatsApp. One draft per call, never two.
--
--   3. WHO SHE IS. rep_personas: how each telecaller actually sounds and sells,
--      distilled from her recorded calls and her own WhatsApp messages, rebuilt
--      every night. The drafter writes in that voice; the founder can read it.

-- ---------- 1. take back a list ----------

create or replace function public.rep_lead_lists(p_salesperson uuid)
returns table (lead_source text, leads int, called int, booked int, newest timestamptz)
language sql
stable
-- Invoker: RLS on contacts is what keeps a company admin inside their company.
security invoker
set search_path = public
as $$
  select
    coalesce(nullif(c.lead_source, ''), 'No list name')                         as lead_source,
    count(*)::int                                                                 as leads,
    count(*) filter (where c.last_contacted_at is not null
                        or exists (select 1 from public.call_logs l where l.contact_id = c.id))::int as called,
    count(*) filter (where exists (select 1 from public.follow_ups f
                                   where f.contact_id = c.id and f.status = 'pending'))::int        as booked,
    max(c.created_at)                                                             as newest
  from public.contacts c
  where c.salesperson_id = p_salesperson
  group by 1
  order by max(c.created_at) desc;
$$;

grant execute on function public.rep_lead_lists(uuid) to authenticated;

create or replace function public.take_back_leads(
  p_salesperson uuid,
  -- Null = every list. Otherwise the list names from rep_lead_lists.
  p_sources text[] default null,
  -- A lead with a callback booked is a live conversation. Kept with the rep
  -- unless the admin says otherwise.
  p_keep_booked boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_name    text;
  v_ids     uuid[];
  v_kept    int := 0;
begin
  select company_id, full_name into v_company, v_name from public.profiles where id = p_salesperson;
  if v_company is null then
    raise exception 'that telecaller does not exist';
  end if;
  if not (public.is_super_admin() or (public.is_admin() and public.current_company_id() = v_company)) then
    raise exception 'only an admin of this company can take leads back';
  end if;

  select array_agg(c.id) into v_ids
  from public.contacts c
  where c.salesperson_id = p_salesperson
    and c.company_id = v_company
    and (p_sources is null or coalesce(nullif(c.lead_source, ''), 'No list name') = any(p_sources))
    and (not p_keep_booked
         or not exists (select 1 from public.follow_ups f where f.contact_id = c.id and f.status = 'pending'));

  if p_keep_booked then
    select count(*) into v_kept
    from public.contacts c
    where c.salesperson_id = p_salesperson
      and c.company_id = v_company
      and (p_sources is null or coalesce(nullif(c.lead_source, ''), 'No list name') = any(p_sources))
      and exists (select 1 from public.follow_ups f where f.contact_id = c.id and f.status = 'pending');
  end if;

  if v_ids is null then
    return jsonb_build_object('taken', 0, 'kept_booked', v_kept);
  end if;

  -- follow_ups.salesperson_id cannot be null, and a pending one left behind
  -- would keep the lead in his Follow-up tab after it has gone.
  update public.follow_ups
     set status = 'cancelled', updated_at = now()
   where contact_id = any(v_ids) and status = 'pending';

  update public.contacts
     set salesperson_id = null, assigned_at = null, updated_at = now()
   where id = any(v_ids);

  -- So "where did my leads go?" has an answer on every lead.
  insert into public.lead_activities (company_id, contact_id, actor_id, actor_name, type, detail)
  select v_company, id, auth.uid(), 'Admin', 'system',
         'Taken back from ' || coalesce(v_name, 'telecaller') || ' to Unassigned'
  from unnest(v_ids) as id;

  return jsonb_build_object('taken', array_length(v_ids, 1), 'kept_booked', v_kept);
end;
$$;

revoke all on function public.take_back_leads(uuid, text[], boolean) from public;
grant execute on function public.take_back_leads(uuid, text[], boolean) to authenticated;

-- ---------- 2. the message after the call ----------

alter table public.followup_drafts
  add column if not exists source text not null default 'button'
    check (source in ('button', 'after_call')),
  add column if not exists call_id uuid references public.call_logs(id) on delete set null,
  -- How it went: straight from her linked WhatsApp, or by opening the app.
  add column if not exists sent_via text check (sent_via in ('linked_whatsapp', 'whatsapp_app')),
  add column if not exists wa_message_id text,
  -- She changed the words before sending. The best training signal there is.
  add column if not exists edited boolean;

create unique index if not exists followup_drafts_one_per_call
  on public.followup_drafts (call_id) where call_id is not null;

create or replace function public.after_call_draft_kick()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.summary_status = 'ready'
     and coalesce(old.summary_status, '') <> 'ready'
     and new.contact_id is not null
     and new.salesperson_id is not null
     -- A ring-out or a "call me later" is not a conversation to follow up on.
     and coalesce(new.duration_seconds, 0) >= 45
     and coalesce(new.suggested_disposition, '') not in ('not_interested', 'lost', 'dnc')
  then
    perform net.http_post(
      url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/follow-up-draft',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
      ),
      body := jsonb_build_object('mode', 'after_call', 'call_id', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists call_logs_after_call_draft on public.call_logs;
create trigger call_logs_after_call_draft
  after update of summary_status on public.call_logs
  for each row execute function public.after_call_draft_kick();

-- ---------- 3. who she is ----------

create table if not exists public.rep_personas (
  salesperson_id uuid primary key references public.profiles(id) on delete cascade,
  company_id     uuid not null references public.companies(id) on delete cascade,
  -- { summary, how_she_sounds, how_she_sells, strengths[], watch_out[], her_phrases[] }
  persona        jsonb not null,
  -- { calls, messages } — how much it was built from.
  built_from     jsonb,
  model          text,
  built_at       timestamptz not null default now()
);

alter table public.rep_personas enable row level security;

drop policy if exists rep_personas_read on public.rep_personas;
create policy rep_personas_read on public.rep_personas
  for select using (
    salesperson_id = auth.uid()
    or is_super_admin()
    or (is_admin() and company_id = current_company_id())
  );

comment on table public.rep_personas is
  'How each telecaller sounds and sells, from her recorded calls and her own WhatsApp. Rebuilt nightly by rep-persona; read by follow-up-draft.';

-- ---------- finding the number behind a hidden WhatsApp id ----------
--
-- 52 of Nidhi's 54 chats arrived as LIDs: WhatsApp's private id with no phone
-- number. Nothing could match them to a lead, so the page showed 825 messages
-- and "Leads 0". The worker can ask WhatsApp for the LID of a number it already
-- knows, so wa-lid-resolve sends it the numbers of the leads she has called and
-- WhatsApp answers with their LIDs. When it last did that, and what it found:
alter table public.wa_rep_sessions
  add column if not exists lid_resolved_at timestamptz,
  add column if not exists lid_resolved jsonb;

-- ---------- the schedules ----------

select cron.unschedule(jobname) from cron.job
where jobname in ('rep-persona-nightly', 'wa-lid-resolve-hourly');

-- 9:30–11:20 PM IST, every ten minutes, three telecallers a run.
select cron.schedule(
  'rep-persona-nightly',
  '*/10 16-17 * * *',
  $$
  select net.http_post(
    url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/rep-persona',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := jsonb_build_object('mode', 'build', 'limit', 3)
  );
  $$
);

select cron.schedule(
  'wa-lid-resolve-hourly',
  '41 * * * *',
  $$
  select net.http_post(
    url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/wa-lid-resolve',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := jsonb_build_object('mode', 'sweep')
  );
  $$
);
