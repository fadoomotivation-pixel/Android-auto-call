"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createTelecallerAction } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="primary" style={{ marginTop: 16 }} disabled={pending}>
      {pending ? "Creating..." : "Create Telecaller"}
    </button>
  );
}

export function NewTelecallerForm({ companies }: { companies: { id: string; name: string }[] }) {
  const [state, formAction] = useFormState(createTelecallerAction, { error: "" });

  return (
    <form action={formAction}>
      {state?.error && <div className="error" style={{ marginBottom: 16 }}>{state.error}</div>}
      
      <div className="field">
        <label>Company</label>
        <select name="company_id" required style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)" }}>
          <option value="">Select Company</option>
          {companies?.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Full Name</label>
        <input type="text" name="name" required placeholder="John Doe" />
      </div>

      <div className="field">
        <label>Email</label>
        <input type="email" name="email" required placeholder="john@example.com" />
      </div>

      <div className="field">
        <label>Password</label>
        <input type="password" name="password" required placeholder="Minimum 6 characters" minLength={6} />
      </div>

      <div className="field">
        <label>Phone (Optional)</label>
        <input type="tel" name="phone" placeholder="+1234567890" />
      </div>
      
      <SubmitButton />
    </form>
  );
}
