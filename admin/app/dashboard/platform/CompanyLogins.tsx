"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { resetTelecallerPasswordAction, type ActionResult } from "./actions";

export type CompanyAdmin = { id: string; full_name: string | null; company_id: string | null };

const init: ActionResult = { ok: false };
const btn: React.CSSProperties = {
  padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border, #333)",
  background: "transparent", color: "inherit", cursor: "pointer", fontSize: 13,
};

function SetBtn() {
  const { pending } = useFormStatus();
  return <button type="submit" style={btn} disabled={pending}>{pending ? "…" : "Set password"}</button>;
}

/** One admin row: type a new password and set it. */
function AdminReset({ admin }: { admin: CompanyAdmin }) {
  const [state, action] = useFormState(resetTelecallerPasswordAction, init);
  const [pw, setPw] = useState("");
  useEffect(() => {
    if (state.ok) { setPw(""); alert(state.message ?? "Password updated ✓"); }
    else if (state.error) alert(state.error);
  }, [state]);
  return (
    <form action={action} style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 0" }}>
      <input type="hidden" name="user_id" value={admin.id} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{admin.full_name || "Admin"}</div>
      </div>
      <input
        name="password" value={pw} onChange={(e) => setPw(e.target.value)}
        placeholder="New password" type="text" autoComplete="off"
        style={{ width: 160, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border, #333)", background: "rgba(255,255,255,0.03)", color: "var(--text)" }}
      />
      <SetBtn />
    </form>
  );
}

/**
 * Super-admin: change a company's admin login password — no technical steps.
 * Lists the company's admin account(s); type a new password and set it.
 */
export default function CompanyLogins({ name, admins }: { name: string; admins: CompanyAdmin[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" style={btn} onClick={() => setOpen(true)}>🔑 Password</button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(460px, 100%)", maxHeight: "90vh", overflow: "auto", background: "var(--panel, #16181d)", border: "1px solid var(--border, #333)", borderRadius: 16, padding: 22 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <strong style={{ fontSize: 16 }}>Login · {name}</strong>
              <button type="button" onClick={() => setOpen(false)} style={{ ...btn, border: "none" }}>✕</button>
            </div>
            <p className="subtitle" style={{ marginTop: 0, marginBottom: 12 }}>Set a new password for this company&apos;s admin login (min 6 characters).</p>
            {admins.length === 0 ? (
              <div className="empty">No admin account for this company yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {admins.map((a) => <AdminReset key={a.id} admin={a} />)}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
