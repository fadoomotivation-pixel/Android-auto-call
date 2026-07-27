"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";

interface Row {
  company_id: string;
  company_name: string | null;
  auto_distribute: boolean;
  require_checkin: boolean;
  enforce_geofence: boolean;
  office_lat: number | null;
  office_lng: number | null;
  radius_m: number;
  max_new_backlog: number;
  pool_waiting: number;
  salesperson_id: string | null;
  rep_name: string | null;
  on_shift: boolean | null;
  geo_ok: boolean | null;
  distance_m: number | null;
  punch_in_at: string | null;
  assigned_today: number;
  backlog: number;
  capacity: number;
}

interface Policy {
  company_id: string;
  auto_distribute: boolean;
  require_checkin: boolean;
  enforce_geofence: boolean;
  office_lat: number | null;
  office_lng: number | null;
  radius_m: number;
  max_new_backlog: number;
}

const ist = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) : "—";

/**
 * Pull "28.6139, 77.2090" out of whatever the manager pasted — a bare pair, a
 * Google Maps URL, a "share place" link. Asking a non-technical owner to find
 * latitude and longitude separately is how a geofence ends up never configured.
 */
function parseCoords(text: string): { lat: number; lng: number } | null {
  const m = text.match(/(-?\d{1,3}\.\d{3,})[,\s/@]+(-?\d{1,3}\.\d{3,})/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export function RoutingBoard({ isSuper }: { isSuper: boolean }) {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pin, setPin] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setErr(null);
    const { data, error } = await supabase.rpc("routing_board");
    if (error) { setErr(error.message); return; }
    setRows((data as Row[]) ?? []);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  // One entry per company, carrying its policy and its reps.
  const companies = useMemo(() => {
    const map = new Map<string, { policy: Policy; name: string; pool: number; reps: Row[] }>();
    for (const r of rows ?? []) {
      if (!map.has(r.company_id)) {
        map.set(r.company_id, {
          name: r.company_name ?? "Company",
          pool: r.pool_waiting,
          policy: {
            company_id: r.company_id,
            auto_distribute: r.auto_distribute,
            require_checkin: r.require_checkin,
            enforce_geofence: r.enforce_geofence,
            office_lat: r.office_lat,
            office_lng: r.office_lng,
            radius_m: r.radius_m,
            max_new_backlog: r.max_new_backlog,
          },
          reps: [],
        });
      }
      if (r.salesperson_id) map.get(r.company_id)!.reps.push(r);
    }
    return [...map.values()].sort((a, b) => b.pool - a.pool || a.name.localeCompare(b.name));
  }, [rows]);

  async function savePolicy(p: Policy, patch: Partial<Policy>) {
    setBusy(p.company_id); setErr(null); setMsg(null);
    const row = { ...p, ...patch, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("lead_routing_policy").upsert(row, { onConflict: "company_id" });
    setBusy(null);
    if (error) { setErr(error.message); return; }
    await load();
  }

  async function setOffice(p: Policy, text: string) {
    const c = parseCoords(text);
    if (!c) { setErr("Coordinates samajh nahi aaye. Google Maps me office pe long-press karke jo number aata hai (jaise 28.6139, 77.2090) wo paste karein."); return; }
    await savePolicy(p, { office_lat: c.lat, office_lng: c.lng });
    setPin((s) => ({ ...s, [p.company_id]: "" }));
  }

  async function distributeNow(companyId: string, ignoreGates: boolean) {
    setBusy(companyId); setErr(null); setMsg(null);
    const { data, error } = await supabase.rpc("assign_pool", {
      p_company: companyId, p_limit: 200, p_ignore_gates: ignoreGates,
    });
    setBusy(null);
    if (error) { setErr(error.message); return; }
    const d = data as { assigned?: number; note?: string; per_rep?: Record<string, number> };
    setMsg(
      d?.assigned
        ? `${d.assigned} leads baant di — ${Object.entries(d.per_rep ?? {}).map(([n, k]) => `${n}: ${k}`).join(", ")}`
        : d?.note ?? "Kuch baantne layak nahi mila.",
    );
    await load();
  }

  const card: CSSProperties = {
    background: "var(--panel-grad, var(--panel))", border: "1px solid var(--border)",
    borderRadius: 18, padding: 20, marginBottom: 14,
  };
  const label: CSSProperties = { fontSize: 12.5, color: "var(--muted)" };
  const toggle = (on: boolean): CSSProperties => ({
    padding: "5px 13px", borderRadius: 999, cursor: "pointer", fontSize: 12.5, fontWeight: 700,
    border: `1px solid ${on ? "#10b981" : "var(--border)"}`,
    background: on ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.03)",
    color: on ? "#10b981" : "var(--muted)",
  });

  return (
    <>
      <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "12px 0" }}>
        <button className="link" onClick={() => void load()}>Refresh</button>
      </div>

      {err && <div className="error" style={{ marginBottom: 10 }}>{err}</div>}
      {msg && <div style={{ marginBottom: 10, color: "#10b981", fontSize: 13 }}>{msg}</div>}
      {!rows && <div className="empty">Loading…</div>}
      {rows && companies.length === 0 && <div className="empty">No companies to configure.</div>}

      {companies.map(({ policy: p, name, pool, reps }) => {
        const onShift = reps.filter((r) => r.on_shift).length;
        const ready = reps.filter((r) => r.on_shift && r.capacity > 0).length;
        return (
          <div key={p.company_id} style={card}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <strong style={{ color: "#fff", fontSize: 16 }}>{name}</strong>
              <span style={label}>
                {onShift}/{reps.length} on shift · {ready} lead le sakte hain
              </span>
              <span style={{ marginLeft: "auto", fontSize: 13, color: pool > 0 ? "#f59e0b" : "var(--muted)", fontWeight: pool > 0 ? 700 : 400 }}>
                {pool} leads waiting
              </span>
            </div>

            {/* --- the three switches --- */}
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button style={toggle(p.auto_distribute)} disabled={busy === p.company_id}
                  onClick={() => savePolicy(p, { auto_distribute: !p.auto_distribute })}>
                  {p.auto_distribute ? "ON" : "OFF"}
                </button>
                <span style={label}>Auto-distribute waiting leads</span>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button style={toggle(p.require_checkin)} disabled={busy === p.company_id}
                  onClick={() => savePolicy(p, { require_checkin: !p.require_checkin })}>
                  {p.require_checkin ? "ON" : "OFF"}
                </button>
                <span style={label}>Only after check-in</span>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button style={toggle(p.enforce_geofence)} disabled={busy === p.company_id}
                  onClick={() => savePolicy(p, { enforce_geofence: !p.enforce_geofence })}>
                  {p.enforce_geofence ? "ON" : "OFF"}
                </button>
                <span style={label}>Check-in office ke andar ho</span>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={label}>Max untouched &quot;new&quot;</span>
                <select value={p.max_new_backlog} disabled={busy === p.company_id}
                  onChange={(e) => savePolicy(p, { max_new_backlog: Number(e.target.value) })}
                  style={{ width: "auto", padding: "5px 9px", fontSize: 12.5 }}>
                  {[3, 5, 8, 10, 15, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>

            {/* --- office pin --- */}
            {p.enforce_geofence && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.07)" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={label}>Office location</span>
                  <strong style={{ color: "#fff", fontSize: 13 }}>
                    {p.office_lat != null && p.office_lng != null
                      ? `${p.office_lat.toFixed(5)}, ${p.office_lng.toFixed(5)}`
                      : "not set — fence abhi kaam nahi kar raha"}
                  </strong>
                  <span style={label}>within</span>
                  <select value={p.radius_m} disabled={busy === p.company_id}
                    onChange={(e) => savePolicy(p, { radius_m: Number(e.target.value) })}
                    style={{ width: "auto", padding: "5px 9px", fontSize: 12.5 }}>
                    {[100, 200, 300, 500, 1000, 2000].map((n) => <option key={n} value={n}>{n} m</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <input
                    value={pin[p.company_id] ?? ""}
                    onChange={(e) => setPin((s) => ({ ...s, [p.company_id]: e.target.value }))}
                    placeholder="Paste Google Maps coordinates or link — e.g. 28.6139, 77.2090"
                    style={{ flex: 1, minWidth: 260 }}
                  />
                  <button className="link" disabled={busy === p.company_id}
                    onClick={() => setOffice(p, pin[p.company_id] ?? "")}>Set office</button>
                </div>
                <div style={{ ...label, marginTop: 6 }}>
                  Google Maps kholein → office pe der tak dabayein → neeche jo numbers aayein wo copy karke yahan paste kar dein.
                </div>
              </div>
            )}

            {/* --- who is on shift right now --- */}
            <div style={{ marginTop: 14 }}>
              {reps.length === 0 ? (
                <div style={label}>No active telecallers in this company.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[...reps].sort((a, b) => Number(b.on_shift) - Number(a.on_shift)).map((r) => (
                    <div key={r.salesperson_id!} style={{ display: "flex", gap: 10, alignItems: "center",
                      flexWrap: "wrap", paddingTop: 7, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                      <span style={{ fontSize: 15 }}>{r.on_shift ? "🟢" : "⚪"}</span>
                      <strong style={{ color: "#fff", fontSize: 13.5, minWidth: 110 }}>{r.rep_name ?? "Telecaller"}</strong>
                      <span style={label}>
                        {r.punch_in_at ? `in ${ist(r.punch_in_at)}` : "not checked in"}
                        {r.geo_ok === false && (
                          <span style={{ color: "#ef4444", fontWeight: 700 }}>
                            {" "}· {r.distance_m != null ? `${r.distance_m} m away — outside fence` : "location off"}
                          </span>
                        )}
                        {r.geo_ok === true && r.distance_m != null && <> · {r.distance_m} m from office ✓</>}
                      </span>
                      <span style={{ ...label, marginLeft: "auto" }}>
                        aaj {r.assigned_today} mili · {r.backlog} untouched ·{" "}
                        <strong style={{ color: r.capacity > 0 ? "#10b981" : "#f59e0b" }}>
                          {r.capacity > 0 ? `${r.capacity} aur le sakti/sakta hai` : "full — agle ko jayegi"}
                        </strong>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {pool > 0 && (
              <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
                <button className="link" disabled={busy === p.company_id}
                  onClick={() => distributeNow(p.company_id, false)}>
                  Distribute now (rules ke saath)
                </button>
                <button className="link" disabled={busy === p.company_id}
                  onClick={() => distributeNow(p.company_id, true)}
                  style={{ color: "#f59e0b" }}>
                  Force — ignore check-in &amp; limit
                </button>
              </div>
            )}
          </div>
        );
      })}

      <p className="subtitle" style={{ marginTop: 14, lineHeight: 1.6 }}>
        <strong>Kaise chalta hai:</strong> raat 3 baje aayi lead kisi ko nahi jaati — wo waiting pool me rukti hai.
        Jaise hi koi telecaller office ke andar se check-in karta hai, uske hisse ki leads turant chali jaati hain,
        ek-ek karke bari-bari (round robin). Jiske paas pehle se {"{"}limit{"}"} se zyada bina chhui &quot;new&quot; leads
        padi hain, use nayi lead nahi jaati — wo agle ke paas chali jaati hai. Facebook, website form aur webhook —
        sab ek hi rule se guzarte hain.
        {isSuper && " Super admin har company ke liye ye alag-alag set kar sakta hai."}
      </p>
    </>
  );
}
