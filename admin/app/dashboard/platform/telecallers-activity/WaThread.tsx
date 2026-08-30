/**
 * A WhatsApp conversation, rendered like WhatsApp.
 *
 * WHY THIS EXISTS AS ITS OWN COMPONENT
 *
 * There were two message renderers on this page — one for a lead's thread, one
 * for an unknown number's — and they had already started to disagree about
 * what a deleted message looks like. A conversation is the thing a super admin
 * reads to decide whether a deal is alive, so it renders in ONE place.
 *
 * WHY IT LOOKS LIKE WHATSAPP ON PURPOSE
 *
 * The person reading this is comparing it, in their head, against the app on
 * their phone. Every difference costs them a moment of translation: which side
 * is the rep, when did the day change, is that a document or a photo. Matching
 * the layout they already know is not decoration — it is what makes a
 * six-month-old thread readable in one scroll.
 *
 * THE MEDIA STATE THAT USED TO LOOK BROKEN
 *
 * 3,459 images and 630 documents were captured before this product downloaded
 * files, so their NAME is stored and the file is not. Rendering them as a bare
 * word "image" with nothing behind it reads as a bug. They now say plainly that
 * the file was not saved and why — and the ones that do have a file open.
 */

type Msg = {
  direction: "in" | "out";
  body: string | null;
  media_kind: string | null;
  file_name: string | null;
  media_path: string | null;
  transcript: string | null;
  duration_seconds: number | null;
  signal: "hot" | "risk" | null;
  deleted_at: string | null;
  edited_at: string | null;
  body_original: string | null;
  sent_at: string;
  /** Optional: only some callers select it, and it only decorates a label. */
  file_size?: number | null;
};

const IST = { timeZone: "Asia/Kolkata" } as const;

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { ...IST, year: "numeric", month: "2-digit", day: "2-digit" });
}

/** "Today", "Yesterday", or the date — the way a chat app says it. */
function dayLabel(iso: string): string {
  const k = dayKey(iso);
  const today = dayKey(new Date().toISOString());
  const yest = dayKey(new Date(Date.now() - 86400_000).toISOString());
  if (k === today) return "Today";
  if (k === yest) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-IN", { ...IST, day: "numeric", month: "short", year: "numeric" });
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { ...IST, hour: "numeric", minute: "2-digit", hour12: true });
}

