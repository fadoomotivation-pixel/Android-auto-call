# Agentic AI Employees (Free / Deterministic)

Edge Functions for the Telecaller CRM AI Agents. **They run 100% free** — no
Claude/Anthropic or any paid API. All reasoning is a deterministic rules engine
over your own data, so there is **no per-run cost** and nothing that can ever bill
you. Everything fits inside the Supabase free tier (Edge Functions + pg_cron).

## 1. Environment variables
The only secrets required are Supabase's own (no LLM key):
```bash
supabase secrets set SUPABASE_URL="https://<your-project-ref>.supabase.co"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="..."
```

## 2. Deployment
```bash
supabase functions deploy ai-dispatcher
supabase functions deploy business-analyst-agent
supabase functions deploy sales-head-agent
```

## 3. Register the agents
Insert one row per agent. Thresholds live in `config` (jsonb) so you can tune the
rules without redeploying:
```sql
insert into ai_agents_registry (name, description, is_active, schedule, config) values
('Business Analyst', 'Daily KPIs, idle time and anomalies', true, '0 18 * * *',
  '{"connect_drop_threshold":0.25,"idle_pct_threshold":0.40,"no_answer_rate_threshold":0.50,
    "wrap_up_allowance_sec":30,"break_allowance_min":60,"min_calls_for_rate":5}'::jsonb),
('Sales Head', 'Prioritized coaching + follow-up tasks', true, '0 2 * * *',
  '{"target_connect_rate":40,"target_calls_per_rep":30,"stale_days":3,
    "max_tasks_per_company":10,"closed_statuses":[]}'::jsonb);
```
The dispatcher derives the function name from the agent name
(`Business Analyst` → `business-analyst-agent`), so names must match the deployed
functions. Run the Business Analyst before the Sales Head (the Sales Head reads
the insights the Analyst writes).

## 4. Schedule the dispatcher (pg_cron)
The dispatcher invokes every `is_active` agent. Run it hourly; agents are cheap and
idempotent (the Analyst upserts per day, the Sales Head clears its own pending
tasks before regenerating).
```sql
select cron.schedule(
  'ai-dispatcher-hourly',
  '0 * * * *',
  $$
    select net.http_post(
      url:='https://<your-project-ref>.supabase.co/functions/v1/ai-dispatcher',
      headers:='{"Content-Type":"application/json","Authorization":"Bearer YOUR_ANON_KEY"}'::jsonb
    )
  $$
);
```
> Schedule times are UTC. The agents compute their day in IST (Asia/Kolkata)
> internally, so `0 18 * * *` ≈ 11:30 PM IST.

## 5. Monitoring
Every execution writes a row to `ai_agent_runs` (status, logs, `tokens_used`,
`cost_usd`). For these agents `cost_usd` is always `0`. The admin dashboard
(`admin/app/dashboard/ai-agents`) surfaces the latest insight, tasks, and the run
feed.

## 6. Optional: nicer narrative later (still free)
Everything works without an LLM. If you ever want free-flowing narrative text, you
can plug a **free-tier** LLM (e.g. Google Gemini Flash or Groq) behind an opt-in
`use_llm` flag — keep it **off** by default so the system stays at $0. Not wired
here on purpose.

## 7. Adding a new agent
1. `supabase functions new my-new-agent` (deterministic — no paid SDK).
2. Read/aggregate from your tables, always filtered by `company_id`.
3. Insert a row into `ai_agents_registry` (name must map to the function name).
4. Surface its output table in the dashboard.
5. Deploy. The hourly dispatcher will pick it up automatically.
