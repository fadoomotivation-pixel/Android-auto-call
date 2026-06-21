import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
        // Check if token exists in our DB
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
        for (const entry of body.entry) {
          const pageId = entry.id;

          // Find integration for this page
          const { data: integration, error: intError } = await supabaseAdmin
            .from("facebook_integrations")
            .select("company_id")
            .eq("page_id", pageId)
            .single();

          if (intError || !integration) {
            console.error(`No integration found for page ${pageId}`);
            continue;
          }

          // Token lives in Vault, not the DB. Service-role-only RPC decrypts it.
          const { data: pageAccessToken } = await supabaseAdmin.rpc("get_facebook_token", {
            p_company: integration.company_id,
          });
          if (!pageAccessToken) {
            console.error(`No access token for page ${pageId}`);
            continue;
          }

          for (const change of entry.changes) {
            if (change.field === "leadgen") {
              const leadgenId = change.value.leadgen_id;

              // Check if we already processed this lead
              const { data: existing } = await supabaseAdmin
                .from("contacts")
                .select("id")
                .eq("lead_source_id", leadgenId)
                .maybeSingle();

              if (existing) {
                console.log(`Lead ${leadgenId} already processed.`);
                continue;
              }

              // Fetch lead details from Graph API
              const graphRes = await fetch(
                `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${pageAccessToken}`
              );

              if (!graphRes.ok) {
                console.error("Graph API error", await graphRes.text());
                continue;
              }

              const leadData = await graphRes.json();
              
              let fullName = "";
              let phone = "";
              let email = "";

              for (const field of leadData.field_data || []) {
                if (field.name === "full_name") fullName = field.values[0];
                if (field.name === "phone_number") phone = field.values[0];
                if (field.name === "email") email = field.values[0];
              }

              if (!phone) {
                console.error(`Lead ${leadgenId} has no phone number.`);
                continue;
              }

              // Find a default rep or assign to admin
              // For now, just insert without salesperson_id, or pick an admin
              // We'll leave salesperson_id null so it shows up in "Unassigned" pool,
              // or let's find the first active salesperson for the company to avoid unassigned purgatory.
              const { data: reps } = await supabaseAdmin
                .from("profiles")
                .select("id")
                .eq("company_id", integration.company_id)
                .eq("role", "salesperson")
                .eq("is_active", true)
                .limit(1);

              const assignedRep = reps && reps.length > 0 ? reps[0].id : null;

              // Clean phone (remove spaces, etc)
              const cleanPhone = phone.replace(/[^0-9+]/g, "");

              // Returning buyer? A new ad response from a phone we already have is
              // a re-engagement, not a fresh lead — reactivate the existing contact
              // (wakes it if it had gone cold) instead of creating a duplicate.
              const { data: dupe } = await supabaseAdmin
                .from("contacts")
                .select("id")
                .eq("company_id", integration.company_id)
                .eq("phone", cleanPhone)
                .limit(1)
                .maybeSingle();
              if (dupe) {
                await supabaseAdmin.rpc("reactivate_lead", { p_contact_id: dupe.id, p_signal: "facebook" });
                console.log(`Lead ${leadgenId} matched existing contact ${dupe.id} — reactivated.`);
                continue;
              }

              const { error: insertError } = await supabaseAdmin
                .from("contacts")
                .insert({
                  company_id: integration.company_id,
                  salesperson_id: assignedRep,
                  name: fullName || null,
                  phone: cleanPhone,
                  email: email || null,
                  status: "new",
                  lead_source: "facebook",
                  lead_source_id: leadgenId,
                  extra: {
                    ad_id: change.value.ad_id,
                    form_id: change.value.form_id,
                    created_time: change.value.created_time
                  }
                });

              if (insertError) {
                console.error("Error inserting lead", insertError);
              } else {
                console.log(`Lead ${leadgenId} inserted successfully.`);
              }
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
