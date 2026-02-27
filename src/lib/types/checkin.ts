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
  status: "checked_in" | "already_checked_in" | "error";
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
