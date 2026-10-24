// Mock data for /app?demo=1 (screenshots and walkthroughs). Never touches Supabase.
import type { DayPlan, FollowUp, Lead, Profile, Stage, Today } from "./data";

const h = (hrs: number) => new Date(Date.now() + hrs * 3600000).toISOString();

export const demoProfile: Profile = { id: "demo", company_id: "demo", full_name: "Priya Sharma", role: "salesperson" };
export const demoToday: Today = { calls: 18, connected: 11, visits: 1 };
export const demoStages: Stage[] = [
  { code: "new", label: "New", sort_order: 1, is_terminal: false, rep_visible: true },
  { code: "interested", label: "Interested", sort_order: 2, is_terminal: false, rep_visible: true },
  { code: "follow_up", label: "Follow up", sort_order: 3, is_terminal: false, rep_visible: true },
  { code: "site_visit", label: "Site visit", sort_order: 4, is_terminal: false, rep_visible: true },
  { code: "booked", label: "Booked", sort_order: 5, is_terminal: true, rep_visible: true },
];
const L = (id: string, name: string, phone: string, status: string, action_state: string | null, extra: Partial<Lead> = {}): Lead => ({
  id, name, phone, status, temperature: "warm", attempts: 0, notes: null, company_name: null, updated_at: h(-2),
  action_state, due_at: null, last_call_at: null, ...extra,
});
export const demoLeads: Lead[] = [
  L("1", "Rahul Verma", "9876543210", "interested", "overdue", { notes: "Wants 2BHK near metro. Budget 75L.", last_call_at: h(-26), due_at: h(-3), company_name: "Green Valley",
    promise_due_since: h(-48), promise_text: "Send floor plan", calls_total: 3, best_call_seconds: 240 }),
  L("2", "Anita Desai", "9812345678", "new", "call_now", { company_name: "Green Valley", waiting_since: h(-3.2) }),
  L("3", "Vikram Singh", "9988776655", "follow_up", "call_now", { attempts: 1, due_at: h(-0.25) }),
  L("4", "Sneha Kapoor", "9900112233", "site_visit", "awaiting_visit", { due_at: h(5) }),
  L("5", "Arjun Mehta", "9811122233", "follow_up", "due_today", { due_at: h(2) }),
  L("6", "Pooja Nair", "9822233344", "interested", "scheduled", { due_at: h(30) }),
  L("7", "Karan Joshi", "9833344455", "not_interested", "none", { temperature: "cold", attempts: 3 }),
  L("8", "Meera Iyer", "9844455566", "interested", "no_next_step"),
  L("9", "Deepak Rao", "9855566677", "follow_up", "scheduled", { due_at: h(20), handled_today: true, last_call_at: h(-1) }),
];
export const demoFollowUps: FollowUp[] = [
  { id: "f1", contact_id: "1", phone: "9876543210", name: "Rahul Verma", due_at: h(-3), note: "Send floor plan, confirm budget" },
  { id: "f2", contact_id: "5", phone: "9811122233", name: "Arjun Mehta", due_at: h(2), note: "Call back after office" },
  { id: "f3", contact_id: "4", phone: "9900112233", name: "Sneha Kapoor", due_at: h(5), note: "Site visit reminder" },
  { id: "f4", contact_id: "6", phone: "9822233344", name: "Pooja Nair", due_at: h(30), note: "Attempt 2 — no answer last time" },
  { id: "f5", contact_id: "3", phone: "9988776655", name: "Vikram Singh", due_at: h(-0.25), note: "Asked to call after lunch" },
  { id: "f6", contact_id: "9", phone: "9855566677", name: "Deepak Rao", due_at: h(20), note: "Send brochure, then call" },
];
export const demoScanText = `Rahul Verma 98765 43210
[12/10/26, 10:42 AM] Anita: Suresh Patel - 9812O45678
Neha +91 99887 76655
Rahul V 9876543210
Ramesh 12345`;

/** Today's Plan for the demo: the shape rep_plan() returns. */
export const demoPlan: DayPlan = {
  plan_day: new Date().toISOString().slice(0, 10),
  counts: { call_now: 4, promise_people: 4, waiting: 1, visits: 1, visits_pending: 2, drafts: 1 },
  waiting: [{ contact_id: "2", name: "Anita Desai", phone: "9812345678", minutes: 190, text: "Price list bhej dijiye", media: null }],
  promises: [
    { contact_id: "1", name: "Rahul Verma", phone: "9876543210", late: true, oldest_days: 2,
      items: [{ kind: "send", promise: "Send floor plan", days: 2, late: true }, { kind: "visit", promise: "Fix Sunday site visit", days: 2, late: true }] },
    { contact_id: "8", name: "Meera Iyer", phone: "9844455566", late: true, oldest_days: 3,
      items: [{ kind: "price_check", promise: "Check the loan offer and call back", days: 3, late: true }] },
    { contact_id: "6", name: "Pooja Nair", phone: "9822233344", late: false, oldest_days: 0,
      items: [{ kind: "send", promise: "Send location", days: 0, late: false }] },
    { contact_id: "9", name: "Deepak Rao", phone: "9855566677", late: false, oldest_days: 0,
      items: [{ kind: "send", promise: "Send brochure", days: 0, late: false }] },
  ],
  visits: [{ contact_id: "4", name: "Sneha Kapoor", phone: "9900112233", at: h(18), project: "Green Valley" }],
  drafts: [{ id: "d1", contact_id: "3", name: "Vikram Singh", phone: "9988776655", created_at: h(-1),
    body: "Hello sir, Priya this side from Green Valley. As we spoke today, sending the location and video now. Is tomorrow 11 AM good for a call?" }],
};
