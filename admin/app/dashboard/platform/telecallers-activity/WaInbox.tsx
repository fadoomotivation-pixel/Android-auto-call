"use client";

import { useMemo, useState } from "react";

/**
 * A telecaller's WhatsApp, laid out like WhatsApp.
 *
 * WHY THIS REPLACED A TABLE
 *
 * The conversations were shipped as a six-column table: phone number, last
 * message, counts, a date. Every row was a link, so reading one chat meant a
 * full page load, and coming back meant losing your place in three hundred and
 * forty-eight rows. It was a spreadsheet of conversations, and the founder's
 * verdict on it was fair — a table is how you audit chats, not how you read
 * them.
 *
 * The person using this is holding WhatsApp in their other hand. Every
 * difference from the app they already know costs them a moment of translation.
 * So: list on the left, conversation on the right, search at the top, and the
 * thread itself rendered by WaThread exactly as before.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * No reply box. This watches and never sends — there is no send path anywhere
 * in the worker for a rep session, and a composer that looked real would be a
 * lie about what the product does.
 *
 * WHY THE LIST IS CLIENT-SIDE AND THE THREAD IS NOT
 *
 * All 348 conversations arrive with the page, so searching and filtering are
 * instant and cost nothing. A thread is up to 400 messages with signed media
 * URLs, so it stays on the server and arrives through `children` when a peer is
 * selected. Fast where it matters, simple where it does not.
 */

export type Conversation = {
  peer_phone: string;
  peer_name: string | null;
  lead_name: string | null;
  contact_id: string | null;
  messages: number;
  they_sent: number;
  rep_sent: number;
  calls: number;
  first_at: string;
  last_at: string;
  last_body: string | null;
  last_media: string | null;
};

const IST = { timeZone: "Asia/Kolkata" } as const;

/** WhatsApp's own rule: time today, "Yesterday", then the date. */
function listStamp(iso: string): string {
  const d = new Date(iso);
  const key = (x: Date) => x.toLocaleDateString("en-IN", { ...IST, year: "numeric", month: "2-digit", day: "2-digit" });
  const today = key(new Date());
  const yest = key(new Date(Date.now() - 86400_000));
  const k = key(d);
  if (k === today) return d.toLocaleTimeString("en-IN", { ...IST, hour: "numeric", minute: "2-digit", hour12: true });
  if (k === yest) return "Yesterday";
  return d.toLocaleDateString("en-IN", { ...IST, day: "numeric", month: "short", year: "2-digit" });
}

/**
 * A stable colour per person, so a conversation keeps the same avatar every
 * time you come back to it. Hue only — saturation and lightness are fixed so
 * no avatar can come out unreadable on the dark ground.
 */
function hueOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

/**
 * Initials, or a neutral mark when there is no name to take them from.
 *
 * Falling back to the last two digits of the phone produced avatars reading
 * "81" and "92", which look like data and are not — nobody recognises a
 * contact by the tail of their own number. An unnamed number gets the same
 * blank-person treatment WhatsApp gives it.
 */
function initials(name: string, phone: string): string | null {
  const words = name.trim().split(/\s+/).filter((w) => /[\p{L}]/u.test(w));
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  void phone;
  return null;
}

const MEDIA_WORD: Record<string, string> = {
  image: "Photo", video: "Video", audio: "Voice note",
  document: "Document", sticker: "Sticker",
};

type Filter = "all" | "crm" | "uncaptured";

