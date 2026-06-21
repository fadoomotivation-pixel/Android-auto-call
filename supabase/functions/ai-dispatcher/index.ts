import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Fetch all active agents
    const { data: agents, error: agentsError } = await supabaseClient
      .from('ai_agents_registry')
      .select('*')
      .eq('is_active', true)
    
    if (agentsError) throw agentsError

    const invoked = []
    const skipped = []

    const currentYear = new Date().getFullYear()
    const currentMonth = new Date().getMonth() + 1
    const startDate = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-01T00:00:00Z`

    for (const agent of agents) {
      // 2. Check cost cap
      const cap = agent.config?.monthly_cost_cap_usd || 50.0

      const { data: costData, error: costError } = await supabaseClient
        .from('ai_agent_runs')
        .select('cost_usd')
        .eq('agent_id', agent.id)
        .gte('started_at', startDate)

      if (costError) {
        console.error('Error fetching cost for agent', agent.id, costError)
        continue
      }

      const totalCost = costData.reduce((sum, run) => sum + (Number(run.cost_usd) || 0), 0)

      if (totalCost >= cap) {
        console.log(`Agent ${agent.name} skipped. Monthly cost ${totalCost} exceeds cap ${cap}`)
        skipped.push({ agent: agent.name, reason: 'cost_cap_exceeded' })
        continue
      }

      // 3. Invoke the agent edge function (assuming function name matches agent name logic, or stored in config)
      // For simplicity, we convert "Business Analyst" to "business-analyst-agent"
      const functionName = agent.name.toLowerCase().replace(/\s+/g, '-') + '-agent'

      // We don't await the fetch so we can dispatch in parallel and not block the dispatcher
      // Actually, better to trigger them asynchronously
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
        },
        body: JSON.stringify({ agent_id: agent.id, config: agent.config })
      }).catch(err => console.error(`Error invoking ${functionName}:`, err))

      invoked.push({ agent: agent.name, functionName })
    }

    return new Response(JSON.stringify({ success: true, invoked, skipped }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
