import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'

// ============================================================================
// AI DISPATCHER — triggered hourly by pg_cron. Invokes every active agent.
// The agents are deterministic and FREE, so there is no cost cap to enforce —
// only the is_active flag gates execution.
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Keep the worker alive until background invocations finish. Without this, the
// Edge runtime can freeze the isolate as soon as we return, dropping in-flight
// fetches so agents never actually run.
function keepAlive(p: Promise<unknown>) {
  // @ts-ignore EdgeRuntime is provided by the Supabase Edge runtime.
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(p)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, serviceKey)

    const { data: agents, error } = await supabase
      .from('ai_agents_registry')
      .select('*')
      .eq('is_active', true)
    if (error) throw error

    const invoked: string[] = []
    for (const agent of agents || []) {
      // "Business Analyst" -> "business-analyst-agent"
      const functionName = agent.name.toLowerCase().replace(/\s+/g, '-') + '-agent'
      const p = fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
        body: JSON.stringify({ agent_id: agent.id, config: agent.config }),
      }).catch((err) => console.error(`Error invoking ${functionName}:`, err))
      keepAlive(p)
      invoked.push(agent.name)
    }

    return new Response(JSON.stringify({ success: true, invoked }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    })
  }
})
