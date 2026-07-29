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
  join_code: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  company_id: string | null;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  sip_agent_id: string | null;
  caller_id: string | null;
  sip_server: string | null;
  sip_port: number | null;
  /** How this rep refers to themselves in generated Hindi messages:
   *  "f" = kar rahi hoon, "m" = kar raha hoon, null/"neutral" = kar rahe hain. */
  speaks_as: string | null;
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
  recording_status: string;
  recording_seconds: number | null;
  recording_source: string | null;
  off_crm: boolean;
  summary: string | null;
  summary_status: string;
}

export interface CompanyIntegration {
  company_id: string;
  uro_token: string | null;
  uro_tenant_id: string | null;
  default_caller_id: string | null;
  sip_server: string;
  sip_port: number;
  transport: string;
  wss_url: string | null;
  outbound_proxy: string | null;
  api_base_url: string;
}

export interface CompanyOverview {
  company_id: string;
  name: string;
  created_at: string;
  salespeople: number;
  campaigns: number;
  contacts: number;
  calls: number;
  last_call_at: string | null;
}

export interface TelecallerOverview {
  salesperson_id: string;
  full_name: string | null;
  is_active: boolean;
  company_id: string | null;
  company_name: string | null;
  campaigns: number;
  calls: number;
  connected: number;
  last_call_at: string | null;
  latest_campaign: string | null;
}

export interface ContactDetail {
  id: string;
  company_id: string;
  company_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  campaign_deleted: boolean;
  salesperson_id: string | null;
  salesperson_name: string | null;
  name: string | null;
  phone: string;
  email: string | null;
  contact_company: string | null;
  status: string;
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

export interface Attendance {
  id: string;
  company_id: string;
  salesperson_id: string;
  work_date: string;
  punch_in_at: string | null;
  punch_out_at: string | null;
  punch_in_lat: number | null;
  punch_in_lng: number | null;
  selfie: string | null;
  location_label: string | null;
  status: "present" | "half_day" | "absent";
  created_at: string;
}
