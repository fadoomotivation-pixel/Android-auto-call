import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Facebook lead-form field names vary by form and language, so match loosely.
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const url = new URL(req.url);

    // Meta Webhook Verification (GET)
    if (req.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (mode === "subscribe" && token) {
        const { data, error } = await supabaseAdmin
          .from("facebook_integrations")
          .select("verify_token")
          .eq("verify_token", token)
          .single();

        if (data && !error) {
          return new Response(challenge, { status: 200, headers: corsHeaders });
        }
      }
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    // Handle incoming leads (POST)
    if (req.method === "POST") {
      const body = await req.json();

      if (body.object === "page") {
        for (const entry of body.entry ?? []) {
          const pageId = String(entry.id);

          const { data: integration, error: intError } = await supabaseAdmin
            .from("facebook_integrations")
            .select("company_id, auto_assign")
            .eq("page_id", pageId)
            .single();

          if (intError || !integration) {
            console.error(`No integration found for page ${pageId}`);
            continue;
          }

          // The Page Access Token lives in the Vault — fetch it via the RPC.
          // (The old code read a non-existent page_access_token column, so every
          //  Graph fetch used access_token=undefined and silently failed.)
          const { data: token, error: tokErr } = await supabaseAdmin.rpc(
            "get_facebook_token",
            { p_company: integration.company_id }
          );
          if (tokErr || !token) {
            console.error(`No Facebook token for company ${integration.company_id}`, tokErr);
            continue;
          }

          for (const change of entry.changes ?? []) {
            if (change.field !== "leadgen") continue;
            const leadgenId = String(change.value.leadgen_id);

            const { data: existing } = await supabaseAdmin
              .from("contacts")
              .select("id")
              .eq("lead_source_id", leadgenId)
              .maybeSingle();
            if (existing) {
              console.log(`Lead ${leadgenId} already processed.`);
              continue;
            }

            const graphRes = await fetch(
              `https://graph.facebook.com/v19.0/${leadgenId}?fields=field_data,created_time&access_token=${token}`
            );
            if (!graphRes.ok) {
              console.error("Graph API error", await graphRes.text());
              continue;
            }
            const leadData = await graphRes.json();

            // Flatten the form answers, then map loosely across field-name variants.
            const raw: Record<string, string> = {};
            for (const f of leadData.field_data ?? []) {
              if (f?.name) raw[f.name] = Array.isArray(f.values) ? f.values[0] : f.values;
            }

            let name = pick(raw, ["full_name", "full name", "name"]);
            if (!name) {
              name = [pick(raw, ["first_name", "first name"]), pick(raw, ["last_name", "last name"])]
                .filter(Boolean)
                .join(" ")
                .trim();
            }
            const phoneRaw = pick(raw, ["phone_number", "phone", "mobile", "contact_number", "whatsapp"]);
            const email = pick(raw, ["email", "e-mail"]);
            const budget = pick(raw, ["budget", "\u092c\u091c\u091f"]);
            const city = pick(raw, ["city", "location", "\u0936\u0939\u0930"]);

            // Clean phone; skip obvious non-numbers (e.g. Meta test-lead dummies).
            const cleanPhone = phoneRaw.replace(/[^0-9+]/g, "");
            const digits = cleanPhone.replace(/\\D/g, "");
            if (digits.length < 7) {
              console.log(`Lead ${leadgenId} has no real phone ("${phoneRaw}") — skipping.`);
              continue;
            }

            // Route the lead to the right COMPANY by its form. One central page
            // runs ads for many companies, so the page's own company is only a
            // fallback — a per-form mapping (facebook_lead_routes) decides where
            // each form's leads actually belong (and, optionally, which rep).
            const formId = change.value.form_id ? String(change.value.form_id) : null;
            let targetCompany = integration.company_id as string;
            let routedRep: string | null = null;
            let autoAssign = integration.auto_assign as boolean;
            if (formId) {
              const { data: route } = await supabaseAdmin
                .from("facebook_lead_routes")
                .select("company_id, salesperson_id")
                .eq("form_id", formId)
                .maybeSingle();
              if (route?.company_id) {
                targetCompany = route.company_id as string;
                routedRep = (route.salesperson_id as string) ?? null;
                // Honour the routed company's own auto-assign preference.
                const { data: rc } = await supabaseAdmin
                  .from("facebook_integrations")
                  .select("auto_assign")
                  .eq("company_id", targetCompany)
                  .maybeSingle();
                autoAssign = rc?.auto_assign ?? true;
              }
            }

            const assignedRep = routedRep
              ?? (autoAssign
                ? (await supabaseAdmin.rpc("fb_pick_rep", { p_company: targetCompany })).data ?? null
                : null);

            const { error: insertError } = await supabaseAdmin.from("contacts").insert({
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
              extra: {
                ad_id: change.value.ad_id,
                form_id: change.value.form_id,
                created_time: change.value.created_time ?? leadData.created_time,
                raw_fields: raw,
              },
            });

            if (insertError) {
              console.error("Error inserting lead", insertError);
            } else {
              console.log(`Lead ${leadgenId} inserted (rep=${assignedRep ?? "unassigned"}).`);
            }
          }
        }
        return new Response("EVENT_RECEIVED", { status: 200, headers: corsHeaders });
      }
      return new Response("Not a page object", { status: 404, headers: corsHeaders });
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  } catch (error) {
    console.error(error);
    return new Response("Internal Server Error", { status: 500, headers: corsHeaders });
  }
});
