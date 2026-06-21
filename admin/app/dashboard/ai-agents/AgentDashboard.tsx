import React, { useState } from 'react';

const mockInsights = {
  date: new Date().toISOString().split('T')[0],
  metrics: {
    calls_total: 450,
    calls_connected: 120,
    talk_minutes: 340,
    idle_stats: {
      "rep-123": { idle_pct: 0.25, under_utilised: true, idle_blocks: 2 }
    }
  },
  anomalies: {
    connect_rate_drop: "Rep 'John Doe' had a 30% drop in connect rate compared to last week."
  },
  top_problems: [
    "High number of 'busy' outcomes during 2PM-4PM block.",
    "Rep 'Jane Smith' has 45 idle leads untouched for 3 days."
  ],
  top_opportunities: [
    "Recent Facebook leads have a 40% higher connect rate; prioritize calling these.",
    "Following up with 'Not Interested' leads from 3 months ago yielded 2 new bookings today."
  ],
  narrative_digest: "Overall, the team maintained solid call volume today, but efficiency dipped in the afternoon. The drop in John's connect rate is dragging the average down. On the bright side, the new Facebook ad campaign leads are highly responsive. Focus tomorrow morning on clearing Jane's idle leads and pushing the Facebook cohort."
};

const mockTasks = [
  { id: 't1', title: 'Coach John on Connect Rates', assignee: 'Manager', priority: 'high', status: 'pending', description: 'Review calls from John to see why his connect rate dropped 30%. Check if he is calling at the right times.', contact_id: null },
  { id: 't2', title: 'Clear Idle Leads', assignee: 'Jane Smith', priority: 'high', status: 'pending', description: 'You have 45 leads that have not been called in 3 days. Please prioritize these first thing tomorrow.', contact_id: null },
  { id: 't3', title: 'Prioritize FB Leads', assignee: 'All Team', priority: 'medium', status: 'in_progress', description: 'Shift focus to the new Facebook cohort as they are converting at a higher rate this week.', contact_id: null }
];

const mockAgentRuns = [
  { id: 'r1', agent: 'Business Analyst', status: 'success', started_at: '2026-06-21T08:00:00Z', duration: '45s', tokens: 1500, cost: '$0.045', logs: 'Processed 1 companies successfully.' },
  { id: 'r2', agent: 'Sales Head', status: 'success', started_at: '2026-06-21T08:05:00Z', duration: '12s', tokens: 800, cost: '$0.002', logs: 'Created 3 tasks successfully.' },
  { id: 'r3', agent: 'Data Hygiene Agent', status: 'running', started_at: '2026-06-21T08:15:00Z', duration: '...', tokens: 0, cost: '$0.000', logs: 'Deduplicating leads...' },
];

export default function AgentDashboard() {
  const [tasks, setTasks] = useState(mockTasks);

  const completeTask = (id: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, status: 'done' } : t));
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">AI Employees Dashboard</h1>
        <div className="text-sm text-gray-500">System Cost (MTD): <span className="font-bold text-green-600">$12.45 / $50.00</span></div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Content Area (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Business Analyst Card */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-blue-100 p-2 rounded-lg">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
              </div>
              <h2 className="text-lg font-bold text-gray-800">Business Analyst</h2>
            </div>
            
            <div className="space-y-4">
              <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 p-4 rounded-lg border border-gray-100">
                {mockInsights.narrative_digest}
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-red-50 p-4 rounded-lg">
                  <h3 className="text-sm font-semibold text-red-800 mb-2">Top Problems</h3>
                  <ul className="list-disc pl-4 text-xs text-red-700 space-y-1">
                    {mockInsights.top_problems.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="text-sm font-semibold text-green-800 mb-2">Top Opportunities</h3>
                  <ul className="list-disc pl-4 text-xs text-green-700 space-y-1">
                    {mockInsights.top_opportunities.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              </div>

              {mockInsights.anomalies.connect_rate_drop && (
                <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-md flex items-start gap-2">
                  <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                  <div>
                    <h4 className="text-sm font-semibold text-yellow-800">Anomaly Detected</h4>
                    <p className="text-xs text-yellow-700">{mockInsights.anomalies.connect_rate_drop}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sales Head Card */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-purple-100 p-2 rounded-lg">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
              </div>
              <h2 className="text-lg font-bold text-gray-800">Sales Head (Tasks)</h2>
            </div>

            <div className="space-y-3">
              {tasks.map(task => (
                <div key={task.id} className={`p-4 rounded-lg border ${task.status === 'done' ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200 hover:border-purple-300 transition-colors'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        task.priority === 'high' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {task.priority.toUpperCase()}
                      </span>
                      <h3 className={`text-sm font-bold ${task.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                        {task.title}
                      </h3>
                    </div>
                    {task.status !== 'done' && (
                      <button 
                        onClick={() => completeTask(task.id)}
                        className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                      >
                        Mark Done
                      </button>
                    )}
                  </div>
                  <p className={`text-xs ${task.status === 'done' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {task.description}
                  </p>
                  <div className="mt-2 text-xs text-gray-500 font-medium flex gap-4">
                    <span>Assignee: <span className="text-gray-700">{task.assignee}</span></span>
                    {task.contact_id && <span>Linked Lead: <span className="text-blue-600 underline cursor-pointer">View Lead</span></span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar / Feed Area (1 col) */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-gray-100 p-2 rounded-lg">
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
              <h2 className="text-lg font-bold text-gray-800">Agent Activity Feed</h2>
            </div>
            
            <div className="relative border-l border-gray-200 ml-3 space-y-6 pb-4">
              {mockAgentRuns.map((run, i) => (
                <div key={run.id} className="mb-6 ml-6">
                  <span className={`absolute flex items-center justify-center w-6 h-6 rounded-full -left-3 ring-4 ring-white ${
                    run.status === 'success' ? 'bg-green-100 text-green-600' : 
                    run.status === 'running' ? 'bg-blue-100 text-blue-600 animate-pulse' : 'bg-red-100 text-red-600'
                  }`}>
                    {run.status === 'success' && <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path></svg>}
                    {run.status === 'running' && <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"></path></svg>}
                  </span>
                  <div className="flex justify-between items-start">
                    <h3 className="flex items-center mb-1 text-sm font-semibold text-gray-900">{run.agent}</h3>
                    <time className="block mb-2 text-xs font-normal leading-none text-gray-400">{new Date(run.started_at).toLocaleTimeString()}</time>
                  </div>
                  <p className="text-xs font-normal text-gray-500 mb-2">{run.logs}</p>
                  {run.status === 'success' && (
                    <div className="flex gap-3 text-[10px] font-mono text-gray-400">
                      <span>{run.duration}</span>
                      <span>{run.tokens} tokens</span>
                      <span>{run.cost}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            
          </div>
        </div>

      </div>
    </div>
  );
}
