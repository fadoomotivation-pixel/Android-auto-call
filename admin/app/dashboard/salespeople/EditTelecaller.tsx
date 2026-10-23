"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { updateTelecallerAction, type EditResult } from "./actions";

const init: EditResult = { ok: false };

const field: React.CSSProperties = {
  padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border-strong)",
  background: "var(--panel)", color: "var(--text)", fontSize: "var(--text-footnote)", minWidth: 0,
};

function SaveButton() {
  const { pending } = useFormStatus();
  return <button className="primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</button>;
}

/**
 * A telecaller's name, their login email under it, and an Edit link that opens
 * both for change. Used on the company admin's Salespeople page and on the
 * super admin's all-companies Telecallers page; the server action decides who
 * may edit whom.
 */
export function EditTelecaller({ userId, name, email }: { userId: string; name: string | null; email: string | null }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(updateTelecallerAction, init);

  // Close on a successful save; the page re-renders with the new values.
  useEffect(() => { if (state.ok) setOpen(false); }, [state]);

  if (!open) {
    return (
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
          <span>{name || "—"}</span>
          <button className="link" type="button" onClick={() => setOpen(true)} style={{ fontSize: "var(--text-caption1)" }}>
            Edit
          </button>
        </div>
        {email && <div style={{ color: "var(--muted)", fontSize: "var(--text-caption1)" }}>{email}</div>}
        {state.ok && state.message && (
          <div style={{ color: "var(--good)", fontSize: "var(--text-caption1)", marginTop: 2 }}>{state.message}</div>
        )}
      </div>
    );
  }

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 220 }}>
      <input type="hidden" name="user_id" value={userId} />
      <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "var(--text-caption1)", color: "var(--muted)" }}>
        Name
        <input name="full_name" defaultValue={name ?? ""} required maxLength={80} style={field} autoComplete="off" />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "var(--text-caption1)", color: "var(--muted)" }}>
        Login email
        <input name="email" type="email" defaultValue={email ?? ""} required style={field} autoComplete="off" />
      </label>
      <div style={{ color: "var(--muted)", fontSize: "var(--text-caption1)", lineHeight: 1.4 }}>
        The password stays the same. If you change the email, tell them to use the new one next time they sign in.
      </div>
      {state.error && <div style={{ color: "var(--bad)", fontSize: "var(--text-caption1)" }}>{state.error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <SaveButton />
        <button type="button" className="link" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
