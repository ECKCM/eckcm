export interface Event {
  id: string;
  name_en: string;
  year: number;
  stripe_mode: string | null;
}

export interface RegistrationRow {
  id: string;
  confirmation_code: string;
  status: string;
  registration_type: string;
  start_date: string;
  end_date: string;
  nights_count: number;
  total_amount_cents: number;
  notes: string | null;
  additional_requests: string | null;
  created_at: string;
  updated_at: string;
  group_count: number;
  people_count: number;
  registrant_name: string;
  registrant_name_ko: string | null;
  registrant_email: string | null;
  registrant_phone: string | null;
  registrant_church: string | null;
  registrant_department: string | null;
  registrant_guardian_name: string | null;
  registrant_guardian_phone: string | null;
  registration_group_name: string | null;
  invoice_number: string | null;
  payment_status: string | null;
  payment_method: string | null;
  stripe_payment_intent_id: string | null;
  paid_at: string | null;
  checked_in: boolean;
  checked_out: boolean;
  room_numbers: string[];
}

export interface PersonDetail {
  first_name_en: string;
  last_name_en: string;
  display_name_ko: string | null;
  gender: string;
  birth_date: string | null;
  age_at_event: number | null;
  is_k12: boolean;
  grade: string | null;
  email: string | null;
  phone: string | null;
  phone_country: string | null;
  church_name: string | null;
  department_name: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  group_code: string;
  role: string;
  participant_code: string | null;
}

export const STATUS_OPTIONS = ["ALL", "PAID", "APPROVED", "SUBMITTED", "DRAFT", "CANCELLED", "REFUNDED"];
export const VALID_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "PAID", "CANCELLED", "REFUNDED"];

export const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PAID: "default",
  APPROVED: "default",
  SUBMITTED: "outline",
  DRAFT: "secondary",
  CANCELLED: "destructive",
  REFUNDED: "destructive",
};

export const paymentStatusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  SUCCEEDED: "default",
  PENDING: "outline",
  FAILED: "destructive",
  REFUNDED: "destructive",
  PARTIALLY_REFUNDED: "destructive",
};

export function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatTimestamp(ts: string) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function extractSeqNumber(code: string | null): string {
  return code?.match(/(\d+)$/)?.[1] ?? "-";
}
