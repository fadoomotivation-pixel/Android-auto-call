// Website onboarding (website.callproai.in, source in site999/): email alert for
// each new enquiry, and the password-gated admin API.
//
// verify_jwt is OFF for this function (supabase/config.toml): the form's
// trigger calls "notify" with a hook secret, and the admin page calls with a
// password, so neither has a Supabase JWT. Both are checked below.
//
// The table is insert-only for anon (policy site999_anon_insert); every read
// and update here uses the service role, behind the admin password.
import { createClient } from "npm:@supabase/supabase-js@2";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST,OPTIONS" };
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
async function cfg() { const { data } = await sb.from("site999_config").select("key,value"); return Object.fromEntries((data ?? []).map(r => [r.key, r.value])); }
async function sha(s: string) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, "0")).join(""); }
function eq(a: string, b: string) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
// Labels for the email. v4 (current form) first, then the keys only the older form sent.
const LBL: Record<string, string> = {
  name: "Name", whatsapp: "WhatsApp", email: "Email", city: "City", brand: "Business", industry: "Type", industryOther: "Type (other)",
  oneLiner: "Sells (one line)", problem: "Problem they solve", years: "Years", offers: "Offer now",
  customers: "Best customers", custText: "Customer notes", reach: "Customers are", areas: "Areas served", questions: "Customer questions",
  uspTags: "Why customers choose them", usp: "Other strength", competitors: "Compared with", compBetter: "Competitors do better", reviews: "Proof they have",
  action: "Main button", sources: "Enquiries come from", enqNow: "Enquiries a month", ads: "Runs ads", keywords: "Google search words",
  gbp: "Google Business Profile", ig: "Instagram", fb: "Facebook", yt: "YouTube",
  pages: "Pages", colour: "Colours", tone: "Feel", makeLogo: "Make a logo", langs: "Languages", hasSite: "Has website/domain", domain: "Domain", likes: "Websites they like",
  deadline: "Go live", decider: "Who decides", callTime: "Best time to call", address: "Address", maps: "Maps", notes: "Other notes",
  goal: "Website goals", custAge: "Customer age", custIncome: "Customer income", custLoc: "Customer location", comp1: "Competitor 1", comp2: "Competitor 2", comp3: "Competitor 3",
  priceRange: "Price range", enqTarget: "Enquiries/month target", adBudget: "Ad budget/month", hasDomain: "Has domain", dom1: "Domain pref 1", dom2: "Domain pref 2", dom3: "Domain pref 3",
  ref1: "Ref site 1", ref2: "Ref site 2", about: "About", extra: "Also interested in",
};
function html(r: any) {
  const d = r.data ?? {}; const rows = Object.keys(LBL).filter(k => d[k] && String(d[k]).trim()).map(k => `<tr><td style="padding:6px 10px;color:#777;vertical-align:top;white-space:nowrap">${LBL[k]}</td><td style="padding:6px 10px">${esc(Array.isArray(d[k]) ? d[k].join(", ") : d[k]).replace(/\n/g, "<br>")}</td></tr>`).join("");
  const items = [1, 2, 3, 4, 5].filter(i => d[`s${i}_name`]).map(i => `<li><b>${esc(d[`s${i}_name`])}</b>${d[`s${i}_desc`] ? ": " + esc(d[`s${i}_desc`]) : ""}${d[`s${i}_price`] ? " " + esc(d[`s${i}_price`]) : ""}${d[`s${i}_ai`] ? " (AI images)" : ""}</li>`).join("");
  const wa = String(r.whatsapp ?? "").replace(/\D/g, "");
  return `<div style="font-family:Arial,sans-serif;max-width:640px"><h2 style="color:#b8860b">New website enquiry: ${esc(r.brand)}</h2>
<p><a href="https://wa.me/${wa.length == 10 ? "91" + wa : wa}" style="background:#0f7a45;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">WhatsApp ${esc(r.name)}</a> &nbsp; <a href="tel:${esc(r.whatsapp)}">Call ${esc(r.whatsapp)}</a> &nbsp; <a href="https://website.callproai.in/admin/">Open admin</a></p>
<table style="border-collapse:collapse;font-size:14px">${rows}</table>${items ? `<h3>Services / products</h3><ul>${items}</ul>` : ""}
<p style="color:#777;font-size:12px">Files: ${Object.values(d.files ?? {}).flat().length} (view in admin). Ref ${String(r.id).slice(0, 8)}</p></div>`;
}
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let b: any; try { b = await req.json(); } catch { return j({ error: "bad json" }, 400); }
  const c = await cfg();
  if (b.action === "notify") {
    if (!c.hook_secret || !eq(String(b.hook ?? ""), c.hook_secret)) return j({ error: "forbidden" }, 403);
    const { data: r } = await sb.from("site999_onboarding").select("*").eq("id", b.id).single();
    if (!r || r.notified_at) return j({ ok: true, skipped: true });
    const key = c.resend_api_key || Deno.env.get("RESEND_API_KEY"), to = c.notify_email;
    if (!key || !to) { await sb.from("site999_onboarding").update({ notify_error: "email not configured (resend_api_key / notify_email)" }).eq("id", r.id); return j({ ok: false, reason: "not configured" }); }
    const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: `Website Enquiries <${c.from_email || "onboarding@resend.dev"}>`, to: to.split(",").map((s: string) => s.trim()), subject: `New enquiry: ${r.brand ?? r.name} (${r.city ?? ""})`, html: html(r), reply_to: r.email || undefined }) });
    const t = await res.text();
    await sb.from("site999_onboarding").update(res.ok ? { notified_at: new Date().toISOString(), notify_error: null } : { notify_error: t.slice(0, 300) }).eq("id", r.id);
    return j({ ok: res.ok });
  }
  // admin actions
  await new Promise(r => setTimeout(r, 300));
  if (!c.admin_pass_sha256 || !eq(await sha(String(b.password ?? "")), c.admin_pass_sha256)) return j({ error: "Wrong password" }, 401);
  if (b.action === "list") {
    // data comes along so the admin can score leads and export CSV without a request per row.
    const { data, error } = await sb.from("site999_onboarding").select("id,created_at,name,whatsapp,email,city,brand,status,notified_at,notify_error,notes,follow_up_at,data").order("created_at", { ascending: false }).limit(500);
    return error ? j({ error: error.message }, 500) : j({ rows: data, emailConfigured: !!((c.resend_api_key || Deno.env.get("RESEND_API_KEY")) && c.notify_email) });
  }
  if (b.action === "get") {
    const { data: r, error } = await sb.from("site999_onboarding").select("*").eq("id", b.id).single(); if (error) return j({ error: error.message }, 404);
    const paths = Object.entries(r.data?.files ?? {}).flatMap(([k, v]: any) => v.map((p: string) => ({ field: k, path: p })));
    const signed = await Promise.all(paths.map(async f => ({ ...f, url: (await sb.storage.from("site999-uploads").createSignedUrl(f.path, 3600)).data?.signedUrl })));
    return j({ row: r, files: signed });
  }
  if (b.action === "update") {
    const upd: any = {};
    if (["new", "contacted", "won", "lost"].includes(b.status)) upd.status = b.status;
    if (typeof b.notes === "string") upd.notes = b.notes.slice(0, 5000);
    if (b.follow_up_at === null) upd.follow_up_at = null;
    else if (typeof b.follow_up_at === "string") { const t = Date.parse(b.follow_up_at); if (Number.isNaN(t)) return j({ error: "Follow-up date is not valid" }, 400); upd.follow_up_at = new Date(t).toISOString(); }
    const { error } = await sb.from("site999_onboarding").update(upd).eq("id", b.id);
    return error ? j({ error: error.message }, 500) : j({ ok: true });
  }
  if (b.action === "delete") { const { error } = await sb.from("site999_onboarding").delete().eq("id", b.id); return error ? j({ error: error.message }, 500) : j({ ok: true }); }
  return j({ error: "unknown action" }, 400);
});
