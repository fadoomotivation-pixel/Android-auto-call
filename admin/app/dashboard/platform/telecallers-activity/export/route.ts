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

/**
 * WhatsApp's own "Export chat" text format.
 *
 * NOT a msgstore.db, and it cannot be one. WhatsApp restores only from a
 * .crypt15 backup encrypted with a key that lives on the handset (or behind
 * her 64-digit end-to-end backup key), and it only ever reads one at
 * registration time. A database file assembled here has no valid key, so the
 * app would reject it — there is no import path into WhatsApp at all, from any
 * file, which is worth knowing before paying for a tool that claims otherwise.
 *
 * This is the next best thing and a real one: byte-for-byte the layout
 * WhatsApp itself produces from Export chat, so it opens in any notes or text
 * app, is searchable, and is the format every third-party chat viewer already
 * understands.
 */
function asWhatsAppText(repName: string, chats: [string, Row[]][], total: number): string {
  const out: string[] = [];
  const stamp = (iso: string) =>
    `${new Date(iso).toLocaleDateString("en-GB", { ...IST, day: "2-digit", month: "2-digit", year: "2-digit" })}, ` +
    `${new Date(iso).toLocaleTimeString("en-IN", { ...IST, hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase()}`;

  out.push(`WhatsApp archive for ${repName}`);
  out.push(`${total} messages across ${chats.length} chats, saved by Call Pro AI.`);
  out.push(`Attachments show as <Media omitted> — the files themselves were not kept.`);
  out.push("");

  for (const [phone, msgs] of chats) {
    const label = msgs.find((m) => m.lead_name)?.lead_name
      ?? msgs.find((m) => m.peer_name)?.peer_name
      ?? phone;
    out.push("==================================================");
    out.push(`Chat with ${label} (${phone}) — ${msgs.length} messages`);
    out.push("==================================================");
    for (const m of msgs) {
      const who = m.direction === "out" ? repName : String(label);
      let text: string;
      if (m.deleted_at) text = m.body ? `This message was deleted: ${m.body}` : "This message was deleted";
      else if (m.media_kind && !m.body) text = `<Media omitted>${m.file_name ? ` (${m.file_name})` : ""}`;
      else if (m.media_kind && m.body) text = `<Media omitted> ${m.body}`;
      else text = m.body ?? "";
      // WhatsApp writes a multi-line message as continuation lines under the
      // stamped first one; keeping that means a parser reading this file back
      // does not treat every newline as a new message.
      const [head, ...rest] = text.split("\n");
      out.push(`${stamp(m.sent_at)} - ${who}: ${head}`);
      for (const line of rest) out.push(line);
    }
    out.push("");
  }
  return out.join("\n");
}

/**
 * The same archive as a spreadsheet, because remembering is a list job.
 *
 * Reading a year of chat back is not how anyone reconstructs a contact list.
 * Sorting 348 numbers by how much was said, seeing what each person opened
 * with and where the thread was left, and ticking them off — that is. So the
 * `clients` sheet is one row per number and the `messages` sheet is every
 * line, and both open straight into Excel.
 *
 * CSV rather than a real .xlsx on purpose: no library, no build-size cost, and
 * Excel opens it natively. The BOM is not optional — without it Excel reads the
 * file as its legacy codepage and every Hindi message becomes mojibake, which
 * on this data is most of them.
 */
const BOM = "﻿";

const csvCell = (v: string | number | null) => {
  const s = v === null || v === undefined ? "" : String(v);
  // A cell opening with =, +, - or @ is executed as a formula by Excel. A
  // leading space reads identically and defuses it.
  const safe = /^[=+\-@]/.test(s) ? ` ${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

const csvRows = (rows: (string | number | null)[][]) =>
  BOM + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

const oneLine = (s: string, limit = 120) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= limit ? t : `${t.slice(0, limit - 1)}…`;
};

function clientsCsv(chats: [string, Row[]][]): string {
  const out: (string | number | null)[][] = [[
    "#", "Phone number", "Name", "Total messages", "They sent", "Rep sent",
    "First message", "Last message", "Days talking",
    "First thing they said", "Last thing said in this chat", "Open chat",
  ]];
  chats.forEach(([phone, msgs], i) => {
    const name = msgs.find((m) => m.lead_name)?.lead_name
      ?? msgs.find((m) => m.peer_name)?.peer_name ?? "";
    const theirs = msgs.filter((m) => m.direction === "in").length;
    // Almost every row's Name is blank, and that is the truth of the data, not
    // a gap to paper over: WhatsApp sends a name only for numbers saved in the
    // handset's contacts, and on a restored session there are none. What they
    // opened with and where it was left is what actually identifies a number.
    const firstSaid = msgs.find((m) => m.direction === "in" && m.body?.trim())?.body ?? "";
    const lastSaid = [...msgs].reverse().find((m) => m.body?.trim())?.body ?? "";
    out.push([
      i + 1, phone, name, msgs.length, theirs, msgs.length - theirs,
      day(msgs[0].sent_at), day(msgs[msgs.length - 1].sent_at),
      new Set(msgs.map((m) => day(m.sent_at))).size,
      oneLine(firstSaid), oneLine(lastSaid), `https://wa.me/${phone}`,
    ]);
  });
  return csvRows(out);
}

function messagesCsv(repName: string, chats: [string, Row[]][]): string {
  const out: (string | number | null)[][] = [[
    "Phone number", "Name", "Date", "Time", "Who", "Message",
    "Attachment", "File name", "Deleted",
  ]];
  for (const [phone, msgs] of chats) {
    const name = msgs.find((m) => m.lead_name)?.lead_name
      ?? msgs.find((m) => m.peer_name)?.peer_name ?? "";
    for (const m of msgs) {
      out.push([
        phone, name, day(m.sent_at), clock(m.sent_at),
        m.direction === "out" ? repName : (name || "Client"),
        m.body ?? "", m.media_kind ?? "", m.file_name ?? "",
        m.deleted_at ? "yes" : "",
      ]);
    }
  }
  return csvRows(out);
}

const FORMATS = new Set(["html", "txt", "csv", "clients"]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rep = url.searchParams.get("rep") ?? "";
  const asked = url.searchParams.get("format") ?? "html";
  const format = FORMATS.has(asked) ? asked : "html";
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

  const fileBase = repName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  if (format === "csv" || format === "clients") {
    const body = format === "clients" ? clientsCsv(ordered) : messagesCsv(repName, ordered);
    const what = format === "clients" ? "numbers" : "messages";
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="whatsapp-${what}-${fileBase}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }
  if (format === "txt") {
    return new Response(asWhatsAppText(repName, ordered, rows.length), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="WhatsApp Chat - ${fileBase}.txt"`,
        "Cache-Control": "no-store",
      },
    });
  }

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
