"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AttendanceRecord {
  id: string;
  salesperson_id: string;
  work_date: string;
  punch_in_at: string | null;
  punch_out_at: string | null;
  selfie: string | null;
  location_label: string | null;
  status: string;
  profiles: { full_name: string | null };
}

export function AttendanceTable({ 
  initialData, 
  currentMonth 
}: { 
  initialData: AttendanceRecord[], 
  currentMonth: string 
}) {
  const router = useRouter();
  const [selectedSelfie, setSelectedSelfie] = useState<string | null>(null);

  // Stats
  const todayDate = new Date().toISOString().slice(0, 10);
  const todaysRecords = initialData.filter(r => r.work_date === todayDate);
  const presentToday = todaysRecords.length;
  
  // Late threshold: 09:30 AM IST (which is 04:00 UTC)
  // Let's use local time string comparison for simplicity
  const isLate = (punchInAt: string | null) => {
    if (!punchInAt) return false;
    const d = new Date(punchInAt);
    const timeStr = d.toLocaleTimeString("en-US", { hour12: false, timeZone: "Asia/Kolkata" });
    return timeStr > "09:30:00";
  };

  const lateToday = todaysRecords.filter(r => isLate(r.punch_in_at)).length;

  function handleMonthChange(offset: number) {
    const [y, m] = currentMonth.split("-").map(Number);
    const newDate = new Date(y, m - 1 + offset, 1);
    const newMonth = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, "0")}`;
    router.push(`/dashboard/attendance?month=${newMonth}`);
  }

  function formatTime(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function calculateHours(start: string | null, end: string | null) {
    if (!start) return "—";
    const s = new Date(start).getTime();
    const e = end ? new Date(end).getTime() : Date.now();
    const hrs = Math.floor((e - s) / 3600000);
    const mins = Math.floor(((e - s) % 3600000) / 60000);
    return `${hrs}h ${mins}m`;
  }

  function downloadCsv() {
    const headers = ["Date", "Name", "Status", "Punch In", "Punch Out", "Hours", "Late", "Location"];
    const rows = initialData.map(r => {
      const late = isLate(r.punch_in_at) ? "Yes" : "No";
      return [
        r.work_date,
        r.profiles.full_name || "Unknown",
        r.status,
        formatTime(r.punch_in_at),
        formatTime(r.punch_out_at),
        calculateHours(r.punch_in_at, r.punch_out_at),
        late,
        `"${r.location_label || ""}"`
      ].join(",");
    });
    
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `attendance_${currentMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div style={{ marginTop: 24 }}>
      {/* Top Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="button" onClick={() => handleMonthChange(-1)}>{"<"}</button>
          <strong style={{ fontSize: 16 }}>{currentMonth}</strong>
          <button className="button" onClick={() => handleMonthChange(1)}>{">"}</button>
        </div>
        <button className="button" onClick={downloadCsv}>⬇️ Export CSV</button>
      </div>

      {/* Summary Cards */}
      <div className="cards">
        <div className="card">
          <div className="label">Present Today</div>
          <div className="value">{presentToday}</div>
        </div>
        <div className="card">
          <div className="label">Late Today</div>
          <div className="value" style={{ color: "var(--error)" }}>{lateToday}</div>
        </div>
        <div className="card">
          <div className="label">Total Records ({currentMonth})</div>
          <div className="value">{initialData.length}</div>
        </div>
      </div>

      {/* Table */}
      {initialData.length === 0 ? (
        <div className="empty">No attendance records found for this month.</div>
      ) : (
        <div style={{ overflowX: "auto", marginTop: 20 }}>
          <div className="table-responsive">
<table style={{ minWidth: 800 }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Name</th>
                <th>Status</th>
                <th>Punch In</th>
                <th>Punch Out</th>
                <th>Hours</th>
                <th>Late?</th>
                <th>Location</th>
                <th>Selfie</th>
              </tr>
            </thead>
            <tbody>
              {initialData.map(r => {
                const late = isLate(r.punch_in_at);
                return (
                  <tr key={r.id}>
                    <td>{r.work_date}</td>
                    <td style={{ fontWeight: 500 }}>{r.profiles?.full_name || "—"}</td>
                    <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                    <td>{formatTime(r.punch_in_at)}</td>
                    <td>{r.punch_out_at ? formatTime(r.punch_out_at) : <span style={{color: "var(--muted)"}}>On shift</span>}</td>
                    <td>{calculateHours(r.punch_in_at, r.punch_out_at)}</td>
                    <td>{late ? <span style={{color: "var(--error)"}}>🔴 Yes</span> : "—"}</td>
                    <td style={{ fontSize: 12, maxWidth: 150, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.location_label || ""}>
                      {r.location_label || "—"}
                    </td>
                    <td>
                      {r.selfie ? (
                        <img 
                          src={r.selfie.startsWith("data:") ? r.selfie : `data:image/jpeg;base64,${r.selfie}`} 
                          alt="selfie" 
                          style={{ width: 36, height: 36, borderRadius: "50%", cursor: "pointer", objectFit: "cover", backgroundColor: "#333" }}
                          onClick={() => setSelectedSelfie(r.selfie?.startsWith("data:") ? r.selfie : `data:image/jpeg;base64,${r.selfie}`)}
                        />
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
</div>
        </div>
      )}

      {/* Selfie Modal */}
      {selectedSelfie && (
        <div 
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0, 
            backgroundColor: "rgba(0,0,0,0.8)", zIndex: 1000,
            display: "flex", justifyContent: "center", alignItems: "center"
          }}
          onClick={() => setSelectedSelfie(null)}
        >
          <img src={selectedSelfie} alt="Full Selfie" style={{ maxWidth: "90%", maxHeight: "90%", borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}

