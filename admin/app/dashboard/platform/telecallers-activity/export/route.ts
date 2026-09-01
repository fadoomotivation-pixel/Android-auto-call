import { createClient } from "@/lib/supabase/server";

/**
 * A telecaller's WhatsApp year, as one file they can keep.
 *
 * WHY THIS EXISTS
 *
 * Ankita lost WhatsApp off her own phone while we were asking her to re-scan a
 * QR over and over, chasing a bug that re-scanning could never fix. This
 * database turned out to be the only place a year of her conversations still
 * existed. Handing it back is the least the product can do, and it should not
 * require anyone to run SQL to do it.
 *
 * WHY A ROUTE AND NOT A PAGE
 *
 * Thirteen thousand messages is a download, not a screen. Rendering it server-
 * side and streaming it as an attachment means no pagination, no scroll
 * position to lose, and a file that opens in any phone browser offline —
 * which is the point, since the phone is where the originals went missing.
 *
 * WHAT IS AND IS NOT IN IT
 *
 * Every conversation on the watched number, lead or not: this is her own record
 * of her own work, so it is not filtered down to the company's leads the way
 * the supervision screens are. Attachments are names only — nothing captured
 * files before this week and WhatsApp only hands the bytes over once, so those
 * are genuinely gone and each one says so rather than appearing as an empty
 * bubble.
 */

type Row = {
  peer_phone: string;
  peer_name: string | null;
  lead_name: string | null;
  direction: "in" | "out";
  body: string | null;
  media_kind: string | null;
  file_name: string | null;
  media_path: string | null;
  deleted_at: string | null;
  sent_at: string;
};

const IST = { timeZone: "Asia/Kolkata" } as const;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { ...IST, day: "numeric", month: "short", year: "numeric" });

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { ...IST, hour: "numeric", minute: "2-digit", hour12: true });

export async function GET(req: Request) {
  const rep = new URL(req.url).searchParams.get("rep") ?? "";
  if (!rep) return new Response("rep required", { status: 400 });

  const supabase = await createClient();
  // The RPC is security definer and raises for anyone who is not the super
  // admin, so the gate is the same one every other function on this screen uses.
  const { data, error } = await supabase.rpc("super_rep_full_archive", { p_rep: rep });
  if (error) return new Response(error.message, { status: 403 });

  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return new Response("Nothing stored for this telecaller.", { status: 404 });

  const { data: who } = await supabase
    .from("profiles").select("full_name").eq("id", rep).maybeSingle();
  const repName = (who?.full_name as string | null) ?? "Telecaller";

  // Group by conversation. The RPC already returns them ordered by peer and
  // then by time, so this preserves that without re-sorting anything.
  const chats = new Map<string, Row[]>();
  for (const r of rows) {
    if (!chats.has(r.peer_phone)) chats.set(r.peer_phone, []);
    chats.get(r.peer_phone)!.push(r);
  }
  // Busiest conversations first — the ones most worth having back.
  const ordered = [...chats.entries()].sort((a, b) => b[1].length - a[1].length);

  const parts: string[] = [];
  parts.push(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(repName)} — WhatsApp archive</title><style>
:root{color-scheme:dark}
body{margin:0;background:#0b141a;color:#e9edef;font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
header{position:sticky;top:0;background:#1f2c34;padding:14px 16px;border-bottom:1px solid #2a3942;z-index:2}
h1{margin:0;font-size:17px}
.sub{color:#8696a0;font-size:13px;margin-top:3px}
.wrap{max-width:820px;margin:0 auto;padding:0 12px 60px}
details{margin:14px 0;background:#111b21;border:1px solid #2a3942;border-radius:12px;overflow:hidden}
summary{padding:12px 14px;cursor:pointer;font-weight:600;list-style:none}
summary::-webkit-details-marker{display:none}
summary .n{color:#8696a0;font-weight:400;font-size:13px}
.body{padding:10px 12px 16px}
.date{text-align:center;margin:14px 0 10px}
.date span{background:#182229;color:#8696a0;font-size:12px;padding:4px 12px;border-radius:999px}
.row{display:flex;margin-bottom:4px}
.row.out{justify-content:flex-end}
.b{max-width:78%;padding:7px 10px 5px;border-radius:10px;background:#202c33;box-shadow:0 1px 1px rgba(0,0,0,.3);word-wrap:break-word}
.row.out .b{background:#005c4b}
.t{white-space:pre-wrap;word-break:break-word}
.meta{font-size:11px;color:#8696a0;text-align:right;margin-top:3px}
.att{font-size:13px;color:#8696a0;font-style:italic}
.del{font-size:12.5px;color:#f15c6d;font-style:italic}
</style></head><body>
<header><h1>${esc(repName)} — WhatsApp archive</h1>
<div class="sub">${rows.length.toLocaleString("en-IN")} messages · ${chats.size} chats · ${day(rows[0].sent_at)} onwards · saved by Call Pro AI</div></header>
<div class="wrap">`);

  for (const [phone, msgs] of ordered) {
    const label = msgs.find((m) => m.lead_name)?.lead_name
      ?? msgs.find((m) => m.peer_name)?.peer_name
      ?? phone;
    parts.push(`<details><summary>${esc(String(label))} <span class="n">· ${esc(phone)} · ${msgs.length} messages</span></summary><div class="body">`);

    let lastDay = "";
    for (const m of msgs) {
      const d = day(m.sent_at);
      if (d !== lastDay) { parts.push(`<div class="date"><span>${esc(d)}</span></div>`); lastDay = d; }
      parts.push(`<div class="row ${m.direction === "out" ? "out" : "in"}"><div class="b">`);
      if (m.deleted_at) parts.push(`<div class="del">This message was deleted — kept below</div>`);
      if (m.media_kind) {
        const name = m.file_name ? `${m.media_kind}: ${m.file_name}` : m.media_kind;
        parts.push(`<div class="att">[${esc(name)}${m.media_path ? "" : " — file not saved"}]</div>`);
      }
      if (m.body) parts.push(`<div class="t">${esc(m.body)}</div>`);
      parts.push(`<div class="meta">${esc(clock(m.sent_at))}</div></div></div>`);
    }
    parts.push(`</div></details>`);
  }

  parts.push(`</div></body></html>`);

  const html = parts.join("");
  const safeName = repName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="whatsapp-archive-${safeName}.html"`,
      "Cache-Control": "no-store",
    },
  });
}
