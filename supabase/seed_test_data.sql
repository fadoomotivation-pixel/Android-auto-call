-- Seed script for testing AI Agents in the dashboard

DO $$
DECLARE
    v_company_id uuid;
    v_ba_agent_id uuid;
    v_sh_agent_id uuid;
BEGIN
    -- Assume we have at least one company
    SELECT id INTO v_company_id FROM public.companies LIMIT 1;
    
    IF v_company_id IS NULL THEN
        RAISE NOTICE 'No company found. Please create a company first.';
        RETURN;
    END IF;

    -- 1. Register the Agents
    INSERT INTO public.ai_agents_registry (name, description, is_active, schedule, config)
    VALUES 
        ('Business Analyst', 'Daily KPI computation and narrative digest', true, '50 23 * * *', '{"monthly_cost_cap_usd": 50.00, "model": "claude-opus-4-8", "wrap_up_allowance_sec": 30}'),
        ('Sales Head', 'Daily task generation based on insights', true, '0 6 * * *', '{"monthly_cost_cap_usd": 50.00, "model": "claude-3-haiku-20240307"}')
    RETURNING id INTO v_ba_agent_id;

    SELECT id INTO v_sh_agent_id FROM public.ai_agents_registry WHERE name = 'Sales Head' LIMIT 1;

    -- 2. Mock some Agent Runs (Audit Log)
    INSERT INTO public.ai_agent_runs (agent_id, company_id, status, logs, tokens_used, cost_usd, started_at, ended_at)
    VALUES 
        (v_ba_agent_id, v_company_id, 'success', 'Processed 1 companies successfully.', 1500, 0.045, now() - interval '2 hours', now() - interval '1 hour 59 minutes'),
        (v_sh_agent_id, v_company_id, 'success', 'Created 3 tasks successfully.', 800, 0.002, now() - interval '1 hour', now() - interval '59 minutes');

    -- 3. Mock AI Insights
    INSERT INTO public.ai_insights (company_id, date, metrics, anomalies, top_problems, top_opportunities, narrative_digest)
    VALUES (
        v_company_id,
        current_date,
        '{"calls_total": 450, "calls_connected": 120, "talk_minutes": 340, "idle_stats": {"rep-id-123": {"idle_pct": 0.25, "under_utilised": true}}}',
        '{"connect_rate_drop": "Rep John Doe dropped 30% connect rate"}',
        ARRAY['High number of busy outcomes during 2PM-4PM block', 'Rep Jane Smith has 45 idle leads untouched'],
        ARRAY['Recent Facebook leads have a 40% higher connect rate', 'Follow-up with Not Interested leads yielded 2 bookings'],
        'Overall, the team maintained solid call volume today, but efficiency dipped in the afternoon. The drop in John''s connect rate is dragging the average down. Focus tomorrow on clearing Jane''s idle leads.'
    )
    ON CONFLICT (company_id, date) DO UPDATE 
    SET narrative_digest = EXCLUDED.narrative_digest;

    -- 4. Mock AI Tasks (Assuming there's a profile to assign to, if not we skip assignee_id or use the first one)
    DECLARE
        v_profile_id uuid;
    BEGIN
        SELECT id INTO v_profile_id FROM public.profiles WHERE company_id = v_company_id LIMIT 1;

        IF v_profile_id IS NOT NULL THEN
            INSERT INTO public.ai_tasks (company_id, assignee_id, agent_source, title, description, priority, status)
            VALUES 
                (v_company_id, v_profile_id, v_sh_agent_id, 'Coach John on Connect Rates', 'Review calls from John to see why connect rate dropped 30%.', 'high', 'pending'),
                (v_company_id, v_profile_id, v_sh_agent_id, 'Clear Idle Leads', 'Prioritize the 45 stale leads first thing tomorrow.', 'high', 'pending');
        END IF;
    END;
    
END $$;
