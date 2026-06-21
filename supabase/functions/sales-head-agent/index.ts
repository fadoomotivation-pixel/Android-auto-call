import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'

// ============================================================================
// SALES HEAD AGENT — 100% FREE / DETERMINISTIC (no LLM, no paid API)
// ----------------------------------------------------------------------------
// Reads today's ai_insights + raw data and generates prioritized ai_tasks via
// rules: coaching tasks for under-target reps, follow-up tasks for stale leads.
// Idempotent per day (clears its own pending tasks first). Cost per run = $0.
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function istDateString(d = new Date()): string {
  return new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().split('T')[0]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const { agent_id, config } = await req.json().catch(() => ({ agent_id: null, config: {} }))
  const cfg = config || {}
  const targetConnectRate = Number(cfg.target_connect_rate ?? 40) // percent
  const targetCalls = Number(cfg.target_calls_per_rep ?? 30)
  const staleDays = Number(cfg.stale_days ?? 3)
  const topN = Number(cfg.max_tasks_per_company ?? 10)
  const closedStatuses: string[] = cfg.closed_statuses ?? [] // e.g. ['won','lost','dnc']

  let runId: string | null = null
  if (agent_id) {
    const { data: run } = await supabase
      .from('ai_agent_runs')
      .insert({ agent_id, status: 'running', logs: 'Sales Head (deterministic) started' })
      .select('id').single()
    runId = run?.id ?? null
  }

  try {
    const today = istDateString()
    const staleCutoff = new Date(Date.now() - staleDays * 24 * 3600 * 1000).toISOString()
    const { data: companies } = await supabase.from('companies').select('id, name')
    let created = 0

    for (const company of companies || []) {
      // Idempotency: clear this agent's still-pending tasks for the company so we
      // don't pile up duplicates on every run.
      if (agent_id) {
        await supabase.from('ai_tasks')
          .delete()
          .eq('company_id', company.id)
          .eq('agent_source', agent_id)
          .eq('status', 'pending')
      }

      const { data: insight } = await supabase
        .from('ai_insights').select('metrics, anomalies')
        .eq('company_id', company.id).eq('date', today).single()
      const repStats = (insight?.metrics?.rep_stats ?? {}) as Record<string, { name?: string; calls?: number; connected?: number }>

      const tasks: {
        company_id: string; assignee_id: string; contact_id: string | null;
        agent_source: string | null; title: string; description: string; priority: string; status: string;
      }[] = []

      // ----- Coaching tasks: reps below target (rule-based) -----
      for (const [repId, s] of Object.entries(repStats)) {
        const calls = s.calls ?? 0
        const connected = s.connected ?? 0
        const rate = calls > 0 ? Math.round((connected / calls) * 1000) / 10 : 0
        const belowVolume = calls < targetCalls
        const belowRate = calls > 0 && rate < targetConnectRate
        if (belowVolume || belowRate) {
          const reasons: string[] = []
          if (belowVolume) reasons.push(`only ${calls}/${targetCalls} calls`)
          if (belowRate) reasons.push(`${rate}% connect rate (target ${targetConnectRate}%)`)
          tasks.push({
            company_id: company.id, assignee_id: repId, contact_id: null, agent_source: agent_id,
            title: `Coaching: ${s.name ?? 'rep'} below target`,
            description: `Today ${s.name ?? 'this rep'} had ${reasons.join(' and ')}. Review approach and push volume.`,
            priority: connected === 0 ? 'high' : 'medium', status: 'pending',
          })
        }
      }

      // ----- Follow-up tasks: stale leads (rule-based) -----
      const { data: leads } = await supabase
        .from('contacts')
        .select('id, name, salesperson_id, status, updated_at')
        .eq('company_id', company.id)
        .not('salesperson_id', 'is', null)
        .lt('updated_at', staleCutoff)
        .order('updated_at', { ascending: true })
        .limit(topN)
      for (const lead of leads || []) {
        if (lead.status && closedStatuses.includes(String(lead.status))) continue
        tasks.push({
          company_id: company.id, assignee_id: lead.salesperson_id, contact_id: lead.id, agent_source: agent_id,
          title: `Follow up: ${lead.name ?? 'lead'} going cold`,
          description: `No activity on this lead since ${String(lead.updated_at).split('T')[0]}. Re-engage before it's lost.`,
          priority: 'medium', status: 'pending',
        })
      }

      // Prioritize (high first) and cap at topN.
      const order: Record<string, number> = { high: 0, medium: 1, low: 2 }
      const capped = tasks.sort((a, b) => order[a.priority] - order[b.priority]).slice(0, topN)
      if (capped.length) {
        const { data: inserted } = await supabase.from('ai_tasks').insert(capped).select('id')
        created += inserted?.length ?? 0
      }
    }

    if (runId) {
      await supabase.from('ai_agent_runs').update({
        status: 'success', ended_at: new Date().toISOString(),
        tokens_used: 0, cost_usd: 0, logs: `Created ${created} tasks (deterministic, $0)`,
      }).eq('id', runId)
    }

    return new Response(JSON.stringify({ success: true, tasks_created: created }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    })
  } catch (error) {
    if (runId) {
      await supabase.from('ai_agent_runs').update({
        status: 'failed', ended_at: new Date().toISOString(),
        tokens_used: 0, cost_usd: 0, logs: `Error: ${(error as Error).message}`,
      }).eq('id', runId)
    }
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    })
  }
})
