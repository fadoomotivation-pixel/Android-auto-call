"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { setCompanyBrandingAction, type ActionResult } from "./actions";

const init: ActionResult = { ok: false };
const DEFAULT = "#2563EB";

const btn: React.CSSProperties = {
  padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border, #333)",
  background: "transparent", color: "inherit", cursor: "pointer", fontSize: 13,
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="primary" style={{ width: "auto", padding: "9px 20px" }} disabled={pending}>
      {pending ? "Saving…" : "Save branding"}
    </button>
  );
}

/**
 * Super-admin white-label editor: pick a brand colour and upload a logo for a
 * company — no code, no SQL. Shows a live preview of the app's home hero so you
 * can see exactly what that company's reps will see.
 */
const REPO = "fadoomotivation-pixel/Android-auto-call";
const CHANNELS: { value: string; label: string }[] = [
  { value: "android-latest", label: "Call Pro AI (standard)" },
  { value: "android-sndeveloper", label: "SN Developer" },
  { value: "android-manasproperty", label: "Manas Property" },
];
function apkUrlFor(channel: string): string {
  const asset = channel === "android-latest" ? "app-debug.apk" : `app-${channel.replace("android-", "")}-debug.apk`;
  return `https://github.com/${REPO}/releases/download/${channel}/${asset}`;
}

export default function CompanyBranding({
  companyId, name, brandColor, logoUrl, appChannel,
}: { companyId: string; name: string; brandColor: string | null; logoUrl: string | null; appChannel: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(setCompanyBrandingAction, init);

  const [custom, setCustom] = useState(!!brandColor);
  const [color, setColor] = useState(brandColor || DEFAULT);
  const [logoPreview, setLogoPreview] = useState<string | null>(logoUrl);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [channel, setChannel] = useState(appChannel || "android-latest");
  const [copied, setCopied] = useState(false);
  const objUrl = useRef<string | null>(null);

  useEffect(() => {
    if (state.ok) { setOpen(false); router.refresh(); }
    else if (state.error) alert(state.error);
  }, [state, router]);

  useEffect(() => () => { if (objUrl.current) URL.revokeObjectURL(objUrl.current); }, []);

  const heroBg = custom ? color : DEFAULT;

  return (
    <>
      <button type="button" style={btn} onClick={() => setOpen(true)}>🎨 Brand</button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(560px, 100%)", maxHeight: "90vh", overflow: "auto", background: "var(--panel, #16181d)", border: "1px solid var(--border, #333)", borderRadius: 16, padding: 22 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <strong style={{ fontSize: 16 }}>Brand · {name}</strong>
              <button type="button" onClick={() => setOpen(false)} style={{ ...btn, border: "none" }}>✕</button>
            </div>

            {/* Live preview of the app's home hero for this company. */}
            <div style={{ borderRadius: 16, padding: 18, marginBottom: 18, background: heroBg, color: "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {logoPreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoPreview} alt="logo" style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover", background: "rgba(255,255,255,0.15)" }} />
                )}
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.08em" }}>{name.toUpperCase()}</div>
              </div>
              <div style={{ marginTop: 10, fontSize: 18, fontWeight: 800 }}>Good day, Rahul 👋</div>
              <div style={{ marginTop: 2, fontSize: 13, opacity: 0.9 }}>Real estate sales, simplified.</div>
            </div>

            <form action={action}>
              <input type="hidden" name="company_id" value={companyId} />
              <input type="hidden" name="brand_color" value={custom ? color : ""} />
              <input type="hidden" name="remove_logo" value={removeLogo && !logoPreview ? "1" : ""} />
              <input type="hidden" name="app_channel" value={channel} />

              {/* Colour */}
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} />
                <span>Custom brand colour</span>
              </label>
              {custom && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 46, height: 34, border: "none", background: "none", cursor: "pointer" }} />
                  <input
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    spellCheck={false}
                    style={{ width: 110, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border, #333)", background: "rgba(255,255,255,0.03)", color: "var(--text)", fontFamily: "monospace" }}
                  />
                  <span className="subtitle" style={{ fontSize: 12 }}>Reps ki app isi rang me dikhegi</span>
                </div>
              )}

              {/* Logo */}
              <div style={{ display: "grid", gap: 6, marginBottom: 18 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Logo</span>
                <input
                  type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (objUrl.current) { URL.revokeObjectURL(objUrl.current); objUrl.current = null; }
                    if (f) { const u = URL.createObjectURL(f); objUrl.current = u; setLogoPreview(u); setRemoveLogo(false); }
                  }}
                />
                {logoPreview && (
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)", cursor: "pointer" }}>
                    <input type="checkbox" checked={removeLogo} onChange={(e) => { setRemoveLogo(e.target.checked); if (e.target.checked) setLogoPreview(null); }} />
                    Remove logo
                  </label>
                )}
                <span className="subtitle" style={{ fontSize: 12 }}>PNG / JPG / SVG, under 2 MB. Square looks best.</span>
              </div>

              {/* App build + shareable APK link for this company. */}
              <div style={{ display: "grid", gap: 6, marginBottom: 18, paddingTop: 14, borderTop: "1px solid var(--border, #333)" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>App build (APK to give this company)</span>
                <select
                  value={channel}
                  onChange={(e) => { setChannel(e.target.value); setCopied(false); }}
                  style={{ padding: "9px 10px", borderRadius: 8, border: "1px solid var(--border, #333)", background: "rgba(255,255,255,0.03)", color: "var(--text)" }}
                >
                  {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                  <a href={apkUrlFor(channel)} target="_blank" rel="noreferrer"
                    style={{ flex: 1, fontSize: 12.5, color: "#60a5fa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {apkUrlFor(channel)}
                  </a>
                  <button type="button" style={btn} onClick={() => {
                    navigator.clipboard?.writeText(apkUrlFor(channel)); setCopied(true);
                  }}>{copied ? "Copied ✓" : "Copy link"}</button>
                </div>
                <span className="subtitle" style={{ fontSize: 12 }}>Ye link company ko bhejo — install karke app khud update hoti rahegi. (Pick the matching build; Save to remember it.)</span>
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" style={btn} onClick={() => setOpen(false)}>Cancel</button>
                <SaveButton />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
