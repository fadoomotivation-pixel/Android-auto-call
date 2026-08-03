-- Where revenue actually dies, and who owns that stage.
--
-- The CRM can currently say a visit was BOOKED and, since 0127, whether the
-- customer TURNED UP. It has never been able to say what happened once they
-- were standing there — and that is the only stage where this company is
-- losing money. 23 visits fixed, zero bookings, and not one recorded reason.
--
-- Without this table the founder cannot separate four completely different
-- businesses problems that all look identical from a dashboard:
--   · the telecaller sent an unqualified lead
--   · whoever showed them round could not close
--   · the price is wrong
--   · the project itself is wrong
-- Each has a different owner and a different fix, and guessing between them is
-- how a company spends a quarter coaching telecallers about a pricing problem.
--
-- A TABLE, not a column on contacts: a serious buyer visits twice, and the
-- second visit's reason is the interesting one. Collapsing them would throw
-- away exactly the leads that were closest to buying.
create table if not exists public.site_visit_outcomes (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  contact_id     uuid not null references public.contacts(id) on delete cascade,
  -- The telecaller who owns the lead. NOT necessarily who showed them round.
  salesperson_id uuid references public.profiles(id) on delete set null,
  -- Which visit this describes. Copied from contacts.site_visit_arrived_at so a
  -- lead that visits twice gets two honest rows.
  visited_at     timestamptz not null default now(),

  -- The ten answers, and nothing else. A free-text box here would produce 400
  -- unique spellings of "price zyada hai" and nothing countable, which is the
  -- entire reason this is a column and not a note.
  outcome        text not null check (outcome in (
    'booked',            -- money on the table
    'thinking',          -- alive, no objection named
    'follow_up',         -- alive, needs another touch
    'price',             -- too expensive
    'location',          -- wrong area
    'family',            -- has to discuss at home
    'finance',           -- loan / funding
    'competitor',        -- bought elsewhere
    'no_show',           -- never actually came
    'other'
  )),
  -- Mandatory for 'other'. An escape hatch that costs MORE than telling the
  -- truth is an escape hatch nobody takes — which is what keeps the nine real
  -- reasons meaningful. Without this, "Other" quietly becomes 90% of the data
  -- and the whole table is worthless.
  note           text,
  -- Who actually showed the customer round. Free text on purpose: this company
  -- has no site-executive role in `profiles` yet, and inventing one to answer
  -- "are site sales executives failing?" would be a bigger change than the
  -- question is worth today. A name typed here still answers it.
  handled_by     text,
  recorded_by    uuid references auth.users(id) on delete set null,
  recorded_at    timestamptz not null default now(),

  constraint other_needs_a_reason check (outcome <> 'other' or coalesce(btrim(note), '') <> '')
);

create index if not exists site_visit_outcomes_company on public.site_visit_outcomes(company_id, recorded_at desc);
create index if not exists site_visit_outcomes_contact on public.site_visit_outcomes(contact_id);
-- One outcome per visit. Re-recording corrects it rather than double-counting.
create unique index if not exists site_visit_outcomes_once
  on public.site_visit_outcomes(contact_id, visited_at);

alter table public.site_visit_outcomes enable row level security;

drop policy if exists site_visit_outcomes_rw on public.site_visit_outcomes;
create policy site_visit_outcomes_rw on public.site_visit_outcomes for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());

-- The latest outcome, denormalised so lead lists can filter on it without a
-- join. The table stays the record; this is a cache.
alter table public.contacts
  add column if not exists site_visit_outcome text;

create or replace function public.sync_site_visit_outcome() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.contacts set site_visit_outcome = new.outcome where id = new.contact_id;
  return new;
end $$;

drop trigger if exists trg_sync_site_visit_outcome on public.site_visit_outcomes;
create trigger trg_sync_site_visit_outcome
  after insert or update on public.site_visit_outcomes
  for each row execute function public.sync_site_visit_outcome();

-- A lead that walked the site cannot be buried without a reason.
--
-- This is the one hard rule in the feature, and it is hard on purpose: the
-- reason a customer who came to see a property did not buy it is the single
-- most valuable sentence this company can collect, and it is available for
-- about a day before the rep forgets. Every other prompt in this app is a
-- nudge; this one is a wall.
--
-- Deliberately NOT applied to 'dnc'. A customer saying "never call me again"
-- must be recordable instantly, always — making that one slower is both rude
-- and, in most places, legally unwise.
create or replace function public.require_visit_outcome() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('lost', 'not_interested')
     and old.status is distinct from new.status
     and old.site_visit_arrived_at is not null
     and not exists (select 1 from public.site_visit_outcomes o where o.contact_id = new.id)
  then
    raise exception
      'This customer visited the site. Record what happened at the visit before closing the lead.'
      using errcode = 'check_violation', hint = 'site_visit_outcome_required';
  end if;
  return new;
end $$;

drop trigger if exists trg_require_visit_outcome on public.contacts;
create trigger trg_require_visit_outcome
  before update on public.contacts
  for each row execute function public.require_visit_outcome();

-- The founder's five questions, as one row per company per reason.
--
-- `share_pct` is the point. A raw count of "price" says nothing; price being
-- 60% of every lost visit says the project is mispriced, and that is a
-- decision somebody can actually take on a Monday morning.
create or replace view public.v_site_visit_intelligence
with (security_invoker = on) as
select
  o.company_id,
  o.outcome,
  count(*)                                                     as visits,
  count(*) filter (where o.outcome = 'booked')                 as booked,
  round(100.0 * count(*) / nullif(sum(count(*)) over (partition by o.company_id), 0), 1) as share_pct,
  count(distinct o.salesperson_id)                             as telecallers_involved,
  count(distinct o.handled_by)                                 as site_staff_involved,
  max(o.recorded_at)                                           as last_seen
from public.site_visit_outcomes o
group by o.company_id, o.outcome;

comment on view public.v_site_visit_intelligence is
  'Why site visits do or do not convert, per company. share_pct is the number that names the problem — see 0131.';
