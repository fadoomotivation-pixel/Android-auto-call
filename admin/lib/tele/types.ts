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
  /** When the lead arrived — the last tie-break in Call now, as on Android. */
  created_at?: string | null;
  calls_total?: number | null;
  /** The longest anyone has been on the phone with them. 0 = nobody has spoken. */
  best_call_seconds?: number | null;
  /** The buyer wrote on WhatsApp and nobody answered. */
  waiting_since?: string | null;
  /** She said on a recorded call she would do something, and has not. */
  promise_due_since?: string | null;
  promise_text?: string | null;
};

/** rep_plan() (migration 0236): the same lists her Daily Pulse WhatsApp and
 *  the Android app's Today's Plan show. Only what the web app draws. */
export type DayPlan = {
  plan_day: string;
  counts: {
    call_now: number; promise_people: number; waiting: number; visits: number;
    visits_pending: number; drafts: number;
  };
  waiting: { contact_id: string; name: string | null; phone: string | null; minutes: number; text: string | null; media: string | null }[];
  promises: {
    contact_id: string; name: string | null; phone: string | null; late: boolean; oldest_days: number;
    items: { kind: string; promise: string; days: number; late: boolean }[];
  }[];
  visits: { contact_id: string; name: string | null; phone: string | null; at: string; project: string | null }[];
  drafts: { id: string; contact_id: string; name: string | null; phone: string | null; body: string; created_at: string }[];
};
