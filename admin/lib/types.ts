export type UserRole = "admin" | "salesperson";

export type ContactStatus =
  | "new" | "queued" | "called" | "no_answer" | "busy"
  | "interested" | "not_interested" | "callback" | "dnc" | "invalid";

export type CallOutcome =
  | "connected" | "no_answer" | "busy" | "failed"
  | "voicemail" | "rejected" | "cancelled";

export interface Company {
  id: string;
  name: string;
  owner_id: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  company_id: string | null;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface Contact {
  id: string;
  company_id: string;
  salesperson_id: string | null;
  import_batch_id: string | null;
  name: string | null;
  phone: string;
  email: string | null;
  company_name: string | null;
  notes: string | null;
  status: ContactStatus;
  created_at: string;
  updated_at: string;
}

export interface CallLog {
  id: string;
  company_id: string;
  salesperson_id: string;
  contact_id: string | null;
  phone: string;
  direction: string;
  outcome: CallOutcome | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number;
  sim_slot: number | null;
  notes: string | null;
  created_at: string;
}

export interface SalespersonStats {
  salesperson_id: string;
  full_name: string | null;
  company_id: string;
  total_contacts: number;
  total_calls: number;
  connected_calls: number;
  no_answer_calls: number;
  total_talk_seconds: number;
  last_call_at: string | null;
}
