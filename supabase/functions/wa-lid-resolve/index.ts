// Which WhatsApp chat is which lead, when WhatsApp hides the number.
//
// Nidhi linked her WhatsApp and the page said "825 messages, Leads 0": 52 of
// her 54 chats arrived as LIDs — WhatsApp's private id, with no phone number in
// it — and a LID cannot be matched to a lead. WhatsApp will not say whose LID
// it is, but it WILL say which LID a number we already know has.
//
// So this sends her worker session the numbers of the leads SHE has called
// (most recent first, a few hundred at most). Every LID WhatsApp answers with is
// remembered by the worker and reported to whatsapp-observe, whose
// wa_resolve_lid re-files the anonymous chat under the lead. Only her own
// called leads: a contact lookup of numbers she has phoned is what her own
// address book does anyway, and it stays inside her company.
//
//   cron, hourly (service key)   { mode: "sweep" }          reps due, two a run
//   admin (JWT)                  { mode: "rep", salesperson_id }   now, from 60 days back
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { BaileysProvider } from "../_shared/wa-provider.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

/** The worker caps a request at this too. */
const MAX_PHONES = 300;
const LOOKBACK_DAYS = 60;

type Session = {
  salesperson_id: string; company_id: string; lid_resolved_at: string | null;
  lid_resolved: { next_offset?: number | null } | null;
};

function waNumber(raw: string | null): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.length === 10 ? `91${d}` : d;
}

async function lidRows(admin: SupabaseClient, rep: string): Promise<number> {
  const { count } = await admin.from("wa_observed_messages").select("id", { count: "exact", head: true })
    .eq("salesperson_id", rep).eq("peer_is_lid", true).not("is_group", "is", true).is("archived_at", null);
  return count ?? 0;
}

async function matchedRows(admin: SupabaseClient, rep: string): Promise<number> {
  const { count } = await admin.from("wa_observed_messages").select("id", { count: "exact", head: true })
    .eq("salesperson_id", rep).not("contact_id", "is", null).is("archived_at", null);
  return count ?? 0;
}

async function resolveRep(admin: SupabaseClient, s: Session, full: boolean): Promise<Record<string, unknown>> {
  // A busy rep has called more leads than one run may ask about (Nidhi: 372
  // against 300). The last run left a bookmark; carry on from it over the
  // whole window, or the oldest leads would never be asked about at all.
  const carry = Number(s.lid_resolved?.next_offset ?? 0) || 0;
  // Otherwise only what is new since the last run, unless asked for the whole window.
  const since = !full && !carry && s.lid_resolved_at
    ? new Date(new Date(s.lid_resolved_at).getTime() - 86400_000).toISOString()
    : new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString();
  const { data: calls } = await admin.from("call_logs").select("contact_id")
    .eq("salesperson_id", s.salesperson_id).not("contact_id", "is", null)
    .gte("started_at", since).order("started_at", { ascending: false }).limit(5000);
  const all = [...new Set(((calls ?? []) as { contact_id: string }[]).map((c) => c.contact_id))];
  const offset = carry < all.length ? carry : 0;
  const ids = all.slice(offset, offset + MAX_PHONES);
  // Where the next run starts. Null once every called lead has been asked about.
  const nextOffset = offset + MAX_PHONES < all.length ? offset + MAX_PHONES : null;

  const lidBefore = await lidRows(admin, s.salesperson_id);
  const stamp = async (result: Record<string, unknown>) => {
    await admin.from("wa_rep_sessions").update({
      lid_resolved_at: new Date().toISOString(),
      lid_resolved: result,
    }).eq("salesperson_id", s.salesperson_id);
    return result;
  };

  if (!ids.length) return stamp({ asked: 0, note: "No called leads in this window." });

  // Same company only, whatever the call log says.
  const { data: leads } = await admin.from("contacts").select("phone")
    .in("id", ids).eq("company_id", s.company_id);
  const phones = [...new Set(((leads ?? []) as { phone: string | null }[]).map((l) => waNumber(l.phone)))]
    .filter((p) => p.length >= 10);
  if (!phones.length) return stamp({ asked: 0, note: "Called leads have no usable numbers." });

  const { data: b } = await admin.from("whatsapp_baileys").select("base_url").eq("company_id", s.company_id).maybeSingle();
  const { data: secret } = await admin.rpc("get_baileys_secret", { p_company: s.company_id });
  if (!b?.base_url || !secret) return stamp({ asked: 0, error: "No WhatsApp worker set up for this company." });

  const w = new BaileysProvider(String(b.base_url), String(secret));
  const r = await w.repResolve(s.salesperson_id, phones);
  if ("error" in r) {
    // Not stamped as done when the worker is too old or unreachable, so the
    // next hour tries again.
    if (r.error === "worker_outdated") return { error: "The WhatsApp worker needs updating (2026.10.24-31 or newer)." };
    return { error: r.error };
  }
  // The worker reported the new mappings to whatsapp-observe before answering,
  // so the chats are already re-filed by now.
  return stamp({
    ...r,
    next_offset: nextOffset,
    called_leads: all.length,
    lid_rows_before: lidBefore,
    lid_rows_after: await lidRows(admin, s.salesperson_id),
    matched_rows: await matchedRows(admin, s.salesperson_id),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const admin = createClient(SUPABASE_URL, SERVICE);

  if (bearer === SERVICE) {
    if (body.mode !== "sweep") return json({ ok: false, error: "unknown service mode" }, 400);
    const cutoff = new Date(Date.now() - 20 * 3600_000).toISOString();
    const { data: sessions } = await admin.from("wa_rep_sessions")
      .select("salesperson_id, company_id, lid_resolved_at, lid_resolved").eq("status", "connected");
    const done: Record<string, unknown>[] = [];
    for (const s of (sessions ?? []) as Session[]) {
      if (done.length >= 2) break;
      // Due once a day — or next hour, when the last run stopped at the cap.
      const due = !s.lid_resolved_at || new Date(s.lid_resolved_at) < new Date(cutoff) || s.lid_resolved?.next_offset != null;
      if (!due) continue;
      // Nothing hidden, nothing to find.
      if (await lidRows(admin, s.salesperson_id) === 0) continue;
      done.push({ rep: s.salesperson_id, ...(await resolveRep(admin, s, false)) });
    }
    return json({ ok: true, ran: done });
  }

  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${bearer}` } } });
  const { data: ud } = await u.auth.getUser();
  if (!ud?.user) return json({ ok: false, error: "Unauthorized" }, 401);
  const [{ data: me }, { data: pa }] = await Promise.all([
    admin.from("profiles").select("role, company_id").eq("id", ud.user.id).maybeSingle(),
    admin.from("platform_admins").select("user_id").eq("user_id", ud.user.id).maybeSingle(),
  ]);
  if (me?.role !== "admin" && !pa) return json({ ok: false, error: "Admins only" }, 403);
  if (body.mode !== "rep") return json({ ok: false, error: "unknown mode" }, 400);

  const { data: s } = await admin.from("wa_rep_sessions")
    .select("salesperson_id, company_id, lid_resolved_at, lid_resolved, status")
    .eq("salesperson_id", String(body.salesperson_id ?? "")).maybeSingle();
  if (!s) return json({ ok: false, error: "This telecaller has not linked WhatsApp." }, 404);
  if (!pa && s.company_id !== me?.company_id) return json({ ok: false, error: "Not your company." }, 403);
  if (s.status !== "connected") return json({ ok: false, error: "Their WhatsApp is not connected right now." });

  const r = await resolveRep(admin, s as Session, true);
  return json({ ok: !("error" in r), ...r });
});
