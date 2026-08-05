-- The canonical lead lifecycle: one stage axis, one action axis, one owner each.
--
-- WHY THIS EXISTS
--
-- `contact_status` is an 18-value enum, and eleven of those values describe
-- WHERE THE DEAL IS while seven describe WHAT HAPPENED ON THE LAST CALL
-- (queued, called, no_answer, busy, wrong_person, callback, follow_up). One
-- column, two axes — so writing the second erases the first.
--
-- That is not cosmetic. On the day this was written, 315 of 784 leads (40.2%)
-- held a call outcome in the stage column, and 20 of the 76 leads that had ever
-- reached Interested or Site Visit had been demoted to `callback` by a single
-- unanswered call. The qualification survived only as English prose in
-- lead_activities.detail, which is not machine-readable.
--
-- WHAT THIS DOES
--
--   contacts.status  keeps every value it has, and NARROWS IN MEANING to
--                    "the last disposition". Nothing that writes it changes.
--   contacts.stage   is new: where the deal is. Maintained by a trigger, so no
--                    caller has to dual-write and nothing can drift.
--   lead_stages      owns the vocabulary — code, label, colour, order and
--                    semantics — so neither client hardcodes it ever again.
--   action state     is DERIVED in a view. Never stored. "Today" is a date
--                    filter over it; "Pipeline" is a flag on the stage table.
--
-- Rollback is `drop ... cascade` on the new objects: no existing column is
-- altered, renamed or rewritten, and `status` is still authoritative for
-- everything that reads it today.

-- ───────────────────────── 1 · the vocabulary ─────────────────────────
--
-- A LOOKUP TABLE, NOT A SECOND ENUM. An enum cannot carry a label, a colour, a
-- sort order or a won/lost flag, so every consumer would keep hardcoding those
-- — which is the bug being fixed. Enum values also cannot be reordered or
-- removed; contact_status already bears that scar (`wrong_person` sits at
-- enumsortorder 5.5, wedged in with ADD VALUE BEFORE). A foreign key gives the
-- same integrity guarantee an enum does, and rows can be read at runtime by
-- both the app and the dashboard.

create table if not exists public.lead_stages (
  code              text primary key,
  label             text        not null,
  color             text        not null,
  sort_order        int         not null unique,
  is_terminal       boolean     not null default false,
  -- 'open' | 'won' | 'lost' | 'excluded'
  -- 'excluded' is for stages that are neither a deal outcome nor in play:
  -- a bad phone number is a data-quality fact, and counting it as "lost"
  -- (which every current definition does) understates the real loss rate.
  outcome           text        not null check (outcome in ('open','won','lost','excluded')),
  -- Deal in motion: past qualification, before the close. This is what
  -- "Pipeline" always meant. It is a property of the STAGE, so it stays a
  -- derived bucket — it is never stored on a lead.
  is_pipeline       boolean     not null default false,
  rep_visible       boolean     not null default true,
  analytics_visible boolean     not null default true
);

comment on table public.lead_stages is
  'The one definition of a lead lifecycle stage: code, label, colour, order and semantics. '
  'Every consumer — Android, web, SQL, edge functions, AI — reads stage meaning from here. '
  'A hardcoded status list anywhere else is a bug.';

insert into public.lead_stages
  (code, label, color, sort_order, is_terminal, outcome, is_pipeline, rep_visible, analytics_visible)
values
  ('new',         'New',          '#6A7B85', 10, false, 'open',     false, true,  true),
  ('contacted',   'Contacted',    '#3E7F8A', 20, false, 'open',     false, true,  true),
  ('interested',  'Interested',   '#C98A3E', 30, false, 'open',     false, true,  true),
  ('site_visit',  'Site visit',   '#75629B', 40, false, 'open',     true,  true,  true),
  ('negotiation', 'Negotiation',  '#8A6D3B', 50, false, 'open',     true,  true,  true),
  ('token_paid',  'Token paid',   '#5A62C9', 60, false, 'open',     true,  true,  true),
  ('won',         'Won',          '#3E7F5A', 70, true,  'won',      false, true,  true),
  ('lost',        'Lost',         '#C0452C', 80, true,  'lost',     false, true,  true),
  ('dnc',         'Do not call',  '#5D6862', 90, true,  'lost',     false, true,  true),
  ('invalid',     'Bad number',   '#4A4A4A', 99, true,  'excluded', false, false, false)
