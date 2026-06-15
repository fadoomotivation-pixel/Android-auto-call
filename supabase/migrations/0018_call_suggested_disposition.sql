-- AI auto-disposition: the call summarizer also classifies the lead's stage
-- from the transcript; the rep confirms it with one tap in the app.
alter table public.call_logs add column if not exists suggested_disposition text;
comment on column public.call_logs.suggested_disposition is 'AI-suggested lead stage from the call transcript; rep confirms with one tap.';
