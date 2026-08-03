-- ============================================================
-- The app talking to the telecaller — and what the answers teach us
--
-- Until now the app only ever RECORDED what the rep typed. It never asked
-- anything on its own, so the two questions that decide a deal were left to the
-- rep to remember:
--
--   1. A site visit was booked for Tuesday. Tuesday came and went. Did the
--      customer actually turn up — and if they did, how close are they?
--   2. A callback was due at 4pm. It is 4:40pm. Was that call made, and if not,
--      what stopped it?
--
-- Both were answerable only by the rep going and looking. Nobody looks. So a
-- visit that never happened stays "site_visit" (and counts as QUALIFIED in the
-- ad autopsy), and a callback nobody made just goes red and stays red.
--
-- Two things get stored here.
--
-- close_probability — the rep's own read, 0-100, on a lead that has SEEN the
-- project. This is the single most useful number in the funnel and it exists
-- nowhere else: "site_visit" is a stage, not a forecast. With it, a manager can
-- sort by who is actually close, and — because we also know who eventually
-- booked — we can score how honest each rep's forecast is. A rep who says 90%
-- on everything and books 5% is not lying; they need training on reading a
-- buyer. That is only visible once the guess is written down.
--
-- rep_prompts — every question the app asked, what came back, and how long the
-- rep took to answer. Not analytics for its own sake: this is the discipline
-- record. Whether a rep answers the app at all, how fast, and which reason they
-- give when a callback slips ("busy" every single time vs. "number not
-- reachable") is the clearest signal we have of how they work — and it is the
-- input to coaching them, one rep at a time, instead of scolding the whole team
-- in the morning meeting.
--
-- Same multi-tenant RLS model as the rest of the schema.
-- ============================================================

-- ---------- the rep's own forecast, on the lead ----------
alter table public.contacts
  add column if not exists close_probability int,
  add column if not exists close_probability_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contacts_close_probability_range'
  ) then
    alter table public.contacts
      add constraint contacts_close_probability_range
      check (close_probability is null or close_probability between 0 and 100);
  end if;
end $$;

comment on column public.contacts.close_probability is
  'Rep''s own 0-100 read on how likely this lead is to buy, captured after a site visit.';

-- ---------- every question the app asked, and the answer ----------
create table if not exists public.rep_prompts (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  salesperson_id uuid not null references public.profiles(id)  on delete cascade,
  contact_id     uuid references public.contacts(id) on delete set null,
  -- Which of the app's questions this was.
  kind           text not null
                   check (kind in ('visit_check', 'callback_check', 'day_review')),
  -- The machine-readable answer: 'came' | 'no_show' | 'postponed' | 'called' |
  -- 'not_yet' | 'reviewed' | 'skipped'. Null while unanswered.
  answer         text,
  -- The reason chip behind a negative answer ("busy", "not_reachable",
  -- "lost_interest", "competitor", "wrong_time", "leads_not_serious"…).
  -- This is the column that teaches us the rep's real blockers.
  reason         text,
  -- 0-100, only on a visit_check the rep answered "came".
  probability    int check (probability is null or probability between 0 and 100),
  -- How long the rep left the question sitting there. A rep who answers in 4
  -- seconds is working the app; one who takes 6 minutes is not.
  seconds_to_answer int,
  -- True when the rep closed the prompt without answering. Counted, never
  -- punished in the UI — it is a signal, not a strike.
  dismissed      boolean not null default false,
  answered_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists idx_rep_prompts_rep
  on public.rep_prompts(salesperson_id, created_at desc);
create index if not exists idx_rep_prompts_company
  on public.rep_prompts(company_id, created_at desc);
create index if not exists idx_rep_prompts_contact
  on public.rep_prompts(contact_id);

alter table public.rep_prompts enable row level security;

-- A rep sees their own answers; an admin sees their whole company's.
drop policy if exists rep_prompts_select on public.rep_prompts;
create policy rep_prompts_select on public.rep_prompts for select to authenticated
  using (
    company_id = public.current_company_id()
    and (public.is_admin() or salesperson_id = auth.uid())
  );

-- A rep can only ever write their own row, in their own company.
drop policy if exists rep_prompts_insert on public.rep_prompts;
create policy rep_prompts_insert on public.rep_prompts for insert to authenticated
  with check (company_id = public.current_company_id() and salesperson_id = auth.uid());

drop policy if exists rep_prompts_update on public.rep_prompts;
create policy rep_prompts_update on public.rep_prompts for update to authenticated
  using (company_id = public.current_company_id() and salesperson_id = auth.uid())
  with check (company_id = public.current_company_id() and salesperson_id = auth.uid());

-- ---------- what it adds up to, per rep ----------
--
-- Deliberately blunt columns: how often the rep answers the app, how fast, how
-- often a due callback had actually been made when asked, and — the one that
-- matters most — whether their site-visit forecast matches what they book.
create or replace view public.v_rep_discipline as
  select
    p.company_id,
    p.salesperson_id,
    pr.full_name,
    count(*)::int                                                        as prompts_shown,
    count(*) filter (where p.answer is not null)::int                    as answered,
    count(*) filter (where p.dismissed)::int                             as ignored,
    round(
      100.0 * count(*) filter (where p.answer is not null)
      / greatest(count(*), 1)
    )::int                                                               as answer_rate_pct,
    percentile_cont(0.5) within group (
      order by p.seconds_to_answer
    ) filter (where p.seconds_to_answer is not null)                     as median_answer_seconds,
    -- Callback discipline: of the due callbacks the app asked about, how many
    -- had already been made.
    count(*) filter (where p.kind = 'callback_check')::int               as callbacks_asked,
    count(*) filter (where p.kind = 'callback_check' and p.answer = 'called')::int
                                                                         as callbacks_made,
    -- Site-visit truth: asked vs. actually turned up.
    count(*) filter (where p.kind = 'visit_check')::int                  as visits_asked,
    count(*) filter (where p.kind = 'visit_check' and p.answer = 'came')::int
                                                                         as visits_happened,
    -- The rep's average optimism on a lead they have met face to face.
    round(avg(p.probability) filter (where p.probability is not null))::int
                                                                         as avg_close_forecast
  from public.rep_prompts p
  join public.profiles pr on pr.id = p.salesperson_id
  group by p.company_id, p.salesperson_id, pr.full_name;

-- The view inherits rep_prompts' RLS through the underlying table
-- (security_invoker), so an admin sees their company and a rep sees themselves.
alter view public.v_rep_discipline set (security_invoker = on);
