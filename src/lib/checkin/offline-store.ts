import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "eckcm-checkin";
const DB_VERSION = 2;

interface EPassCacheEntry {
  tokenHash: string;
  participantCode: string | null;
  signedCode: string | null;
  personName: string;
  koreanName: string | null;
  confirmationCode: string;
  eventId: string;
  eventName: string;
  eventYear: number;
  isActive: boolean;
  registrationStatus: string;
}

interface PendingCheckin {
  id?: number;
  token: string;
  checkinType: string;
  sessionId: string | null;
  timestamp: string;
  nonce: string;
}

export interface CheckinLogEntry {
  id?: number;
  personName: string;
  koreanName: string | null;
  confirmationCode: string | null;
  status: "checked_in" | "already_checked_in" | "error";
  checkinType: string;
  timestamp: string;
  isOffline: boolean;
  errorMessage?: string;
}

let dbInstance: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (!db.objectStoreNames.contains("epass_cache")) {
        const store = db.createObjectStore("epass_cache", { keyPath: "tokenHash" });
        store.createIndex("by_participant_code", "participantCode", { unique: false });
      } else if (oldVersion < 2) {
        // Add index to existing store
        const tx = (db as any).transaction("epass_cache", "readwrite");
        const store = tx.objectStore("epass_cache");
        if (!store.indexNames.contains("by_participant_code")) {
          store.createIndex("by_participant_code", "participantCode", { unique: false });
        }
      }
      if (!db.objectStoreNames.contains("pending_checkins")) {
        db.createObjectStore("pending_checkins", {
          keyPath: "id",
          autoIncrement: true,
        });
      }
      if (!db.objectStoreNames.contains("checkin_log")) {
        db.createObjectStore("checkin_log", {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    },
  });

  return dbInstance;
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function cacheEPassData(
  tokens: EPassCacheEntry[]
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("epass_cache", "readwrite");
  await tx.store.clear();
  for (const entry of tokens) {
    await tx.store.put(entry);
  }
  await tx.done;
}

export async function lookupToken(
  token: string
): Promise<EPassCacheEntry | null> {
  const db = await getDB();
  const hash = await hashToken(token);
  const entry = await db.get("epass_cache", hash);
  return entry ?? null;
}

export async function lookupByParticipantCode(
  code: string
): Promise<EPassCacheEntry | null> {
  const db = await getDB();
  const tx = db.transaction("epass_cache", "readonly");
  const index = tx.store.index("by_participant_code");
  const entry = await index.get(code);
  return entry ?? null;
}

export async function getCacheCount(): Promise<number> {
  const db = await getDB();
  return db.count("epass_cache");
}

export async function addPendingCheckin(
  data: Omit<PendingCheckin, "id">
): Promise<void> {
  const db = await getDB();
  await db.add("pending_checkins", data);
}

export async function getPendingCheckins(): Promise<PendingCheckin[]> {
  const db = await getDB();
  return db.getAll("pending_checkins");
}

export async function getPendingCount(): Promise<number> {
  const db = await getDB();
  return db.count("pending_checkins");
}

export async function clearPendingCheckins(ids: number[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("pending_checkins", "readwrite");
  for (const id of ids) {
    await tx.store.delete(id);
  }
  await tx.done;
}

export async function addCheckinLog(
  entry: Omit<CheckinLogEntry, "id">
): Promise<void> {
  const db = await getDB();
  await db.add("checkin_log", entry);
}

export async function getRecentLogs(
  limit: number = 30
): Promise<CheckinLogEntry[]> {
  const db = await getDB();
  const all = await db.getAll("checkin_log");
  return all.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
}
