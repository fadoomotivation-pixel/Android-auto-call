"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ReportBuilder({ companyId }: { companyId: string }) {
  const supabase = createClient();
  const [reportType, setReportType] = useState("team_performance");
  const [dateRange, setDateRange] = useState("this_week");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [columns, setColumns] = useState<{key: string, label: string}[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function generateReport() {
    setLoading(true);
    setErrorMsg(null);
    let startDate = new Date();
    let endDate = new Date();
    
    if (dateRange === "this_week") {
      const day = startDate.getDay();
      const diff = startDate.getDate() - day + (day === 0 ? -6 : 1); // Monday
      startDate.setDate(diff);
      startDate.setHours(0,0,0,0);
    } else if (dateRange === "last_week") {
      const day = startDate.getDay();
      const diff = startDate.getDate() - day + (day === 0 ? -6 : 1) - 7;
      startDate.setDate(diff);
      startDate.setHours(0,0,0,0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23,59,59,999);
    } else if (dateRange === "this_month") {
      startDate.setDate(1);
      startDate.setHours(0,0,0,0);
    }

    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    let finalStats: any[] = [];

    if (reportType === "team_performance") {
      // Need calls, connected, talk time per salesperson
      const { data: calls } = await supabase
        .from("call_logs")
        .select("salesperson_id, outcome, duration_seconds")
        .eq("company_id", companyId)
        .gte("created_at", startIso)
        .lte("created_at", endIso);
      
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("company_id", companyId);

      const stats = (profiles || []).map(p => {
        const pCalls = (calls || []).filter(c => c.salesperson_id === p.id);
        const connected = pCalls.filter(c => c.outcome === "connected");
        const talkSecs = pCalls.reduce((s, c) => s + (c.duration_seconds || 0), 0);
        
        return {
          name: p.full_name || "Unknown",
          total_calls: pCalls.length,
          connected: connected.length,
          connect_rate: pCalls.length ? Math.round((connected.length / pCalls.length) * 100) + "%" : "0%",
          talk_time: Math.floor(talkSecs / 60) + "m " + (talkSecs % 60) + "s"
        };
      });

      setColumns([
        { key: "name", label: "Salesperson" },
        { key: "total_calls", label: "Total Calls" },
        { key: "connected", label: "Connected" },
        { key: "connect_rate", label: "Connect Rate" },
        { key: "talk_time", label: "Talk Time" }
      ]);
      finalStats = stats;
      setData(stats);
      
    } else if (reportType === "attendance") {
      const { data: att } = await supabase
        .from("attendance")
        .select("salesperson_id, work_date, status, punch_in_at")
        .eq("company_id", companyId)
        .gte("work_date", startIso.slice(0,10))
        .lte("work_date", endIso.slice(0,10));
      
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("company_id", companyId);

      const isLate = (iso: string | null) => {
        if (!iso) return false;
        const d = new Date(iso);
        const timeStr = d.toLocaleTimeString("en-US", { hour12: false, timeZone: "Asia/Kolkata" });
        return timeStr > "09:30:00";
      };

      const stats = (profiles || []).map(p => {
        const pAtt = (att || []).filter(a => a.salesperson_id === p.id);
        return {
          name: p.full_name || "Unknown",
          days_present: pAtt.filter(a => a.status === "present").length,
          days_late: pAtt.filter(a => isLate(a.punch_in_at)).length,
          days_absent: pAtt.filter(a => a.status === "absent").length
        };
      });

      setColumns([
        { key: "name", label: "Salesperson" },
        { key: "days_present", label: "Days Present" },
        { key: "days_late", label: "Days Late" },
        { key: "days_absent", label: "Days Absent" }
      ]);
      finalStats = stats;
      setData(stats);
      
    } else if (reportType === "pipeline") {
      const { data: contacts } = await supabase
        .from("contacts")
        .select("status, temperature")
        .eq("company_id", companyId);
        // Pipeline is usually a snapshot of current state, so we ignore date range

      const counts: Record<string, number> = {};
      const temps: Record<string, number> = { hot: 0, warm: 0, cold: 0, unassigned: 0 };
      
      (contacts || []).forEach(c => {
        counts[c.status] = (counts[c.status] || 0) + 1;
        if (c.temperature) temps[c.temperature]++;
        else temps.unassigned++;
      });

      const stats = [
        ...Object.entries(counts).map(([k, v]) => ({ metric: `Stage: ${k}`, count: v })),
        { metric: "---", count: "---" },
        ...Object.entries(temps).map(([k, v]) => ({ metric: `Temperature: ${k}`, count: v }))
      ];

      setColumns([
        { key: "metric", label: "Metric" },
        { key: "count", label: "Count" }
      ]);
      finalStats = stats;
      setData(stats);
    }

    if (finalStats.length === 0) {
      setErrorMsg("No data found for this date range.");
      setData([]);
    }

    setLoading(false);
  }

  function downloadCsv() {
    if (!data.length) return;
    const headers = columns.map(c => c.label);
    const rows = data.map(row => columns.map(c => `"${row[c.key]}"`).join(","));
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${reportType}_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function downloadPdf() {
    window.print();
  }

  return (
    <div style={{ marginTop: 24 }}>
      {/* Controls (hidden during print) */}
      <div className="no-print card" style={{ display: "flex", gap: 16, alignItems: "flex-end", marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Report Type</label>
          <select 
            value={reportType} 
            onChange={e => setReportType(e.target.value)}
            style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)" }}
          >
            <option value="team_performance">Team Performance (Calls & Conversions)</option>
            <option value="attendance">Attendance Summary</option>
            <option value="pipeline">Lead Pipeline Snapshot</option>
          </select>
        </div>
        
        <div style={{ flex: 1 }}>
          <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Date Range</label>
          <select 
            value={dateRange} 
            onChange={e => setDateRange(e.target.value)}
            disabled={reportType === "pipeline"}
            style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)" }}
          >
            <option value="this_week">This Week</option>
            <option value="last_week">Last Week</option>
            <option value="this_month">This Month</option>
          </select>
        </div>

        <button 
          onClick={generateReport}
          disabled={loading}
          style={{ background: "var(--primary)", color: "white", padding: "10px 16px", borderRadius: 6, border: "none", fontWeight: 600, cursor: "pointer" }}
        >
          {loading ? "Generating..." : "Generate Report"}
        </button>
      </div>

      {errorMsg && (
        <div className="card" style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #f87171", marginBottom: 24 }}>
          {errorMsg}
        </div>
      )}

      {/* Results (Printable Area) */}
      {data.length > 0 && (
        <div className="printable-report">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>
              {reportType === "team_performance" && "Team Performance Report"}
              {reportType === "attendance" && "Attendance Summary"}
              {reportType === "pipeline" && "Lead Pipeline Snapshot"}
            </h3>
            <div className="no-print" style={{ display: "flex", gap: 8 }}>
              <button className="button" onClick={downloadCsv}>⬇️ CSV</button>
              <button className="button" onClick={downloadPdf}>🖨️ Print / PDF</button>
            </div>
          </div>
          
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
            {reportType !== "pipeline" && `Date Range: ${dateRange.replace("_", " ")}`}
          </div>

          <div className="table-responsive">
<table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {columns.map(c => (
                  <th key={c.key} style={{ textAlign: "left", padding: "10px 12px", borderBottom: "2px solid var(--border)", color: "var(--muted)" }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i}>
                  {columns.map(c => (
                    <td key={c.key} style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
                      {row[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
</div>
          
          <style dangerouslySetInnerHTML={{__html: `
            @media print {
              body * { visibility: hidden; }
              .printable-report, .printable-report * { visibility: visible; }
              .printable-report { position: absolute; left: 0; top: 0; width: 100%; }
              .no-print { display: none !important; }
              table { border: 1px solid #ddd; }
              th, td { border: 1px solid #ddd !important; padding: 8px !important; color: black !important; }
              th { background-color: #f5f5f5 !important; -webkit-print-color-adjust: exact; }
            }
          `}} />
        </div>
      )}
    </div>
  );
}