function kb(n: number | null): string {
  if (!n) return "";
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

const ICON: Record<string, string> = {
  document: "📄", image: "🖼", video: "🎥", audio: "🎙", sticker: "🩹", other: "📎",
};

/**
 * An attachment, in the three states it can genuinely be in: here and openable,
 * here as a picture, or named-but-never-downloaded. The third is the common one
 * for anything older than media capture, and saying so is the whole fix.
 */
function Attachment({ m, url }: { m: Msg; url?: string }) {
  const kind = m.media_kind ?? "other";
  const label = m.file_name || `${kind}`;

  if (url && kind === "audio") {
    return (
      <div style={{ marginBottom: 4 }}>
        <audio controls preload="none" src={url} style={{ width: "100%", maxWidth: 260, display: "block" }} />
        {m.duration_seconds ? (
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{m.duration_seconds}s voice note</div>
        ) : null}
      </div>
    );
  }
  if (url && kind === "image") {
    return (
      <a href={url} target="_blank" rel="noreferrer" style={{ display: "block", marginBottom: 4 }}>
        {/* next/image cannot take a short-lived signed URL from a private
            bucket, so a plain img is the right tool here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={label} style={{ maxWidth: "100%", borderRadius: 8, display: "block" }} />
      </a>
    );
  }
  if (url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 4, textDecoration: "none",
        padding: "10px 12px", borderRadius: 8, background: "rgba(0,0,0,0.22)",
      }}>
        <span style={{ fontSize: 22 }}>{ICON[kind] ?? "📎"}</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 600, wordBreak: "break-all" }}>{label}</span>
          <span style={{ fontSize: 11, opacity: 0.75 }}>
            Open{kind === "video" ? " video" : ""}{m.file_size ? ` · ${kb(m.file_size)}` : ""}
          </span>
        </span>
      </a>
    );
  }

  // Named, never downloaded. Every attachment older than media capture is here.
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, marginBottom: 4,
      padding: "10px 12px", borderRadius: 8,
      background: "rgba(0,0,0,0.18)", border: "1px dashed rgba(255,255,255,0.18)",
    }}>
      <span style={{ fontSize: 20, opacity: 0.6 }}>{ICON[kind] ?? "📎"}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 600, wordBreak: "break-all" }}>{label}</span>
        <span style={{ fontSize: 11, opacity: 0.65 }}>
          File not saved — sent before this CRM started keeping attachments
        </span>
      </span>
    </div>
  );
}

export function WaThread({
  messages, mediaUrl, whoOut = "Rep", whoIn = "Them",
}: {
  /** Oldest first. The caller decides the order; a chat reads downwards. */
  messages: Msg[];
  mediaUrl: Map<string, string>;
  whoOut?: string;
  whoIn?: string;
}) {
  let lastDay = "";

  return (
    <div style={{
      background: "rgba(11,20,17,0.55)", borderRadius: 14, padding: "12px 10px",
      border: "1px solid rgba(255,255,255,0.07)",
    }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 10, fontSize: 11, opacity: 0.6 }}>
        <span>◀ {whoIn}</span><span>{whoOut} ▶</span>
      </div>

      {messages.map((m, i) => {
        const mine = m.direction === "out";
        const d = dayKey(m.sent_at);
        const newDay = d !== lastDay;
        lastDay = d;
        const url = m.media_path ? mediaUrl.get(m.media_path) : undefined;
        // A signal colours the EDGE of the bubble rather than the whole thing:
        // the bubble's own colour is what tells you who spoke, and losing that
        // to a highlight makes the thread harder to read, not easier.
        const edge = m.signal === "risk" ? "#ef4444" : m.signal === "hot" ? "#22c55e" : null;

        return (
          <div key={i}>
            {newDay && (
              <div style={{ display: "flex", justifyContent: "center", margin: "14px 0 10px" }}>
                <span style={{
                  fontSize: 11.5, padding: "4px 12px", borderRadius: 999,
                  background: "rgba(0,0,0,0.35)", color: "rgba(255,255,255,0.72)",
                }}>
                  {dayLabel(m.sent_at)}
                </span>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 3 }}>
              <div style={{
                maxWidth: "76%", minWidth: 90,
                padding: "7px 10px 5px",
                borderRadius: 10,
                borderTopRightRadius: mine ? 2 : 10,
                borderTopLeftRadius: mine ? 10 : 2,
                background: mine ? "#0b5c4b" : "#22292c",
                borderLeft: edge && !mine ? `3px solid ${edge}` : undefined,
                borderRight: edge && mine ? `3px solid ${edge}` : undefined,
                color: "rgba(255,255,255,0.94)",
                boxShadow: "0 1px 1px rgba(0,0,0,0.25)",
              }}>
                {m.signal && (
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: edge ?? undefined, marginBottom: 3 }}>
                    {m.signal === "risk" ? "⚠️ SOUNDS READY TO WALK" : "🔥 SOUNDS READY TO BOOK"}
                  </div>
                )}

                {m.deleted_at ? (
                  <>
                    <div style={{ fontSize: 12.5, fontStyle: "italic", opacity: 0.75, marginBottom: 3 }}>
                      🗑 Deleted by {mine ? "the rep" : "them"} — kept below
                    </div>
                    {(m.body_original || m.body) && (
                      <div style={{ fontSize: 14, whiteSpace: "pre-wrap", wordBreak: "break-word", opacity: 0.85 }}>
                        {m.body_original || m.body}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {m.media_kind && <Attachment m={m} url={url} />}
                    {m.body && (
                      <div style={{ fontSize: 14, lineHeight: 1.35, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {m.body}
                      </div>
                    )}
                    {m.transcript && (
                      <div style={{ fontSize: 12.5, marginTop: 4, fontStyle: "italic", opacity: 0.8 }}>
                        “{m.transcript}”
                      </div>
                    )}
                    {m.body_original && m.body_original !== m.body && (
                      <div style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>
                        Originally: “{m.body_original}”
                      </div>
                    )}
                  </>
                )}

                <div style={{
                  fontSize: 10.5, opacity: 0.65, marginTop: 3,
                  textAlign: "right", whiteSpace: "nowrap",
                }}>
                  {m.edited_at && !m.deleted_at ? "edited · " : ""}{clock(m.sent_at)}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
