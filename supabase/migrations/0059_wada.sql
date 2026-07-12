-- "Wada" — the AI extracts spoken commitments/facts from every call recording
-- (promised callback time, budget, preferences, objections, buying timeline)
-- so the telecaller never types them and never breaks a promise.
--   ai_actions: {"promise_at","promise_note","budget","preferences","objections","timeline"}
--   wada_state: 'pending' (needs the rep's one-tap confirm) | 'applied' | 'dismissed'
alter table public.call_logs add column if not exists ai_actions jsonb;
alter table public.call_logs add column if not exists wada_state text;
