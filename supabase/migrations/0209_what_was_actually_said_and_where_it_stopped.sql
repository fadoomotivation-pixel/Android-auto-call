-- 120 recorded conversations where a deal died. Nobody has heard one.
--
-- WHAT THE DATA SAYS ABOUT THIS COMPANY
--
--   11,373 calls          of which  594 were a real conversation (5%)
--      542 leads          of which    0 are booked
--      138 lost                       37 after a real conversation
--      333 "contacted"                83 after a real conversation
--                                     79 of those silent for 2+ weeks
--
-- The average of those stalled transcripts is 1,180 characters. These are not
-- ring-outs; they are proper conversations — a buyer said what they wanted and
-- what was stopping them, out loud, and then the lead sat in "contacted"
-- looking identical to a number nobody ever reached.
--
-- The founder cannot listen to 120 recordings. The rep cannot remember a
-- conversation from three weeks ago across 83 leads. So the single most
-- valuable thing this company owns — what its buyers actually said — is
-- write-only.
--
-- WHY A TABLE AND NOT ANOTHER SCREEN
--
-- Nothing here adds a surface. One distilled memory per lead, read by the
-- things that already exist:
--
--   focus-five   picks 5 leads each morning and writes the opener the rep
--                SAYS. It is told to "reference the last call" while having
--                only a timestamp, the notes, and a call summary that for a
--                dead lead reads "no conversation took place". It has never
--                seen a transcript or a single WhatsApp message.
--   Daily Pulse  can finally answer "why are we losing?" with a tally instead
--                of an anecdote.
--
-- objection_code is a SMALL FIXED SET on purpose. Free text cannot be counted,
-- and a founder asking "what kills our deals" needs a number, not a word cloud.
--
-- APPLIED TO PRODUCTION BY HAND on 2026-09-20.

create table if not exists public.lead_memory (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  salesperson_id uuid references public.profiles(id) on delete set null,
  where_we_left_it text,
  buyer_wants text,
  objection text,
  objection_code text check (objection_code in (
    'price', 'loan', 'location', 'size', 'timing', 'family',
    'competitor', 'not_serious', 'other', 'none'
  )),
  material_at timestamptz,
  sources jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now()
);

comment on table public.lead_memory is
  'One distilled memory per lead: where the conversation was left, what the buyer wanted, and what stopped it — read from call transcripts AND WhatsApp together. Built so focus-five can write an opener that picks up a real thread, and so a founder can count why deals die instead of guessing.';

create index if not exists lead_memory_company_idx on public.lead_memory (company_id, objection_code);
create index if not exists lead_memory_rep_idx on public.lead_memory (salesperson_id);

alter table public.lead_memory enable row level security;

drop policy if exists lead_memory_select on public.lead_memory;
create policy lead_memory_select on public.lead_memory
  for select using (
    is_super_admin()
    or (company_id = current_company_id() and (is_admin() or salesperson_id = auth.uid()))
  );

-- WHY WE LOSE, AS A NUMBER.
--
-- Terminal leads and leads that have gone quiet both count: a deal that
-- stalled three weeks ago is lost, whatever the stage column still says.
create or replace view public.v_company_objections as
select m.company_id,
       m.objection_code,
       count(*)::int as leads,
       count(*) filter (where s.is_terminal)::int as already_lost,
       count(*) filter (where not s.is_terminal
                          and coalesce(c.last_contacted_at, m.material_at) < now() - interval '14 days')::int as stalled,
       count(*) filter (where s.counts_as_sale)::int as still_won,
       (array_agg(m.objection order by m.generated_at desc)
          filter (where m.objection is not null))[1] as example
from public.lead_memory m
join public.contacts c on c.id = m.contact_id
join public.lead_stages s on s.code = c.stage
where m.objection_code is not null and m.objection_code <> 'none'
group by 1, 2;

comment on view public.v_company_objections is
  'What is actually stopping this company''s deals, counted. Built from what buyers said on calls and WhatsApp, not from a dropdown a rep picked.';
