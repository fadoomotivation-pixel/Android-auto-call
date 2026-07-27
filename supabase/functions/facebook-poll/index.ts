// Pull-based Facebook lead sync — the reliable half of Meta lead ads.
//
// Meta's webhook PUSH is fragile: if the app is in Development mode (or the
// app-level webhook lapses) only test/admin leads are delivered, so real public
// ad leads never reach the CRM even though the page shows "connected". This job
// PULLS instead: for every connected page it reads each lead form's recent leads
// via the Graph API (which only needs leads_retrieval — already granted) and
// imports any it doesn't already have, routed to the right company by form.
//
// Safe by design: dedupes on lead_source_id, and only imports leads newer than a
// window (default 7 days) so it never drags in years of old backlog.
//
// Invoked by pg_cron (service key) or manually with the service bearer.
// Body (optional): { since_days?: number, limit_per_form?: number }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const GRAPH = "https://graph.facebook.com/v19.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function pick(raw: Record<string, string>, keys: string[]): string {
  for (const k of Object.keys(raw)) {
    const lk = k.toLowerCase();
    if (keys.some((x) => lk === x || lk.includes(x))) {
      const v = raw[k];
      if (v && v.trim()) return v.trim();
    }
  }
  return "";
}

async function importLead(
  admin: SupabaseClient,
  lead: { id: string; created_time?: string; ad_id?: string; adset_id?: string; campaign_id?: string; platform?: string; field_data?: Array<{ name?: string; values?: string[] }> },
  formId: string,
  pageCompany: string,
  pageAutoAssign: boolean,
): Promise<"inserted" | "dup" | "skip" | "error"> {
  const leadgenId = String(lead.id);
  const { data: existing } = await admin.from("contacts").select("id").eq("lead_source_id", leadgenId).maybeSingle();
  if (existing) return "dup";

  const raw: Record<string, string> = {};
  for (const f of lead.field_data ?? []) {
    if (f?.name) raw[f.name] = Array.isArray(f.values) ? f.values[0] : (f.values as unknown as string);
  }
  let name = pick(raw, ["full_name", "full name", "name"]);
  if (!name) {
    name = [pick(raw, ["first_name", "first name"]), pick(raw, ["last_name", "last name"])].filter(Boolean).join(" ").trim();
  }
  const phoneRaw = pick(raw, ["phone_number", "phone", "mobile", "contact_number", "whatsapp"]);
  const cleanPhone = phoneRaw.replace(/[^0-9+]/g, "");
  if (cleanPhone.replace(/\D/g, "").length < 7) return "skip";
  const email = pick(raw, ["email", "e-mail"]);
  const budget = pick(raw, ["budget", "बजट"]);
  const city = pick(raw, ["city", "location", "शहर"]);

  // Route by form → company (fallback: the page's own company).
  let targetCompany = pageCompany;
  let routedRep: string | null = null;
  let autoAssign = pageAutoAssign;
  const { data: route } = await admin.from("facebook_lead_routes")
    .select("company_id, salesperson_id").eq("form_id", formId).maybeSingle();
  if (route?.company_id) {
    targetCompany = route.company_id as string;
    routedRep = (route.salesperson_id as string) ?? null;
    const { data: rc } = await admin.from("facebook_integrations").select("auto_assign").eq("company_id", targetCompany).maybeSingle();
    autoAssign = rc?.auto_assign ?? true;
  }
  const assignedRep = routedRep
    // pick_next_rep is the platform's single eligibility brain (check-in, office
    // fence, backlog cap). A previous name here didn't exist as an RPC at all, so
    // auto-assign silently returned null and the lead landed unassigned.
    ?? (autoAssign ? (await admin.rpc("pick_next_rep", { p_company: targetCompany })).data ?? null : null);

  const { error } = await admin.from("contacts").insert({
    company_id: targetCompany,
    salesperson_id: assignedRep,
    assigned_at: assignedRep ? new Date().toISOString() : null,
    name: name || null,
    phone: cleanPhone,
    email: email || null,
    budget: budget || null,
    territory: city || null,
    status: "new",
    lead_source: "facebook",
    lead_source_id: leadgenId,
    // ad_id/adset_id/campaign_id are what the Ads Manager joins on to show which
    // ad actually produced buyers. Without them every campaign reads "0 leads"
    // however much it spent — so they are pulled and stored on every lead.
    extra: {
      form_id: formId, created_time: lead.created_time, raw_fields: raw, via: "poll",
      ad_id: lead.ad_id ?? null, adset_id: lead.adset_id ?? null,
      campaign_id: lead.campaign_id ?? null, platform: lead.platform ?? null,
    },
  });
  return error ? "error" : "inserted";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Allowed callers: the cron/service key, OR a platform super-admin's JWT — so
  // the admin can hit a "Pull leads now" button on the web to catch up any leads
  // the 10-min cron / webhook missed. (Regular company admins can't: this reads
  // the ONE central Facebook business across all companies.)
  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  let authorized = bearer === SERVICE;
  if (!authorized && bearer) {
    const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: ud } = await u.auth.getUser();
    if (ud?.user) {
      const { data: pa } = await u.from("platform_admins").select("user_id").eq("user_id", ud.user.id).maybeSingle();
      authorized = !!pa;
    }
  }
  if (!authorized) return json({ ok: false, error: "Super-admin only." }, 401);

  const body = await req.json().catch(() => ({}));

  // ---- Backfill attribution: older leads were imported before ad_id was
  // stored, so every campaign reads "0 leads" in the Ads Manager however much it
  // spent. Re-read each lead from the Graph API and stamp its ad/adset/campaign
  // ids onto extra, so historical spend can finally be tied to real buyers. ----
  if (body.mode === "backfill_attribution") {
    const adminB = createClient(SUPABASE_URL, SERVICE);
    const { data: integ } = await adminB.from("facebook_integrations")
      .select("company_id").neq("page_id", "").limit(1).maybeSingle();
    if (!integ?.company_id) return json({ ok: false, error: "No connected page." });
    const { data: tok } = await adminB.rpc("get_facebook_token", { p_company: integ.company_id });
    if (!tok) return json({ ok: false, error: "No page token." });

    const { data: pending } = await adminB.from("contacts")
      .select("id, lead_source_id, extra")
      .eq("lead_source", "facebook")
      .not("lead_source_id", "is", null)
      .limit(Math.min(Math.max(Number(body.limit) || 100, 1), 400));

    let fixed = 0, missing = 0;
    for (const c of pending ?? []) {
      const ex = (c.extra ?? {}) as Record<string, unknown>;
      if (ex.ad_id) continue; // already attributed
      const g = await fetch(
        `${GRAPH}/${c.lead_source_id}?fields=ad_id,adset_id,campaign_id,platform&access_token=${tok}`,
      ).then((r) => r.json()).catch(() => ({}));
      if (!g?.ad_id) { missing++; continue; }
      const { error } = await adminB.from("contacts")
        .update({ extra: { ...ex, ad_id: g.ad_id, adset_id: g.adset_id ?? null, campaign_id: g.campaign_id ?? null, platform: g.platform ?? null } })
        .eq("id", c.id);
      if (!error) fixed++;
    }
    return json({ ok: true, fixed, missing, scanned: (pending ?? []).length });
  }

  const sinceDays = Math.min(Math.max(Number(body.since_days) || 7, 1), 90);
  const limitPerForm = Math.min(Math.max(Number(body.limit_per_form) || 50, 1), 200);
  const cutoffMs = Date.now() - sinceDays * 86400_000;

  const admin = createClient(SUPABASE_URL, SERVICE);

  // Only import forms the super admin has explicitly mapped to a company. One
  // central page hosts dozens of forms (many old / test), so pulling ALL of them
  // would flood the fallback company with mis-routed and junk leads. A form only
  // flows once it's pointed at a company in facebook_lead_routes.
  const { data: routeRows } = await admin.from("facebook_lead_routes").select("form_id");
  const mapped = new Set<string>((routeRows ?? []).map((r: { form_id: string }) => r.form_id));
  if (mapped.size === 0) return json({ ok: true, inserted: 0, dup: 0, skip: 0, errors: 0, forms: 0, note: "no forms mapped yet" });

  const { data: integs } = await admin.from("facebook_integrations").select("company_id, page_id, auto_assign").neq("page_id", "");

  let inserted = 0, dup = 0, skip = 0, errors = 0, forms = 0;
  for (const it of integs ?? []) {
    if (!it.page_id) continue;
    const { data: token } = await admin.rpc("get_facebook_token", { p_company: it.company_id });
    if (!token) continue;

    const formsRes = await fetch(`${GRAPH}/${it.page_id}/leadgen_forms?fields=id&limit=100&access_token=${token}`).then((r) => r.json()).catch(() => ({}));
    for (const f of (formsRes.data ?? [])) {
      const formId = String(f.id);
      if (!mapped.has(formId)) continue; // unmapped → don't import
      forms++;
      const leadsRes = await fetch(
        `${GRAPH}/${formId}/leads?fields=id,created_time,ad_id,adset_id,campaign_id,platform,field_data&limit=${limitPerForm}&access_token=${token}`,
      ).then((r) => r.json()).catch(() => ({}));
      for (const lead of (leadsRes.data ?? [])) {
        const ct = Date.parse(lead.created_time ?? "");
        if (Number.isFinite(ct) && ct < cutoffMs) continue; // older than the window
        const r = await importLead(admin, lead, formId, it.company_id as string, (it.auto_assign as boolean) ?? true);
        if (r === "inserted") inserted++;
        else if (r === "dup") dup++;
        else if (r === "skip") skip++;
        else errors++;
      }
    }
  }
  return json({ ok: true, inserted, dup, skip, errors, forms, since_days: sinceDays });
});
