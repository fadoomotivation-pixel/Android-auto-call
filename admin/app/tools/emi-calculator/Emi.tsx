"use client";
import { useMemo, useState } from "react";

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

// Standard reducing-balance EMI: P·r·(1+r)^n / ((1+r)^n − 1), r = monthly rate.
export function emi(principal: number, annualRatePct: number, months: number) {
  if (principal <= 0 || months <= 0) return 0;
  const r = annualRatePct / 12 / 100;
  if (r === 0) return principal / months;
  const f = Math.pow(1 + r, months);
  return (principal * r * f) / (f - 1);
}

export function EmiCalculator() {
  const [price, setPrice] = useState("5000000");
  const [down, setDown] = useState("1000000");
  const [rate, setRate] = useState("8.5");
  const [years, setYears] = useState("20");
  const out = useMemo(() => {
    const p = Math.max(0, Number(price) - Number(down));
    const n = Math.round(Number(years) * 12);
    const m = emi(p, Number(rate), n);
    return { p, m, total: m * n, interest: m * n - p };
  }, [price, down, rate, years]);
  const field = (label: string, v: string, set: (s: string) => void, step = "1") => (
    <label><span className="st-label">{label}</span>
      <input className="st-in" type="number" inputMode="decimal" min="0" step={step} value={v} onChange={(e) => set(e.target.value)} /></label>
  );
  return (
    <>
      <h2>Your loan</h2>
      <div className="st-card st-pad">
        {field("Property price (₹)", price, setPrice)}
        {field("Down payment (₹)", down, setDown)}
        {field("Interest rate (% a year)", rate, setRate, "0.05")}
        {field("Loan tenure (years)", years, setYears)}
      </div>
      <h2>Result</h2>
      <div className="st-card">
        <div className="st-row"><span>Monthly EMI</span><div className="st-out">{inr(out.m)}</div></div>
        <div className="st-row st-kv"><b>Loan amount</b><span>{inr(out.p)}</span></div>
        <div className="st-row st-kv"><b>Total interest</b><span>{inr(out.interest)}</span></div>
        <div className="st-row st-kv"><b>Total payment</b><span>{inr(out.total)}</span></div>
      </div>
      <p className="st-sub">An estimate using the standard reducing-balance formula. The bank&apos;s offer, fees and rate changes will differ. The default values are only examples.</p>
    </>
  );
}
