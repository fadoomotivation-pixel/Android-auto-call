# Agentic AI Employees

This directory contains the Edge Functions for the Telecaller CRM AI Agents.

## 1. Environment Variables
You need to set the following secrets in your Supabase project:
```bash
supabase secrets set ANTHROPIC_API_KEY="sk-ant-api03-..."
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="..."
supabase secrets set SUPABASE_URL="https://your-project.supabase.co"
```

## 2. Deployment
Deploy the edge functions using the Supabase CLI:
```bash
supabase functions deploy business-analyst-agent
supabase functions deploy sales-head-agent
```

## 3. Scheduling & Dispatcher
Instead of scheduling each agent individually, this system uses a central `ai-dispatcher` that respects the `is_active` flag and the `monthly_cost_cap_usd` set in the agent's configuration.

Run the dispatcher once an hour (or as frequently as needed). It will decide which agents to invoke based on their schedules and cost limits:

```sql
-- Schedule the central AI Dispatcher
select cron.schedule(
  'ai-dispatcher-hourly',
  '0 * * * *',
  $$
    select net.http_post(
      url:='https://<your-project-ref>.supabase.co/functions/v1/ai-dispatcher',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
    )
  $$
);
```

### Monitoring
Check the `ai_agent_runs` table in your database to see an audit log of every execution, including success/failure, tokens used, and the logs.

## 4. How to add a new agent
1. Run `supabase functions new my-new-agent`.
2. Add your Deno edge function logic using `@anthropic-ai/sdk`.
3. Insert a record into `ai_agents_registry` for visibility:
   ```sql
   INSERT INTO ai_agents_registry (name, description, schedule) 
   VALUES ('My New Agent', 'Does X and Y', '0 * * * *');
   ```
4. Update the Next.js Dashboard (`admin/app/dashboard/ai-agents/AgentDashboard.tsx`) to pull data from your new agent's output table.
5. Deploy and add a new pg_cron schedule.
