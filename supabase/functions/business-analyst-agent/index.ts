import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.20.1'

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

    // Log the run start
    const { agent_id, config } = await req.json().catch(() => ({}))
    const wrap_up_allowance_sec = config?.wrap_up_allowance_sec || 30
    const break_allowance_min = config?.break_allowance_min || 60
    const model = config?.model || 'claude-3-opus-20240229' // Fallback to available model

    let runId = null
    if (agent_id) {
      const { data: run } = await supabaseClient
        .from('ai_agent_runs')
        .insert({ agent_id, status: 'running', logs: 'Started BA Agent' })
        .select('id').single()
      runId = run?.id
    }

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '' })
    const targetDate = new Date().toISOString().split('T')[0]

    // 1. Fetch all companies
    const { data: companies } = await supabaseClient.from('companies').select('id, name')

    const results = []
    for (const company of companies || []) {
      // 2. Read manager_digests
      const { data: digest } = await supabaseClient
        .from('manager_digests')
        .select('*')
        .eq('company_id', company.id)
        .eq('digest_date', targetDate)
        .single()
      
      const stats = digest?.stats || {}

      // Fetch reps for this company to isolate attendance records
      const { data: reps } = await supabaseClient
        .from('profiles')
        .select('id')
        .eq('company_id', company.id)
      
      const repIds = (reps || []).map(r => r.id)

      // 3. Compute Idle Time from attendance and call_logs
      // Fetch attendance and call logs for the day
      const { data: attendance } = await supabaseClient
        .from('attendance')
        .select('*')
        .in('salesperson_id', repIds.length ? repIds : [null]) // Tenant isolation fix
        .eq('work_date', targetDate) 
      
      const { data: calls } = await supabaseClient
        .from('call_logs')
        .select('*')
        .eq('company_id', company.id)
        .gte('created_at', `${targetDate}T00:00:00Z`)
        .lt('created_at', `${targetDate}T23:59:59Z`)
      
      // Calculate idle time per rep
      const idleStats = {}
      if (attendance && calls) {
        for (const att of attendance) {
          const repCalls = calls.filter(c => c.salesperson_id === att.salesperson_id).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          
          let punchIn = new Date(att.punch_in_at).getTime()
          let punchOut = att.punch_out_at ? new Date(att.punch_out_at).getTime() : 
                        (repCalls.length > 0 ? new Date(repCalls[repCalls.length - 1].created_at).getTime() : punchIn)
          
          let shift_seconds = (punchOut - punchIn) / 1000
          
          let productive_seconds = 0
          let idle_blocks = 0
          let idle_blocks_total_sec = 0
          let lastActivityTime = punchIn

          for (const call of repCalls) {
            productive_seconds += (call.duration_seconds || 0) + wrap_up_allowance_sec
            
            let callTime = new Date(call.created_at).getTime()
            let gapSec = (callTime - lastActivityTime) / 1000
            if (gapSec > 15 * 60) { // 15 mins block
              idle_blocks++
              idle_blocks_total_sec += gapSec
            }
            lastActivityTime = callTime + ((call.duration_seconds || 0) * 1000)
          }

          let idle_seconds = Math.max(0, shift_seconds - productive_seconds)
          let idle_pct = shift_seconds > 0 ? idle_seconds / shift_seconds : 0
          
          // Check under-utilised after break allowance
          let under_utilised = (idle_seconds - (break_allowance_min * 60)) > (shift_seconds * 0.2) // e.g. 20% threshold
          
          idleStats[att.salesperson_id] = { shift_seconds, productive_seconds, idle_seconds, idle_pct, idle_blocks, idle_blocks_total_sec, under_utilised }
        }
      }

      // 4. Prompt Claude
      const systemPrompt = `You are an expert Business Analyst. You are given a daily manager digest (quantitative stats) and detailed idle time calculations for reps.
Extract actionable insights:
{
  "anomalies": { "key": "description" },
  "top_problems": ["..."],
  "top_opportunities": ["..."],
  "narrative_digest": "..."
}`

      const userPrompt = `Company: ${company.name} Date: ${targetDate}
Digest Stats: ${JSON.stringify(stats)}
Idle Time Stats: ${JSON.stringify(idleStats)}`

      const response = await anthropic.messages.create({
        model: model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })

      const content = response.content[0].type === 'text' ? response.content[0].text : ''
      const jsonStr = content.replace(/```json\n?|\n?```/g, '').trim()
      let aiOutput = { anomalies: {}, top_problems: [], top_opportunities: [], narrative_digest: '' }
      try { aiOutput = JSON.parse(jsonStr) } catch(e) {}

      // 5. Save to ai_insights
      const { data: insightData } = await supabaseClient
        .from('ai_insights')
        .upsert({
          company_id: company.id,
          date: targetDate,
          metrics: { ...stats, idle_stats: idleStats },
          anomalies: aiOutput.anomalies || {},
          top_problems: aiOutput.top_problems || [],
          top_opportunities: aiOutput.top_opportunities || [],
          narrative_digest: aiOutput.narrative_digest || ''
        }, { onConflict: 'company_id, date' })
        .select().single()

      if (insightData) results.push(insightData)
    }

    if (runId) {
      await supabaseClient.from('ai_agent_runs').update({ status: 'success', ended_at: new Date().toISOString(), logs: 'Processed ' + results.length + ' companies' }).eq('id', runId)
    }

    return new Response(JSON.stringify({ success: true, results }), { headers: corsHeaders, status: 200 })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 400 })
  }
})
