-- AI lead scoring: the AI sets the lead's triage (reusing temperature
-- hot/warm/cold) plus a one-line next action, so reps work the best leads first.
alter table public.contacts add column if not exists ai_next_action text;
alter table public.contacts add column if not exists ai_scored_at timestamptz;
comment on column public.contacts.ai_next_action is 'AI-suggested next step for this lead (one short line).';
comment on column public.contacts.ai_scored_at is 'When the AI last scored this lead.';
