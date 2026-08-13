// projects-sync — read a company's project list out of its OWN brain.
//
// A company's real project names exist in exactly one place: the guide and
// price sheet its owner uploaded. Nowhere else. project_sites (the geofencing
// pins) is empty on every tenant, and nobody was ever going to type the list
// twice.
//
// So this reads the brain and writes company_projects, which is what
// voice-note-ai then makes the model CHOOSE from instead of spelling a name off
// Hindi audio — the thing that turned two Fanbe projects into forty-eight.
//
// Three rules that matter more than the code:
//
//   · NEVER delete. A row a human typed (source='admin') is the truth and this
//     function must not touch it, and even a stale 'brain' row is better than a
//     list that empties itself the day an upload is re-chunked. Additive only.
//   · NEVER invent. The model is told to copy names verbatim out of the text and
//     return nothing if the documents do not list projects. A hallucinated
//     project becomes a canonical name that snap_project will then happily
//     match real leads onto — worse than no list at all.
//   · One company at a time, and only companies that HAVE a brain. Nothing to
//     read means nothing to write.
//
// Body: { company_id?: uuid }  — omit to sweep every company (cron/super admin).
// Auth: cron secret, service role, or a super admin's JWT.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { chatJson } from "../_shared/chat.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM =
  "You are reading a real-estate company's own sales documents — its company brain and its master " +
  "price sheet — to extract the list of PROJECTS the company sells.\n" +
  'Reply ONLY as JSON: {"projects": string[]}.\n' +
  "Rules:\n" +
  "- Copy each name EXACTLY as the documents write it. Do not translate, expand, abbreviate or " +
  "correct the spelling.\n" +
  "- A project is a named development the company sells plots or homes in. It is NOT the company " +
  "itself, NOT a city, NOT a landmark (a railway station, a temple, a highway), NOT an amenity, and " +
  "NOT a block or phase — 'BRIJ VATIKA (Block E)' is the project 'Brij Vatika'.\n" +
  "- Drop the block/phase suffix and list each project ONCE.\n" +
  "- If the documents do not clearly list any projects, return an empty array. Never guess a name " +
  "that is not written in the text.";

/** The chunks worth reading: what a human wrote, never what the CRM generated. */
async function brainText(admin: SupabaseClient, companyId: string): Promise<string> {
  const { data } = await admin.from("knowledge_chunks")
    .select("content, source_kind")
    .eq("company_id", companyId)
    // 'progress' and 'win' are harvested from calls — they are full of the very
    // mis-spellings this function exists to replace, so reading them would teach
    // the list the mistakes.
    .in("source_kind", ["guide", "price"])
    .limit(200);
  return ((data ?? []) as Array<{ content: string }>)
    .map((r) => String(r.content ?? ""))
    .join("\n---\n")
    .slice(0, 24000);
}

async function syncOne(admin: SupabaseClient, companyId: string) {
  const text = await brainText(admin, companyId);
  if (text.trim().length < 200) return { company_id: companyId, skipped: "no brain uploaded" };

  const { text: raw } = await chatJson(SYSTEM, `Company documents:\n\n${text}`, { temperature: 0 });
  let names: string[] = [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p?.projects)) {
      names = p.projects
        .filter((n: unknown): n is string => typeof n === "string")
        .map((n: string) => n.replace(/\s+/g, " ").trim())
        // A one-or-two character "name" is a parse artefact, and 80 characters
        // is a sentence that got swept up rather than a project.
        .filter((n: string) => n.length >= 3 && n.length <= 80)
        .slice(0, 60);
    }
  } catch { /* fall through to zero names — better than writing rubbish */ }
  if (!names.length) return { company_id: companyId, skipped: "model found no projects" };

  // Case-insensitively new only. The unique index is on (company_id, lower(name)),
  // so this is belt and braces — but doing the check here means the reply can
  // honestly say how many were ADDED rather than how many were offered.
  const { data: existing } = await admin.from("company_projects")
    .select("name").eq("company_id", companyId);
  const have = new Set(((existing ?? []) as Array<{ name: string }>).map((r) => r.name.toLowerCase()));
  const fresh = names.filter((n) => !have.has(n.toLowerCase()));
  if (!fresh.length) return { company_id: companyId, added: 0, found: names.length };

  const { error } = await admin.from("company_projects")
    .insert(fresh.map((name) => ({ company_id: companyId, name, source: "brain" })));
  if (error) return { company_id: companyId, error: error.message };
  return { company_id: companyId, added: fresh.length, found: names.length, names: fresh };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const isCron = (CRON_SECRET && req.headers.get("x-cron-secret") === CRON_SECRET) ||
    (!!bearer && bearer === SERVICE);

  const admin = createClient(SUPABASE_URL, SERVICE);
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  // A company admin may rebuild THEIR list; only the super admin or the cron
  // may sweep the platform. Writing another tenant's project list would put
  // one company's names on another company's leads.
  let isSuper = false;
  let myCompany: string | null = null;
  if (!isCron && bearer) {
    const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: ud } = await u.auth.getUser();
    if (ud?.user) {
      const [{ data: me }, { data: pa }] = await Promise.all([
        admin.from("profiles").select("role, company_id").eq("id", ud.user.id).maybeSingle(),
        admin.from("platform_admins").select("user_id").eq("user_id", ud.user.id).maybeSingle(),
      ]);
      isSuper = !!pa;
      if (me?.role === "admin" || isSuper) myCompany = (me?.company_id as string | null) ?? null;
    }
  }
  if (!isCron && !isSuper && !myCompany) return json({ ok: false, error: "Unauthorized" }, 401);

  const asked = typeof body.company_id === "string" ? body.company_id : null;
  let targets: string[];
  if (asked) {
    if (!isCron && !isSuper && asked !== myCompany) {
      return json({ ok: false, error: "Not your company." }, 403);
    }
    targets = [asked];
  } else if (isCron || isSuper) {
    const { data: cs } = await admin.from("companies").select("id");
    targets = ((cs ?? []) as Array<{ id: string }>).map((c) => c.id);
  } else {
    targets = [myCompany!];
  }

  // Sequential on purpose. This is a cron-paced housekeeping job, not a page
  // load, and every company costs one LLM call against a daily token budget
  // shared with sixteen other functions.
  const results = [];
  for (const cid of targets.slice(0, 50)) {
    results.push(await syncOne(admin, cid).catch((e) => ({ company_id: cid, error: String(e).slice(0, 200) })));
  }
  return json({ ok: true, companies: results.length, results });
});
