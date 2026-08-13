"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Asset = {
  id: string;
  kind: string;
  title: string;
  url: string;
  description: string | null;
  active: boolean;
  created_at: string;
  storage_path: string | null;
  trained: boolean | null;
};

const KINDS = ["brochure", "image", "video", "review", "testimonial", "link", "other"] as const;

const BUCKET = "content-library";

/**
 * What the brain should file this under. knowledge-ingest accepts a fixed set
 * (brochure, price, faq, call, note, guide, offer, win) and the library's own
 * vocabulary is different, so map rather than pass it through and get silently
 * downgraded to "note".
 */
function brainKind(kind: string): string {
  if (kind === "brochure") return "brochure";
  if (kind === "review" || kind === "testimonial") return "note";
  return "guide";
}

/** Only these can become text. A video or a JPEG has nothing to teach the brain. */
function isReadable(file: File): boolean {
  const n = file.name.toLowerCase();
  return file.type === "application/pdf" || n.endsWith(".pdf") ||
    file.type === "text/plain" || n.endsWith(".txt");
}

/** Storage keys must be ASCII-safe and collision-proof; the title keeps the pretty name. */
function safeKey(companyId: string, name: string): string {
  const clean = name.normalize("NFKD").replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-").slice(-80);
  return `${companyId}/${crypto.randomUUID()}-${clean}`;
}

const input: React.CSSProperties = {
  padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)",
  background: "rgba(255,255,255,0.02)", color: "var(--text)", width: "100%", outline: "none",
};
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 };
const lbl: React.CSSProperties = { fontSize: 13, color: "var(--muted)", fontWeight: 500 };

