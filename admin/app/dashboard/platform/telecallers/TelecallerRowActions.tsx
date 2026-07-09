"use client";

import { useEffect, useRef } from "react";
import { useFormState } from "react-dom";
import { deleteTelecallerAction, resetTelecallerPasswordAction, type ActionResult } from "../actions";

const init: ActionResult = { ok: false };

const btn: React.CSSProperties = {
  padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border, #333)",
  background: "transparent", color: "inherit", cursor: "pointer", fontSize: 13,
};

/** Super-admin per-telecaller actions: reset password or delete the account. */
export default function TelecallerRowActions({ userId, name }: { userId: string; name: string }) {
  const [pwState, pwAction] = useFormState(resetTelecallerPasswordAction, init);
  const [delState, delAction] = useFormState(deleteTelecallerAction, init);
  const pwRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pwState.error) alert(pwState.error);
    else if (pwState.ok && pwState.message) alert(`✓ ${pwState.message} for ${name}`);
  }, [pwState, name]);
  useEffect(() => { if (delState.error) alert(delState.error); }, [delState]);

  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
      <form
        action={pwAction}
        onSubmit={(e) => {
          const p = window.prompt(`New password for ${name} (min 6 characters)`);
          if (p === null) { e.preventDefault(); return; }
          if (p.length < 6) { e.preventDefault(); alert("Password must be at least 6 characters"); return; }
          if (pwRef.current) pwRef.current.value = p;
        }}
      >
        <input type="hidden" name="user_id" value={userId} />
        <input type="hidden" name="password" ref={pwRef} />
        <button type="submit" style={btn}>Reset password</button>
      </form>
      <form
        action={delAction}
        onSubmit={(e) => {
          if (!window.confirm(`Delete telecaller "${name}"? Their login is removed. This cannot be undone.`)) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="user_id" value={userId} />
        <button type="submit" style={{ ...btn, color: "#ef4444", borderColor: "#ef4444" }}>Delete</button>
      </form>
    </div>
  );
}
