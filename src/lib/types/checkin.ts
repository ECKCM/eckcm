import type { CheckinType, CheckinSource } from "./database";

/**
 * Check-in record from eckcm_checkins table
 */
export interface Checkin {
  id: string;
  person_id: string;
  event_id: string;
  session_id: string | null;
  checkin_type: CheckinType;
  source: CheckinSource;
  checked_in_by: string;
  checked_in_at: string;
}

/**
 * Session record from eckcm_sessions table
 */
export interface Session {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  session_date: string;
  start_time: string;
  end_time: string;
  location: string | null;
  is_active: boolean;
  created_at: string;
}

/**
 * E-Pass token from eckcm_epass_tokens table
 */
export interface EpassToken {
  id: string;
  person_id: string;
  registration_id: string;
  token: string;
  token_hash: string;
  is_active: boolean;
  created_at: string;
}

/**
 * Check-in result from verification
 */
export interface CheckinResult {
  status: "checked_in" | "already_checked_in" | "checked_out" | "already_checked_out" | "error";
  person?: {
    name: string;
    koreanName: string | null;
  };
  event?: {
    name: string;
    year: number;
  };
  confirmationCode?: string;
  checkinType?: string;
  error?: string;
}

/**
 * Offline check-in record for IndexedDB storage
 */
export interface OfflineCheckin {
  id: string;
  token: string;
  checkinType: CheckinType;
  sessionId?: string;
  timestamp: number;
  synced: boolean;
}

/**
 * Check-in statistics
 */
export interface CheckinStats {
  total: number;
  today: number;
  byType: Record<string, number>;
}

/**
 * Scan-session lifecycle (operator-driven scanning window).
 */
export type ScanSessionStatus = "ACTIVE" | "PAUSED" | "ENDED";

export type ScanSessionKind =
  | "MAIN_CHECKIN"
  | "CHECKOUT"
  | "MEAL_BREAKFAST"
  | "MEAL_LUNCH"
  | "MEAL_DINNER"
  | "SESSION"
  | "OTHER";

export interface ScanSession {
  id: string;
  event_id: string;
  kind: ScanSessionKind;
  label: string | null;
  status: ScanSessionStatus;
  is_sandbox: boolean;
  meal_date: string | null;
  session_id: string | null;
  started_at: string;
  ended_at: string | null;
  paused_at: string | null;
  started_by: string;
  ended_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Maps a scan-session kind into the checkin_type used by eckcm_checkins. */
export const SCAN_KIND_TO_CHECKIN_TYPE: Record<ScanSessionKind, string> = {
  MAIN_CHECKIN: "MAIN",
  CHECKOUT: "MAIN", // checkout updates the existing MAIN row
  MEAL_BREAKFAST: "DINING",
  MEAL_LUNCH: "DINING",
  MEAL_DINNER: "DINING",
  SESSION: "SESSION",
  OTHER: "MAIN",
};

/** Maps a meal scan-session kind into the corresponding meal_type. */
export const MEAL_KIND_TO_MEAL_TYPE: Partial<Record<ScanSessionKind, "BREAKFAST" | "LUNCH" | "DINNER">> = {
  MEAL_BREAKFAST: "BREAKFAST",
  MEAL_LUNCH: "LUNCH",
  MEAL_DINNER: "DINNER",
};
