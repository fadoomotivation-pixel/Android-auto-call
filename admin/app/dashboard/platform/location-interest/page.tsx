import { createClient } from "@/lib/supabase/server";

/**
 * Location demand — every lead, any company, who ever asked for a city.
 *
 * WHY THIS EXISTS
 *
 * A buyer says "mujhe Gurgaon me chahiye" on a call or on WhatsApp, the rep
 * writes down whatever the CRM asked for that day, and the city they actually
 * wanted is buried in a transcript nobody re-reads. Months later a new site
 * launches in Gurgaon and the only way to find that buyer again was to
 * re-read every call across every company by hand.
 *
 * This mines it once, from text already stored — call transcripts/summaries
 * (0176) and WhatsApp messages (0173) — with a plain keyword read, same
 * rules-now approach as the WhatsApp signal engine. No AI call. New calls and
 * WhatsApp messages are read automatically as they arrive; this page only
 * reads what the database has already worked out.
 *
 * NOT contacts.territory. territory is where a lead LIVES; this is where they
 * want to BUY, and the two are often different cities entirely.
 */

type CityRow = { city: string; leads: number; last_mentioned: string | null };
type LeadRow = {
  company_id: string;
  company_name: string;
  contact_id: string;
  lead_name: string | null;
  lead_phone: string | null;
  stage: string | null;
  rep_name: string | null;
  city: string;
  source: "call" | "whatsapp";
  evidence: string | null;
  detected_at: string;
};

function ago(iso: string | null): string {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (d < 1) return "today";
  if (d < 30) return `${d}d ago`;
  const m = Math.floor(d / 30);
  return m < 12 ? `${m}mo ago` : `${Math.floor(m / 12)}y ago`;
}

export default async function LocationInterestPage({
  searchParams,
}: {
  searchParams: { city?: string };
}) {
  const supabase = await createClient();
  const city = searchParams.city || "";

  const { data: cityData, error: cityErr } = await supabase.rpc("super_location_interest_cities");
  if (cityErr) {
    return (
      <>
        <h2>📍 Location demand</h2>
        <div className="error">Super admin only. ({cityErr.message})</div>
      </>
    );
  }
  const cities = (cityData ?? []) as CityRow[];

  let leads: LeadRow[] = [];
  if (city) {
    const { data } = await supabase.rpc("super_location_interest", { p_city: city, p_days: null });
    leads = (data ?? []) as LeadRow[];
  }

  const qs = (o: { city?: string }) => (o.city ? `?city=${encodeURIComponent(o.city)}` : "");

  return (
    <>
      <h2>📍 Location demand</h2>
      <p className="subtitle">
        Every lead, in every company, who ever asked for a city — mined from what they actually
        said on a call or on WhatsApp. When a new site launches, this is who to call first.
      </p>

      {cities.length === 0 ? (
        <div className="empty">
          Nothing mined yet. This fills in as calls get transcribed and WhatsApp messages come in
          — nothing to do here.
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "4px 0 20px" }}>
          {cities.map((c) => (
            <a
              key={c.city}
              href={`/dashboard/platform/location-interest${qs({ city: c.city })}`}
              className="card"
              style={{
                padding: "10px 16px", textDecoration: "none", display: "flex",
                flexDirection: "column", alignItems: "center", gap: 2, minWidth: 90,
                fontWeight: c.city === city ? 700 : 400,
                background: c.city === city ? "var(--accent, #4353B8)" : undefined,
                color: c.city === city ? "#fff" : "inherit",
              }}
            >
              <span style={{ fontSize: 20, fontWeight: 700 }}>{c.leads}</span>
              <span style={{ fontSize: 13 }}>{c.city}</span>
            </a>
          ))}
        </div>
      )}

      {city && (
        <>
          <h3 style={{ marginBottom: 4 }}>{city} — {leads.length} lead{leads.length === 1 ? "" : "s"}</h3>
          <p className="subtitle" style={{ marginBottom: 14 }}>
            <a href="/dashboard/platform/location-interest">← All cities</a>
          </p>
          {leads.length === 0 ? (
            <div className="empty">No leads found for {city}.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Company</th>
                  <th>Rep</th>
                  <th>Stage</th>
                  <th>What they said</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l, i) => (
                  <tr key={`${l.contact_id}-${l.source}-${i}`}>
                    <td>
                      <strong>{l.lead_name || "Lead"}</strong>
                      <div className="subtitle" style={{ fontSize: 12 }}>{l.lead_phone}</div>
                    </td>
                    <td style={{ fontSize: 13 }}>{l.company_name.trim()}</td>
                    <td style={{ fontSize: 13 }}>{l.rep_name || "Unassigned"}</td>
                    <td style={{ fontSize: 13 }}>{l.stage || "—"}</td>
                    <td style={{ fontSize: 12.5, maxWidth: 340 }}>
                      <span style={{ opacity: 0.7 }}>{l.source === "call" ? "📞" : "💬"}</span>{" "}
                      {l.evidence || <span style={{ opacity: 0.4 }}>—</span>}
                    </td>
                    <td className="subtitle" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                      {ago(l.detected_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      <p className="subtitle" style={{ marginTop: 16, fontSize: 12.5 }}>
        Read from plain keywords in calls and WhatsApp text, not AI — a city name mentioned once is
        one entry here, so a rep confirming "haan Noida hi chahiye" and a rep just repeating the
        buyer's own words both count. Treat this as a shortlist to call, not a verdict.
      </p>
    </>
  );
}