export function WaInbox({
  conversations, activePeer, baseHref, children,
}: {
  conversations: Conversation[];
  /** "" when nothing is open yet. */
  activePeer: string;
  /** Already carries rep and days; this appends &peer=. */
  baseHref: string;
  /** The server-rendered conversation pane. */
  children: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === "crm" && !c.contact_id) return false;
      if (filter === "uncaptured" && c.contact_id) return false;
      if (!needle) return true;
      return (
        c.peer_phone.toLowerCase().includes(needle) ||
        (c.lead_name ?? "").toLowerCase().includes(needle) ||
        (c.peer_name ?? "").toLowerCase().includes(needle) ||
        (c.last_body ?? "").toLowerCase().includes(needle)
      );
    });
  }, [conversations, q, filter]);

  const uncaptured = conversations.filter((c) => !c.contact_id).length;
  const href = (phone: string) => `${baseHref}&peer=${encodeURIComponent(phone)}`;

  return (
    <div className={`wai ${activePeer ? "wai-open" : ""}`}>
      <style>{CSS}</style>

      <aside className="wai-list">
        <div className="wai-search">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, number or message"
            aria-label="Search conversations"
          />
          <div className="wai-chips">
            {([
              ["all", `All ${conversations.length}`],
              ["uncaptured", `Not in CRM ${uncaptured}`],
              ["crm", `Leads ${conversations.length - uncaptured}`],
            ] as [Filter, string][]).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={filter === k ? "on" : ""}
                onClick={() => setFilter(k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="wai-rows">
          {shown.length === 0 && (
            <p className="wai-none">No conversation matches that.</p>
          )}
          {shown.map((c) => {
            const name = c.lead_name || c.peer_name || c.peer_phone;
            const preview = c.last_body?.trim()
              ? c.last_body
              : c.last_media
                ? MEDIA_WORD[c.last_media] ?? "Attachment"
                : "";
            return (
              <a
                key={c.peer_phone}
                href={href(c.peer_phone)}
                className={`wai-row ${c.peer_phone === activePeer ? "on" : ""}`}
              >
                <span
                  className="wai-av"
                  style={{ background: `hsl(${hueOf(c.peer_phone)} 42% 32%)` }}
                  aria-hidden
                >
                  {initials(name, c.peer_phone) ?? <span className="wai-anon">👤</span>}
                </span>
                <span className="wai-mid">
                  <span className="wai-top">
                    <span className="wai-name">{name}</span>
                    <span className="wai-time">{listStamp(c.last_at)}</span>
                  </span>
                  <span className="wai-bot">
                    <span className={`wai-prev ${c.last_body?.trim() ? "" : "media"}`}>
                      {preview || "—"}
                    </span>
                    <span className="wai-count">{c.messages}</span>
                  </span>
                  {/* A BADGE ON EVERY ROW IS NOT A BADGE.
                      This first marked every uncaptured number. On this rep
                      that is 346 rows out of 348, so the warning appeared
                      everywhere and therefore meant nothing — and the filter
                      chip above already gives the count.
                      What is worth a mark is the rare row: the two that ARE
                      leads, and the uncaptured numbers the rep also RANG,
                      which is the difference between a wrong dial and a
                      working relationship living on one person's phone. */}
                  <span className="wai-tags">
                    {c.contact_id && <em className="tag lead">lead</em>}
                    {!c.contact_id && c.calls > 0 && (
                      <em className="tag warn">called {c.calls}× · not in CRM</em>
                    )}
                    {c.they_sent > 0 && <em className="tag in">{c.they_sent} from them</em>}
                  </span>
                </span>
              </a>
            );
          })}
        </div>
      </aside>

      <section className="wai-pane">{children}</section>
    </div>
  );
}

const CSS = `
.wai{display:grid;grid-template-columns:352px minmax(0,1fr);gap:0;
  border:1px solid rgba(255,255,255,.09);border-radius:16px;overflow:hidden;
  background:#0b1411;height:76vh;min-height:520px}
.wai-list{display:flex;flex-direction:column;min-width:0;
  border-right:1px solid rgba(255,255,255,.09);background:#111b21}
.wai-search{padding:12px;border-bottom:1px solid rgba(255,255,255,.07);flex:none}
.wai-search input{width:100%;padding:9px 13px;border-radius:999px;
  border:1px solid rgba(255,255,255,.1);background:#202c33;color:#e9edef;
  font-size:13.5px;outline:none}
.wai-search input:focus{border-color:#00a884}
.wai-search input::placeholder{color:#8696a0}
.wai-chips{display:flex;gap:6px;margin-top:9px;flex-wrap:wrap}
.wai-chips button{padding:4px 11px;border-radius:999px;cursor:pointer;
  border:1px solid rgba(255,255,255,.12);background:transparent;color:#8696a0;
  font-size:11.5px;font-weight:600;white-space:nowrap}
.wai-chips button:hover{color:#e9edef}
.wai-chips button.on{background:#00a884;border-color:#00a884;color:#06231c}
.wai-rows{overflow-y:auto;flex:1}
.wai-none{color:#8696a0;font-size:13px;padding:18px 14px;margin:0}
.wai-row{display:flex;gap:11px;padding:10px 12px;text-decoration:none;color:inherit;
  border-bottom:1px solid rgba(255,255,255,.045);align-items:flex-start}
.wai-row:hover{background:rgba(255,255,255,.04)}
.wai-row.on{background:#2a3942}
.wai-av{width:42px;height:42px;border-radius:50%;flex:none;display:grid;
  place-items:center;color:#e9edef;font-size:14px;font-weight:700;letter-spacing:.3px}
.wai-mid{min-width:0;flex:1;display:block}
.wai-top{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.wai-name{font-size:14px;font-weight:600;color:#e9edef;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wai-time{font-size:11px;color:#8696a0;flex:none}
.wai-bot{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:2px}
.wai-prev{font-size:12.5px;color:#8696a0;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;min-width:0}
.wai-prev.media{font-style:italic}
.wai-count{font-size:10.5px;color:#8696a0;background:rgba(255,255,255,.07);
  border-radius:999px;padding:1px 7px;flex:none}
.wai-tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:4px}
.wai-tags .tag{font-style:normal;font-size:10px;font-weight:600;
  padding:1px 6px;border-radius:4px;white-space:nowrap}
.tag.warn{background:rgba(245,158,11,.16);color:#f5b342}
.tag.lead{background:rgba(0,168,132,.2);color:#4fd6ae}
.tag.in{background:rgba(255,255,255,.07);color:#8696a0}
.wai-anon{font-size:18px;opacity:.75;line-height:1}
.wai-pane{min-width:0;overflow-y:auto;padding:16px}
@media (max-width:900px){
  .wai{grid-template-columns:1fr;height:auto}
  .wai-list{border-right:none;max-height:62vh}
  .wai .wai-pane{display:none}
  .wai.wai-open .wai-list{display:none}
  .wai.wai-open .wai-pane{display:block}
}
`;