on conflict (code) do update set
  label = excluded.label, color = excluded.color, sort_order = excluded.sort_order,
  is_terminal = excluded.is_terminal, outcome = excluded.outcome,
  is_pipeline = excluded.is_pipeline, rep_visible = excluded.rep_visible,
  analytics_visible = excluded.analytics_visible;

alter table public.lead_stages enable row level security;

-- The vocabulary is not company data — every authenticated user renders it.
drop policy if exists lead_stages_read on public.lead_stages;
create policy lead_stages_read on public.lead_stages
  for select to authenticated using (true);

-- Changing what a stage MEANS changes every report in every company at once.
drop policy if exists lead_stages_write on public.lead_stages;
create policy lead_stages_write on public.lead_stages
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ───────────────────── 2 · disposition → stage ─────────────────────
--
-- The complete mapping. All 18 enum values land somewhere; nothing falls
-- through to a default. The seven action values collapse to `contacted`,
-- which is honest: being dialled is genuinely all those values prove.

create or replace function public.lead_stage_for(p_status public.contact_status)
returns text
language sql
immutable
as $$
  select case p_status
    when 'new'            then 'new'
    when 'queued'         then 'new'
    when 'called'         then 'contacted'
    when 'no_answer'      then 'contacted'
    when 'busy'           then 'contacted'
    when 'wrong_person'   then 'contacted'
    when 'callback'       then 'contacted'
    when 'follow_up'      then 'contacted'
    when 'interested'     then 'interested'
    when 'site_visit'     then 'site_visit'
    when 'proposal'       then 'negotiation'
    when 'negotiation'    then 'negotiation'
    when 'token_paid'     then 'token_paid'
    when 'booked'         then 'won'
    when 'not_interested' then 'lost'
    when 'lost'           then 'lost'
    when 'dnc'            then 'dnc'
    when 'invalid'        then 'invalid'
  end;
$$;

comment on function public.lead_stage_for(public.contact_status) is
  'The one disposition-to-stage mapping. The seven call-outcome statuses collapse to '
  'contacted because that is all they prove; the lifecycle position they used to overwrite '
  'is preserved by the monotonic guard in contacts_stage_sync().';

-- ───────────────────────── 3 · the column ─────────────────────────

alter table public.contacts
  add column if not exists stage text references public.lead_stages(code);

comment on column public.contacts.stage is
  'Where the deal is. Maintained by trigger from status, and may only move FORWARD unless a '
  'human sets it explicitly. contacts.status remains the last disposition — the two are '
  'different questions and this column exists because one answer was overwriting the other.';

-- ──────────────────── 4 · the monotonic guard ────────────────────
--
-- THE RULE THAT MATTERS MOST. Without it this column drains exactly as the old
-- one did: a no-answer on an interested lead would knock it back to contacted,
-- and the qualification would be lost a second time.
--
--   · An explicit stage write always wins. A rep marking a lead Lost, or a
--     manager correcting a mistake, is a human decision and is never blocked.
--   · A TERMINAL disposition always applies. Choosing "not interested", "lost",
--     "DNC" or a booking IS the human decision, arriving through status.
--   · Otherwise stage may only ADVANCE. no_answer on an interested lead sets
--     disposition = no_answer and leaves stage = interested.

create or replace function public.contacts_stage_sync()
returns trigger
language plpgsql
as $$
declare
  v_candidate  text;
  v_cand_sort  int;
  v_cand_term  boolean;
  v_cur_sort   int;
begin
  v_candidate := public.lead_stage_for(new.status);

  if tg_op = 'INSERT' then
    -- An explicit stage on insert is honoured; otherwise derive it.
    new.stage := coalesce(new.stage, v_candidate);
    return new;
  end if;

  -- Explicit stage change by the caller — a human decision. Accept it as-is.
  if new.stage is distinct from old.stage then
    return new;
  end if;

  -- Stage was not mentioned. Derive from the disposition, monotonically.
  if new.status is distinct from old.status or old.stage is null then
    select sort_order, is_terminal into v_cand_sort, v_cand_term
      from public.lead_stages where code = v_candidate;
    select sort_order into v_cur_sort
      from public.lead_stages where code = old.stage;

    if old.stage is null or v_cand_term or v_cur_sort is null or v_cand_sort >= v_cur_sort then
      new.stage := v_candidate;
    else
      new.stage := old.stage;   -- refuse the regression
    end if;
  end if;

  return new;
end;
$$;

comment on function public.contacts_stage_sync() is
  'Keeps contacts.stage correct from contacts.status with no caller changes, and refuses to '
  'move a lead backwards. Explicit stage writes and terminal dispositions always win.';

