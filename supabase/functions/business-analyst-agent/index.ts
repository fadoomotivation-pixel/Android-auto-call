import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'

// ============================================================================
// BUSINESS ANALYST AGENT — 100% FREE / DETERMINISTIC (no LLM, no paid API)
// ----------------------------------------------------------------------------
// Computes daily KPIs, idle-time and week-over-week anomalies straight from
// call_logs + attendance, then writes a TEMPLATED narrative into ai_insights.
// Runs entirely on the Supabase free tier. Cost per run = $0.
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Call outcomes we treat as a "successful connect" vs an unproductive attempt.
const CONNECTED_OUTCOMES = ['connected']
const NO_ANSWER_OUTCOMES = ['no_answer', 'busy', 'rejected', 'cancelled', 'voicemail']

// Build the UTC instant range for a given IST (Asia/Kolkata, UTC+5:30) calendar day.
function istDateString(d = new Date()): string {
  return new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().split('T')[0]
}
function istDayRangeUtc(istDate: string): { start: string; end: string } {
  const start = new Date(new Date(`${istDate}T00:00:00Z`).getTime() - 5.5 * 3600 * 1000)
  const end = new Date(start.getTime() + 24 * 3600 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}
function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const { agent_id, config } = await req.json().catch(() => ({ agent_id: null, config: {} }))
  const cfg = config || {}
  const wrapUp = Number(cfg.wrap_up_allowance_sec ?? 30)
  const breakAllowSec = Number(cfg.break_allowance_min ?? 60) * 60
  const connectDrop = Number(cfg.connect_drop_threshold ?? 0.25)
  const idlePctThreshold = Number(cfg.idle_pct_threshold ?? 0.40)
  const noAnswerThreshold = Number(cfg.no_answer_rate_threshold ?? 0.50)
  const minCallsForRate = Number(cfg.min_calls_for_rate ?? 5)

  // Open an audit row so the dashboard shows the run (cost is always $0 here).
  let runId: string | null = null
  if (agent_id) {
    const { data: run } = await supabase
      .from('ai_agent_runs')
      .insert({ agent_id, status: 'running', logs: 'Business Analyst (deterministic) started' })
      .select('id').single()
    runId = run?.id ?? null
  }

  try {
    const today = istDateString()
    const { start, end } = istDayRangeUtc(today)
    const weekAgo = new Date(new Date(start).getTime() - 7 * 24 * 3600 * 1000).toISOString()

    const { data: companies } = await supabase.from('companies').select('id, name')
    const results: unknown[] = []

    for (const company of companies || []) {
      // Active salespeople for this company — tenant isolation.
      const { data: reps } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('company_id', company.id)
        .eq('role', 'salesperson')
        .eq('is_active', true)
      const repName: Record<string, string> = {}
      for (const r of reps || []) repName[r.id] = r.full_name || 'Unknown'

      // Today's calls + the trailing 7 days (for week-over-week), scoped by company.
      const { data: todayCalls } = await supabase
        .from('call_logs')
        .select('salesperson_id, outcome, duration_seconds, created_at')
        .eq('company_id', company.id)
        .gte('created_at', start).lt('created_at', end)
      const { data: prevCalls } = await supabase
        .from('call_logs')
        .select('outcome')
        .eq('company_id', company.id)
        .gte('created_at', weekAgo).lt('created_at', start)

      // Today's attendance, scoped by company.
      const { data: attendance } = await supabase
        .from('attendance')
        .select('salesperson_id, punch_in_at, punch_out_at')
        .eq('company_id', company.id)
        .eq('work_date', today)

      const calls = todayCalls || []
      const totalCalls = calls.length
      const connected = calls.filter((c) => CONNECTED_OUTCOMES.includes(c.outcome)).length
      const noAnswer = calls.filter((c) => NO_ANSWER_OUTCOMES.includes(c.outcome)).length
      const connectRate = pct(connected, totalCalls)
      const noAnswerRate = pct(noAnswer, totalCalls)

      // Trailing-7-day company connect rate (the WoW baseline).
      const prevTotal = (prevCalls || []).length
      const prevConnected = (prevCalls || []).filter((c) => CONNECTED_OUTCOMES.includes(c.outcome)).length
      const prevConnectRate = pct(prevConnected, prevTotal)

      // Per-rep aggregates + idle time.
      const idleStats: Record<string, Record<string, number | string>> = {}
      const repRates: { id: string; rate: number; calls: number; connected: number }[] = []
      for (const att of attendance || []) {
        const repId = att.salesperson_id
        const repCalls = calls
          .filter((c) => c.salesperson_id === repId)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

        const punchIn = new Date(att.punch_in_at).getTime()
        const punchOut = att.punch_out_at
          ? new Date(att.punch_out_at).getTime()
          : (repCalls.length ? new Date(repCalls[repCalls.length - 1].created_at).getTime() : punchIn)
        const shiftSec = Math.max(0, (punchOut - punchIn) / 1000)

        let productiveSec = 0
        let idleBlocks = 0
        let lastActivity = punchIn
        for (const c of repCalls) {
          const dur = c.duration_seconds || 0
          productiveSec += dur + wrapUp
          const gapSec = (new Date(c.created_at).getTime() - lastActivity) / 1000
          if (gapSec > 15 * 60) idleBlocks++
          lastActivity = new Date(c.created_at).getTime() + dur * 1000
        }
        const idleSec = Math.max(0, shiftSec - productiveSec)
        const idlePct = shiftSec > 0 ? idleSec / shiftSec : 0
        const repConnected = repCalls.filter((c) => CONNECTED_OUTCOMES.includes(c.outcome)).length
        repRates.push({ id: repId, rate: pct(repConnected, repCalls.length), calls: repCalls.length, connected: repConnected })

        idleStats[repId] = {
          name: repName[repId] || 'Unknown',
          shift_seconds: Math.round(shiftSec),
          productive_seconds: Math.round(productiveSec),
          idle_seconds: Math.round(idleSec),
          idle_pct: Math.round(idlePct * 1000) / 10,
          idle_blocks: idleBlocks,
          calls: repCalls.length,
          connected: repConnected,
        }
      }

      // ----- Deterministic anomaly RULES (no LLM) -----
      const anomalies: Record<string, string> = {}
      if (prevConnectRate > 0 && (prevConnectRate - connectRate) / prevConnectRate > connectDrop) {
        anomalies['connect_rate_drop'] =
          `Team connect rate fell to ${connectRate}% from a 7-day avg of ${prevConnectRate}%.`
      }
      if (totalCalls >= minCallsForRate && noAnswerRate / 100 > noAnswerThreshold) {
        anomalies['high_no_answer'] = `No-answer rate is ${noAnswerRate}% of ${totalCalls} calls.`
      }
      for (const r of repRates) {
        const stat = idleStats[r.id]
        if (r.calls > 0 && r.connected === 0) {
          anomalies[`rep_zero_connect_${r.id}`] = `${repName[r.id]} made ${r.calls} calls with 0 connects.`
        }
        if (stat && (stat.idle_pct as number) / 100 > idlePctThreshold && (stat.idle_seconds as number) > breakAllowSec) {
          anomalies[`rep_idle_${r.id}`] = `${repName[r.id]} was idle ${stat.idle_pct}% of the shift.`
        }
      }

      // ----- top problems / opportunities (ranked rule output) -----
      const ranked = repRates.filter((r) => r.calls >= minCallsForRate).sort((a, b) => b.rate - a.rate)
      const best = ranked[0]
      const worst = ranked[ranked.length - 1]
      const topProblems = Object.values(anomalies).slice(0, 3)
      const topOpportunities: string[] = []
      if (best) topOpportunities.push(`${repName[best.id]} leads at ${best.rate}% connect rate — share their approach.`)
      if (worst && best && worst.id !== best.id) topOpportunities.push(`Coach ${repName[worst.id]} (${worst.rate}%) toward the team's best.`)
      if (totalCalls < minCallsForRate) topOpportunities.push('Call volume is low today — push more dials to build a reliable signal.')

      // ----- templated narrative (assembled from numbers, not generated) -----
      const narrative =
        `On ${today}, ${company.name} made ${totalCalls} calls (${connectRate}% connected, ` +
        `${noAnswerRate}% no-answer). ` +
        (best ? `Top performer: ${repName[best.id]} at ${best.rate}%. ` : '') +
        (anomalies['connect_rate_drop'] ? `⚠️ ${anomalies['connect_rate_drop']} ` : '') +
        (Object.keys(anomalies).length === 0
          ? 'No anomalies flagged today.'
          : `${Object.keys(anomalies).length} item(s) need attention.`)

      const { data: insight } = await supabase
        .from('ai_insights')
        .upsert({
          company_id: company.id,
          date: today,
          metrics: {
            total_calls: totalCalls,
            connected,
            connect_rate: connectRate,
            no_answer_rate: noAnswerRate,
            prev_connect_rate: prevConnectRate,
            rep_stats: idleStats,
          },
          anomalies,
          top_problems: topProblems,
          top_opportunities: topOpportunities,
          narrative_digest: narrative,
        }, { onConflict: 'company_id, date' })
        .select().single()
      if (insight) results.push(insight)
    }

    if (runId) {
      await supabase.from('ai_agent_runs').update({
        status: 'success', ended_at: new Date().toISOString(),
        tokens_used: 0, cost_usd: 0,
        logs: `Processed ${results.length} companies (deterministic, $0)`,
      }).eq('id', runId)
    }

    return new Response(JSON.stringify({ success: true, processed: results.length }), {
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
