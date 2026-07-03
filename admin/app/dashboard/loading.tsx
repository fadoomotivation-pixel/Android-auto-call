export default function DashboardLoading() {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <div className="skeleton" style={{ width: 240, height: 32, marginBottom: 12 }}></div>
          <div className="skeleton" style={{ width: 320, height: 20 }}></div>
        </div>
        <div className="skeleton" style={{ width: 140, height: 40, borderRadius: 10 }}></div>
      </div>

      <div className="cards">
        <div className="card" style={{ height: 120 }}>
          <div className="skeleton" style={{ width: 100, height: 16, marginBottom: 16 }}></div>
          <div className="skeleton" style={{ width: 60, height: 40 }}></div>
        </div>
        <div className="card" style={{ height: 120 }}>
          <div className="skeleton" style={{ width: 100, height: 16, marginBottom: 16 }}></div>
          <div className="skeleton" style={{ width: 60, height: 40 }}></div>
        </div>
        <div className="card" style={{ height: 120 }}>
          <div className="skeleton" style={{ width: 100, height: 16, marginBottom: 16 }}></div>
          <div className="skeleton" style={{ width: 60, height: 40 }}></div>
        </div>
        <div className="card" style={{ height: 120 }}>
          <div className="skeleton" style={{ width: 100, height: 16, marginBottom: 16 }}></div>
          <div className="skeleton" style={{ width: 60, height: 40 }}></div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 32 }}>
        <div className="card" style={{ height: 240 }}>
          <div className="skeleton" style={{ width: 140, height: 20, marginBottom: 24 }}></div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140 }}>
             {[...Array(7)].map((_, i) => (
                <div key={i} className="skeleton" style={{ flex: 1, height: `${Math.max(20, Math.random() * 100)}%`, borderRadius: 6 }}></div>
             ))}
          </div>
        </div>
        <div className="card" style={{ height: 240 }}>
          <div className="skeleton" style={{ width: 140, height: 20, marginBottom: 24 }}></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
             {[...Array(4)].map((_, i) => (
                <div key={i} className="skeleton" style={{ width: "100%", height: 20, borderRadius: 6 }}></div>
             ))}
          </div>
        </div>
      </div>

      <div className="skeleton" style={{ width: 240, height: 24, marginBottom: 16 }}></div>
      <div className="skeleton" style={{ width: "100%", height: 300, borderRadius: 16 }}></div>
    </>
  );
}
