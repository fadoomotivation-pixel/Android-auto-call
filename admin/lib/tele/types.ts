// The lead row the /app web app works with: contacts + its v_lead_workstate row.
// Its own file so lib/tele/work.ts can be tested without the Supabase client.
export type Lead = {
  id: string;
  name: string | null;
  phone: string;
  status: string;
  temperature: string | null;
  attempts: number;
  notes: string | null;
  company_name: string | null;
  updated_at: string | null;
  action_state?: string | null;
  due_at?: string | null;
  last_call_at?: string | null;
  handled_today?: boolean | null;
  stage?: string | null;
};
