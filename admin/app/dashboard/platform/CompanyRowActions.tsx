"use client";

import { useEffect, useRef } from "react";
import { useFormState } from "react-dom";
import { deleteCompanyAction, renameCompanyAction, type ActionResult } from "./actions";

const init: ActionResult = { ok: false };

const btn: React.CSSProperties = {
  padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border, #333)",
  background: "transparent", color: "inherit", cursor: "pointer", fontSize: 13,
};

/** Super-admin per-company actions: rename or delete (with its data). */
export default function CompanyRowActions({ companyId, name }: { companyId: string; name: string }) {
  const [renState, renAction] = useFormState(renameCompanyAction, init);
  const [delState, delAction] = useFormState(deleteCompanyAction, init);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (renState.error) alert(renState.error); }, [renState]);
  useEffect(() => { if (delState.error) alert(delState.error); }, [delState]);

  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
      <form
        action={renAction}
        onSubmit={(e) => {
          const n = window.prompt("New company name", name);
          if (!n || !n.trim()) { e.preventDefault(); return; }
          if (nameRef.current) nameRef.current.value = n.trim();
        }}
      >
        <input type="hidden" name="company_id" value={companyId} />
        <input type="hidden" name="name" defaultValue={name} ref={nameRef} />
        <button type="submit" style={btn}>Rename</button>
      </form>
      <form
        action={delAction}
        onSubmit={(e) => {
          if (!window.confirm(`Delete "${name}" and ALL of its data — leads, calls, telecallers? This cannot be undone.`)) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="company_id" value={companyId} />
        <button type="submit" style={{ ...btn, color: "#ef4444", borderColor: "#ef4444" }}>Delete</button>
      </form>
    </div>
  );
}