drop trigger if exists trg_contacts_stage_sync on public.contacts;
create trigger trg_contacts_stage_sync
  before insert or update on public.contacts
  for each row execute function public.contacts_stage_sync();

-- ─────────────────────────── 5 · backfill ───────────────────────────
--
-- Straight from the mapping. No guessing at a richer stage for the 315 leads
-- whose status is an action: lead_activities stores status history as display
-- prose ("Stage → Callback (from voice note)") with meta null, so there is
-- nothing machine-readable to recover, and parsing English into a lifecycle
-- position is exactly the kind of silent wrongness this migration exists to end.
-- They become `contacted`, and the guard above stops the loss continuing.

update public.contacts set stage = public.lead_stage_for(status) where stage is null;

alter table public.contacts alter column stage set not null;
alter table public.contacts alter column stage set default 'new';

create index if not exists contacts_stage_idx on public.contacts (company_id, stage);

-- ──────────────────── 6 · action state, derived ────────────────────
--
-- What the rep should do now. NEVER STORED — it is a function of the clock, and
-- a stored copy would be wrong within the hour. "Today" is a filter over this
-- view, not a stage; that distinction is the whole point.
--
-- Precedence is strict and the states are mutually exclusive by construction:
-- overdue → call_now → due_today → scheduled → awaiting_visit → no_next_step.
--
-- `call_now` deliberately includes an open lead with a retry disposition and NO
-- booked time — a plain no-answer is work, and the app has always treated it
-- that way. `no_next_step` is therefore the real leak: someone spoke to them,
-- formed a view, and booked nothing.

create or replace view public.v_lead_action_state
with (security_invoker = true) as
with nxt as (
  select f.contact_id, min(f.due_at) as due_at
  from public.follow_ups f
  where f.completed_at is null
  group by f.contact_id
)
select
  c.id as contact_id,
  n.due_at,
  case
    when s.is_terminal then 'none'
    when n.due_at is not null and n.due_at <  date_trunc('day', timezone('Asia/Kolkata', now()))
         at time zone 'Asia/Kolkata'                                  then 'overdue'
    when n.due_at is not null and n.due_at <= now()                   then 'call_now'
    when n.due_at is not null
         and timezone('Asia/Kolkata', n.due_at)::date
           = timezone('Asia/Kolkata', now())::date                    then 'due_today'
    when n.due_at is not null                                         then 'scheduled'
    when c.status in ('no_answer','busy','wrong_person','callback','follow_up','queued')
                                                                      then 'call_now'
    when c.site_visit_at is not null and c.site_visit_at > now()      then 'awaiting_visit'
    else 'no_next_step'
  end as action_state
from public.contacts c
join public.lead_stages s on s.code = c.stage
left join nxt n on n.contact_id = c.id;

comment on view public.v_lead_action_state is
  'What to do now, derived from stage + follow_ups.due_at + site_visit_at. Never stored. '
  'Exactly one state per lead. Terminal stages get ''none''.';

-- ─────────────── 7 · the one row every surface reads ───────────────

create or replace view public.v_lead_workstate
with (security_invoker = true) as
select
  c.id                as contact_id,
  c.company_id,
  c.salesperson_id,
  c.name,
  c.phone,
  c.status            as disposition,
  c.stage,
  s.label             as stage_label,
  s.color             as stage_color,
  s.sort_order        as stage_sort,
  s.outcome,
  s.is_terminal,
  s.is_pipeline,
  s.rep_visible,
  s.analytics_visible,
  a.action_state,
  a.due_at,
  c.site_visit_at,
  c.created_at,
  c.last_contacted_at,
  c.handled_at,
  c.temperature,
  -- "Today" as a date question, which is all it ever was.
  (a.due_at is not null
    and timezone('Asia/Kolkata', a.due_at)::date = timezone('Asia/Kolkata', now())::date)
                      as is_due_today,
  (timezone('Asia/Kolkata', c.handled_at)::date = timezone('Asia/Kolkata', now())::date)
                      as handled_today
from public.contacts c
join public.lead_stages s on s.code = c.stage
join public.v_lead_action_state a on a.contact_id = c.id;

comment on view public.v_lead_workstate is
  'One row per lead carrying BOTH axes — lifecycle stage (with its label and colour) and '
  'derived action state. Android tabs, dashboard chips, reports and AI all count from this, '
  'so a number on the phone and a number on the web are the same query.';

grant select on public.lead_stages         to authenticated;
grant select on public.v_lead_action_state to authenticated;
grant select on public.v_lead_workstate    to authenticated;
