import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — SalesAutoCall",
};

// Public privacy policy page (Google Play requires a public privacy URL).
// Edit the placeholders (company name / contact email) before publishing.
export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px", lineHeight: 1.6 }}>
      <h1>SalesAutoCall — Privacy Policy</h1>
      <p><em>Last updated: 2026-06-08</em></p>

      <p>
        SalesAutoCall (&quot;the app&quot;) is a business-to-business sales-productivity
        tool used by a company&apos;s own sales agents. This policy explains what data the
        app handles and why.
      </p>
      <ul>
        <li><strong>Provider:</strong> [Your Company Legal Name]</li>
        <li><strong>Contact:</strong> [privacy@yourcompany.com]</li>
      </ul>

      <h2>What we collect</h2>
      <ul>
        <li>Salesperson account: name, phone, email — for authentication and attributing activity.</li>
        <li>Imported contacts: name, phone, email, company, notes — the list the agent calls.</li>
        <li>Call logs: phone dialed, timestamps, duration, outcome, SIM slot — for productivity reporting.</li>
      </ul>
      <p>
        The app does <strong>not</strong> record or upload call audio, does not read your
        device&apos;s existing contacts or call history, and does not use the data for advertising.
      </p>

      <h2>Permissions</h2>
      <ul>
        <li><strong>Phone (CALL_PHONE)</strong> — to place outbound calls to imported business contacts.</li>
        <li><strong>Phone state (READ_PHONE_STATE)</strong> — to detect when a call ends so the next call can be queued and logged. Call content is never logged.</li>
        <li><strong>Notifications</strong> — to show auto-dial progress.</li>
      </ul>

      <h2>Data sharing &amp; storage</h2>
      <p>
        Data is transmitted over encrypted HTTPS/TLS to our cloud backend (Supabase) and is
        isolated per company using row-level security. We do not sell personal data or share it
        with third parties except our infrastructure provider (Supabase) acting as a data processor.
      </p>

      <h2>Consent &amp; Do-Not-Call</h2>
      <p>
        Agents must only call people who have consented and must comply with applicable
        telemarketing / Do-Not-Call (DND) regulations. Contacts marked &quot;DNC&quot; are never dialed.
      </p>

      <h2>Retention &amp; deletion</h2>
      <p>
        Company admins can delete contacts and account data from the dashboard. To request
        deletion of your personal data, contact [privacy@yourcompany.com].
      </p>

      <h2>Children</h2>
      <p>The app is intended for business use by adults and is not directed at children.</p>
    </main>
  );
}
