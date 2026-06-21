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

    const { agent_id, config } = await req.json().catch(() => ({}))
    const model = config?.model || 'claude-3-haiku-20240307' // Sales head uses the same or cheaper model for tasks
    
    let runId = null
    if (agent_id) {
      const { data: run } = await supabaseClient
        .from('ai_agent_runs')
        .insert({ agent_id, status: 'running', logs: 'Started Sales Head Agent' })
        .select('id').single()
      runId = run?.id
    }

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '' })
    const date = new Date().toISOString().split('T')[0]

    // 1. Fetch companies
    const { data: companies } = await supabaseClient.from('companies').select('id, name')
    const results = []

    for (const company of companies || []) {
      const { data: insights } = await supabaseClient.from('ai_insights').select('*').eq('company_id', company.id).eq('date', date).single()
      const { data: reps } = await supabaseClient.from('profiles').select('id, full_name, role').eq('company_id', company.id)
      
      // Fetch some stalling leads to assign
      const { data: leads } = await supabaseClient.from('contacts').select('id, name, status').eq('company_id', company.id).limit(10)

      if (!insights || !reps) continue

      const systemPrompt = `You are a Sales Head Agent for a Telecaller CRM. Read daily insights and create tasks for reps/managers.
Output JSON:
{
  "tasks": [
    {
      "assignee_name": "Name from available list",
      "title": "Short title",
      "description": "Details",
      "priority": "high", "medium", or "low",
      "contact_name": "Optional name of lead to follow up with, if applicable"
    }
  ]
}`

      const userPrompt = `Insights: ${JSON.stringify(insights)}
Reps: ${JSON.stringify(reps)}
Sample Leads: ${JSON.stringify(leads)}
Generate actionable tasks.`

      const response = await anthropic.messages.create({
        model: model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })

      const content = response.content[0].type === 'text' ? response.content[0].text : ''
      const jsonStr = content.replace(/```json\n?|\n?```/g, '').trim()
      let aiOutput = { tasks: [] }
      try { aiOutput = JSON.parse(jsonStr) } catch(e) {}

      if (aiOutput.tasks) {
        for (const task of aiOutput.tasks) {
          const assignee = reps.find(r => r.full_name && task.assignee_name && r.full_name.toLowerCase().includes(task.assignee_name.toLowerCase()))
          if (!assignee) continue
          
          let contact_id = null
          if (task.contact_name && leads) {
            const lead = leads.find(l => l.name && l.name.toLowerCase().includes(task.contact_name.toLowerCase()))
            if (lead) contact_id = lead.id
          }

          const { data: taskData } = await supabaseClient.from('ai_tasks').insert({
            company_id: company.id,
            assignee_id: assignee.id,
            contact_id: contact_id,
            agent_source: agent_id,
            title: task.title,
            description: task.description,
            priority: task.priority || 'medium',
            status: 'pending'
          }).select().single()

          if (taskData) results.push(taskData)
        }
      }
    }

    if (runId) {
      await supabaseClient.from('ai_agent_runs').update({ status: 'success', ended_at: new Date().toISOString(), logs: 'Created ' + results.length + ' tasks' }).eq('id', runId)
    }

    return new Response(JSON.stringify({ success: true, tasks_created: results.length }), { headers: corsHeaders, status: 200 })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 400 })
  }
})