export function ContentLibrary(
  { companyId, assets, isSuper = false }: { companyId: string; assets: Asset[]; isSuper?: boolean },
) {
  const router = useRouter();
  const [form, setForm] = useState({ kind: "brochure", title: "", url: "", description: "" });
  const [file, setFile] = useState<File | null>(null);
  const [teach, setTeach] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    e.target.value = ""; // so the same file can be re-picked after an error
    setErr(null); setNote(null);
    setFile(f);
    if (f && !form.title.trim()) set("title", f.name.replace(/\.[a-z0-9]+$/i, ""));
  }

  /**
   * Read the file's text in the BROWSER, exactly as the RAG trainer does.
   *
   * Deliberately not on the server: the edge functions have a CPU budget that a
   * hundred-page brochure blows through, and pdf.js is already here and already
   * proven on this codebase. Returns null when there is no text to read — a
   * scanned brochure is an image of words, not words.
   */
  async function readText(f: File): Promise<string | null> {
    if (f.type === "text/plain" || f.name.toLowerCase().endsWith(".txt")) {
      const t = (await f.text()).trim();
      return t.length >= 20 ? t : null;
    }
    try {
      const pdfjs = await import("pdfjs-dist");
      // Served from our own origin by the copy-pdf-worker script — webpack never
      // has to bundle the .mjs.
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
      let out = "";
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        out += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
      }
      const clean = out.replace(/[ \t]+/g, " ").trim();
      return clean.length >= 20 ? clean : null;
    } catch {
      return null;
    }
  }

  /**
   * Feed the text to the brain, in batches.
   *
   * knowledge-ingest embeds a slice per call and returns `done` — a whole
   * brochure at once blew the edge CPU budget and returned HTTP 546, which is
   * why the loop exists rather than a single request.
   */
  async function teachBrain(text: string, title: string, kind: string): Promise<boolean> {
    const supabase = createClient();
    const base = {
      text,
      title,
      source_kind: brainKind(kind),
      scope: "company",
      // A super admin is acting on the company they picked, not on their own.
      ...(isSuper ? { company_id: companyId } : {}),
      source_id: `content:${companyId}:${title.toLowerCase().replace(/\s+/g, "-").slice(0, 60)}`,
    };
    let offset = 0;
    for (let guard = 0; guard < 200; guard++) {
      const { data, error } = await supabase.functions.invoke("knowledge-ingest", {
        body: { ...base, offset },
      });
      const d = data as { ok?: boolean; next?: number | null; done?: boolean } | null;
      if (error || d?.ok === false) return false;
      if (d?.done || d?.next == null) return true;
      offset = d.next;
    }
    return false;
  }

  async function add() {
    const title = form.title.trim();
    if (!title) { setErr("Give it a title — that is what the rep sees in the app."); return; }
    if (!file && !form.url.trim()) { setErr("Choose a file, or paste a link."); return; }

    setSaving(true); setErr(null); setNote(null);
    const supabase = createClient();
    let url = form.url.trim();
    let storagePath: string | null = null;
    let trained: boolean | null = null;

    try {
      if (file) {
        setStep("Uploading…");
        const key = safeKey(companyId, file.name);
        const up = await supabase.storage.from(BUCKET).upload(key, file, {
          cacheControl: "3600", upsert: false, contentType: file.type || undefined,
        });
        if (up.error) throw new Error(up.error.message);
        storagePath = key;
        url = supabase.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;

        // Teaching is best-effort and must never cost the upload. A brochure the
        // AI could not read is still a brochure a rep can send — which is why
        // `trained` records what happened instead of the upload failing.
        if (teach && isReadable(file)) {
          setStep("Reading the file…");
          const text = await readText(file);
          if (!text) {
            trained = false;
            setNote("Uploaded. The AI could not read any text in it — a scanned PDF is a picture of words. Reps can still share it.");
          } else {
            setStep("Teaching the AI…");
            trained = await teachBrain(text, title, form.kind);
            if (!trained) setNote("Uploaded and shareable, but the AI training step failed. Try it again from the RAG page.");
          }
        }
      }

      setStep("Saving…");
      const { error } = await supabase.from("content_assets").insert({
        company_id: companyId,
        kind: form.kind,
        title,
        url,
        description: form.description.trim() || null,
        storage_path: storagePath,
        trained,
      });
      if (error) {
        // NEVER leave the file behind. A row that failed to save with its file
        // still in the bucket is an orphan nobody can see, delete, or account
        // for — and the next attempt uploads a second copy.
        if (storagePath) await supabase.storage.from(BUCKET).remove([storagePath]);
        throw new Error(error.message);
      }

      setForm({ kind: "brochure", title: "", url: "", description: "" });
      setFile(null);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add that.");
    } finally {
      setSaving(false);
      setStep(null);
    }
  }

  async function toggleActive(a: Asset) {
    const supabase = createClient();
    const { error } = await supabase.from("content_assets").update({ active: !a.active }).eq("id", a.id);
    if (!error) router.refresh();
  }

  async function remove(a: Asset) {
    if (!confirm(`Delete "${a.title}"?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("content_assets").delete().eq("id", a.id);
    if (error) return;
    // The row is the record; the file follows it out. Order matters — deleting
    // the file first and then failing on the row would leave a library entry
    // pointing at nothing, which a rep would send to a customer.
    if (a.storage_path) await supabase.storage.from(BUCKET).remove([a.storage_path]);
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 760 }}>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Add content</h3>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 12 }}>
          <div style={field}>
            <label style={lbl}>Type</label>
            <select style={input} value={form.kind} onChange={(e) => set("kind", e.target.value)}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div style={field}>
            <label style={lbl}>Title</label>
            <input style={input} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Brij Vatika brochure" />
          </div>
        </div>

        {/* The file comes first. Every company here keeps its brochures as PDFs
            on somebody's laptop, which is exactly why the library sat empty —
            "paste a URL" asked them to publish the file somewhere else first. */}
        <div style={field}>
          <label style={lbl}>File</label>
          <input
            type="file"
            onChange={onPick}
            accept=".pdf,.txt,image/png,image/jpeg,image/webp,video/mp4,video/quicktime"
            style={{ ...input, padding: "8px 10px" }}
          />
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            PDF, image or video, up to 50 MB. {file ? `Selected: ${file.name}` : "Or paste a link below instead."}
          </div>
        </div>

        {file && isReadable(file) && (
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: "var(--text)" }}>
            <input type="checkbox" checked={teach} onChange={(e) => setTeach(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              Also teach the AI from this file
              <div style={{ color: "var(--muted)", fontSize: 12 }}>
                Its text goes into this company&apos;s brain, so the AI Coach can quote it to reps.
                Scanned PDFs have no text to read.
              </div>
            </span>
          </label>
        )}

        <div style={field}>
          <label style={lbl}>{file ? "URL (not needed — you picked a file)" : "URL"}</label>
          <input
            style={{ ...input, opacity: file ? 0.5 : 1 }}
            value={form.url}
            disabled={!!file}
            onChange={(e) => set("url", e.target.value)}
            placeholder="https://…"
          />
        </div>
        <div style={field}>
          <label style={lbl}>Description (optional)</label>
          <input style={input} value={form.description} onChange={(e) => set("description", e.target.value)} />
        </div>
        {err && <div style={{ color: "var(--danger, #ef4444)", fontSize: 13 }}>{err}</div>}
        {note && <div style={{ color: "#f59e0b", fontSize: 13 }}>{note}</div>}
        <div>
          <button className="primary" onClick={add} disabled={saving}>
            {saving ? (step ?? "Adding…") : "Add to library"}
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Library ({assets.length})</h3>
        {assets.length === 0
          ? <div className="empty">No content yet. Upload a brochure or paste a link above.</div>
          : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12 }}>
                  <th style={{ padding: "6px 4px" }}>Type</th>
                  <th style={{ padding: "6px 4px" }}>Title</th>
                  <th style={{ padding: "6px 4px" }}>In the AI brain</th>
                  <th style={{ padding: "6px 4px" }}>Status</th>
                  <th style={{ padding: "6px 4px" }}></th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 4px", textTransform: "capitalize" }}>
                      {a.kind}{a.storage_path && <span style={{ color: "var(--muted)" }}> · file</span>}
                    </td>
                    <td style={{ padding: "8px 4px" }}>
                      <a href={a.url} target="_blank" rel="noreferrer" style={{ color: "var(--text)" }}>{a.title}</a>
                      {a.description && <div style={{ color: "var(--muted)", fontSize: 12 }}>{a.description}</div>}
                    </td>
                    {/* Three states, never two. "No" and "we never tried" are
                        different answers to "why doesn't the AI know this?" */}
                    <td style={{ padding: "8px 4px", fontSize: 13 }}>
                      {a.trained === true
                        ? <span style={{ color: "#16a34a", fontWeight: 600 }}>🧠 Yes</span>
                        : a.trained === false
                        ? <span style={{ color: "#f59e0b" }} title="No readable text — likely a scan">No text to read</span>
                        : <span style={{ color: "var(--muted)" }}>—</span>}
                    </td>
                    <td style={{ padding: "8px 4px" }}>
                      <button className="link" onClick={() => toggleActive(a)}>
                        {a.active ? "✅ Active" : "⏸ Hidden"}
                      </button>
                    </td>
                    <td style={{ padding: "8px 4px", textAlign: "right" }}>
                      <button className="link" onClick={() => remove(a)} style={{ color: "var(--danger, #ef4444)" }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
