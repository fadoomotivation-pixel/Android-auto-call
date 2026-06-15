import { createCompanyAction } from "./actions";

export default function NewCompanyPage() {
  return (
    <>
      <h2>Create New Company</h2>
      <p className="subtitle">Provision a new company workspace on the platform.</p>
      
      <div className="login-box" style={{ margin: 0, width: "100%", maxWidth: 400 }}>
        <form action={createCompanyAction}>
          <div className="field">
            <label>Company Name</label>
            <input type="text" name="name" required placeholder="Acme Corp" />
          </div>
          
          <button type="submit" className="primary" style={{ marginTop: 16 }}>
            Create Company
          </button>
        </form>
      </div>
    </>
  );
}
