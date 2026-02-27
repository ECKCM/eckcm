"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface OfflineCheckinEntry {
  id: string;
  token: string;
  checkinType: string;
  sessionId?: string;
  timestamp: number;
  synced: boolean;
}

const DB_NAME = "eckcm-offline-checkins";
const STORE_NAME = "checkins";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("synced", "synced", { unique: false });
      }
    };
  });
}

export function useOfflineCheckin() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const getPendingCount = useCallback(async () => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("synced");
      const request = index.count(IDBKeyRange.only(false));
      return new Promise<number>((resolve) => {
        request.onsuccess = () => {
          const count = request.result;
          setPendingCount(count);
          resolve(count);
        };
        request.onerror = () => resolve(0);
      });
    } catch {
      return 0;
    }
  }, []);

  const addOfflineCheckin = useCallback(
    async (entry: Omit<OfflineCheckinEntry, "synced">) => {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).add({ ...entry, synced: false });
      await getPendingCount();
    },
    [getPendingCount]
  );

  const syncPending = useCallback(async () => {
    if (!navigator.onLine) return;

    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, "readonly");
      const index = tx.objectStore(STORE_NAME).index("synced");
      const request = index.getAll(IDBKeyRange.only(false));

      request.onsuccess = async () => {
        const pending: OfflineCheckinEntry[] = request.result;
        if (pending.length === 0) return;

        const res = await fetch("/api/checkin/batch-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checkins: pending }),
        });

        if (res.ok) {
          const writeTx = db.transaction(STORE_NAME, "readwrite");
          const store = writeTx.objectStore(STORE_NAME);
          for (const entry of pending) {
            store.put({ ...entry, synced: true });
          }
          await getPendingCount();
        }
      };
    } catch (err) {
      console.error("[useOfflineCheckin] sync error:", err);
    }
  }, [getPendingCount]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline) {
      syncPending();
    }
  }, [isOnline, syncPending]);

  // Periodic sync every 30 seconds
  useEffect(() => {
    syncIntervalRef.current = setInterval(() => {
      if (navigator.onLine) {
        syncPending();
      }
    }, 30000);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [syncPending]);

  useEffect(() => {
    getPendingCount();
  }, [getPendingCount]);

  return {
    isOnline,
    pendingCount,
    addOfflineCheckin,
    syncPending,
  };
}
