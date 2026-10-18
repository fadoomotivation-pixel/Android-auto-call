"use client";
import { useMemo, useState } from "react";

const inr = (n: number) => (Number.isFinite(n) ? "₹" + Math.round(n).toLocaleString("en-IN") : "—");
const pct = (a: number, b: number) => (b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "—");

export function LeadCostCalculator() {
  const [spend, setSpend] = useState("100000");
  const [leads, setLeads] = useState("500");
  const [visits, setVisits] = useState("25");
  const [bookings, setBookings] = useState("3");
  const o = useMemo(() => {
    const s = Number(spend), l = Number(leads), v = Number(visits), b = Number(bookings);
    return { cpl: l > 0 ? s / l : NaN, cpv: v > 0 ? s / v : NaN, cpb: b > 0 ? s / b : NaN, l2v: pct(v, l), v2b: pct(b, v) };
  }, [spend, leads, visits, bookings]);
  const field = (label: string, v: string, set: (s: string) => void) => (
    <label><span className="st-label">{label}</span>
      <input className="st-in" type="number" inputMode="numeric" min="0" value={v} onChange={(e) => set(e.target.value)} /></label>
  );
  return (
    <>
      <h2>Your campaign</h2>
      <div className="st-card st-pad">
        {field("Meta ad spend (₹)", spend, setSpend)}
        {field("Leads received", leads, setLeads)}
        {field("Site visits done", visits, setVisits)}
        {field("Bookings", bookings, setBookings)}
      </div>
      <h2>Result</h2>
      <div className="st-card">
        <div className="st-row"><span>Cost per booking</span><div className="st-out">{inr(o.cpb)}</div></div>
        <div className="st-row st-kv"><b>Cost per lead</b><span>{inr(o.cpl)}</span></div>
        <div className="st-row st-kv"><b>Cost per site visit</b><span>{inr(o.cpv)}</span></div>
        <div className="st-row st-kv"><b>Lead → site visit</b><span>{o.l2v}</span></div>
        <div className="st-row st-kv"><b>Site visit → booking</b><span>{o.v2b}</span></div>
      </div>
      <p className="st-sub">The default values are only examples, not benchmarks. Use your own numbers from Ads Manager and your CRM.</p>
    </>
  );
}
