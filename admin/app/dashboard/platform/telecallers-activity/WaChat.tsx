"use client";

import { WaThread } from "./WaThread";

/**
 * The right-hand pane, rendered from data the inbox fetched rather than from a
 * page reload.
 *
 * This is the same content the server renders for a direct ?peer= link — the
 * header, the who-spoke-last bar, the thread, the capture form. It is a
 * separate component because the server and the client both need it and it
 * must not be allowed to drift into two versions that disagree, which is
 * exactly what happened to the message renderer before WaThread existed.
 */

export type ThreadMsg = {
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
  peer_name: string | null;
  sent_at: string;
  sender_phone: string | null;
  sender_name: string | null;
  is_group: boolean | null;
  decrypt_failed: boolean | null;
  decrypt_error: string | null;
  media_status: string | null;
  media_error: string | null;
  file_size: number | null;
};

const IST = { timeZone: "Asia/Kolkata" } as const;

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    ...IST, day: "numeric", month: "short", year: "numeric",
  });
}

export function WaChat({
  messages, urls, warnings, peer, repId, repName, companyName, days, captureAction,
}: {
  /** Newest first, as the RPC returns it. */
  messages: ThreadMsg[];
  urls: Record<string, string>;
  warnings: string[];
  peer: string;
  repId: string;
  repName: string;
  companyName: string;
  days: number;
  /** The server action, handed down so the form works from a client pane. */
  captureAction: (formData: FormData) => void | Promise<void>;
}) {
  // The RPC returns newest first; a chat reads downwards.
  const ordered = [...messages].reverse();
  const named = messages.find((m) => m.peer_name)?.peer_name ?? null;
  const mediaUrl = new Map(Object.entries(urls));

  const last = ordered[ordered.length - 1];
  const lastIn = [...ordered].reverse().find((x) => x.direction === "in");
  const owed = last?.direction === "in";
  const waitingMins = lastIn && owed
    ? Math.floor((Date.now() - new Date(lastIn.sent_at).getTime()) / 60000)
    : 0;
  const human = waitingMins >= 1440
    ? `${Math.floor(waitingMins / 1440)} day${Math.floor(waitingMins / 1440) === 1 ? "" : "s"}`
    : waitingMins >= 60 ? `${Math.floor(waitingMins / 60)} hr` : `${waitingMins} min`;
  const hot = ordered.filter((x) => x.signal === "hot").length;
  const risk = ordered.filter((x) => x.signal === "risk").length;

  const withFile = ordered.filter((x) => x.media_kind);
  const got = withFile.filter((x) => x.media_path).length;
  const coming = withFile.filter(
    (x) => !x.media_path && (x.media_status ?? "queued") === "queued",
  ).length;
  const allIn = got === withFile.length;

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <strong style={{ fontSize: 17 }}>{named || peer}</strong>
        <div className="subtitle" style={{ fontSize: 12.5, marginTop: 2 }}>
          {named ? `${peer} · ` : ""}{ordered.length} messages
        </div>
        {ordered.length > 0 && (
          <div className="subtitle" style={{ fontSize: 12, marginTop: 2, opacity: 0.85 }}>
            {day(ordered[0].sent_at)}
            {" → last message "}
            <strong style={{ color: "#e9edef" }}>{day(ordered[ordered.length - 1].sent_at)}</strong>
            {messages.length >= 400 && " · showing the latest 400"}
          </div>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="card" style={{
          marginBottom: 12, padding: 10, fontSize: 12.5,
          background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.35)",
        }}>
          {warnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}

      {last && (
        <div className="card" style={{
          marginBottom: 14, padding: 12,
          background: owed ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.03)",
          border: `1px solid ${owed ? "rgba(239,68,68,0.28)" : "var(--border)"}`,
        }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
            <span>
              {owed
                ? <><strong style={{ color: "#ef4444" }}>They spoke last</strong> — waiting {human}</>
                : <><strong>Rep spoke last</strong> — ball is with the buyer</>}
            </span>
            {hot > 0 && <span style={{ color: "#22c55e" }}>🔥 {hot} buying signal{hot === 1 ? "" : "s"}</span>}
            {risk > 0 && <span style={{ color: "#ef4444" }}>⚠️ {risk} walk-away signal{risk === 1 ? "" : "s"}</span>}
            <span style={{ opacity: 0.7 }}>{ordered.length} messages</span>
            {withFile.length > 0 && (
              <span style={{ color: allIn ? "#22c55e" : coming > 0 ? "#f59e0b" : "#8696a0" }}>
                📎 {got}/{withFile.length} file{withFile.length === 1 ? "" : "s"} downloaded
                {!allIn && coming > 0 ? ` · ${coming} still coming` : ""}
              </span>
            )}
          </div>
        </div>
      )}

      <WaThread messages={ordered} mediaUrl={mediaUrl} whoIn={named ?? peer} whoOut={repName || "Rep"} />

      <div className="card" style={{ marginTop: 16, padding: 14 }}>
        <strong>Is this a buyer?</strong>
        <p className="subtitle" style={{ marginTop: 4, marginBottom: 10 }}>
          Then capture them. The lead is created in {companyName.trim()}, assigned to{" "}
          {repName || "this telecaller"}, and <strong>all {messages.length} messages above
          move onto the lead</strong> — so it opens with its history instead of blank. If they are
          already a lead, this adopts that one rather than making a second.
        </p>
        <form action={captureAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input type="hidden" name="rep" value={repId} />
          <input type="hidden" name="peer" value={peer} />
          <input type="hidden" name="days" value={String(days)} />
          <input name="name" placeholder="Their name (optional)" defaultValue={named ?? ""}
            style={{
              padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)",
              background: "rgba(255,255,255,0.02)", color: "var(--text)", minWidth: 220,
            }} />
          <button className="btn" type="submit">Add as lead</button>
        </form>
      </div>

      <p className="subtitle" style={{ marginTop: 14, fontSize: 12.5 }}>
        If it reads like a colleague or something personal, it is neither a buyer nor a problem —
        leave it. This list is a shortlist to judge, not a verdict.
      </p>
    </>
  );
}
