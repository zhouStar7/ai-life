import type { Trip } from '../types';

const STORE = 'snapshot';
export const demoMode = import.meta.env.VITE_AI_LIFE_MODE === 'demo';
export const CACHE_CHANGED = 'ai-life-packing-cache-changed';

export function readSessionHint() {
  const value = document.cookie.match(/(?:^|;\s*)ailife-context=([a-f0-9]{64})(?:;|$)/)?.[1];
  return value ?? null;
}

function snapshotKey(memberId: string | null) {
  return memberId === null ? 'demo' : `account:${memberId}`;
}

export interface PackingSnapshot {
  savedAt: string;
  trip: { title: string; packing: { text: string; done: boolean }[] } | null;
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('ai-life', 3);
    request.onupgradeneeded = (event) => {
      // Purge legacy full snapshots and personal packing records without an account key.
      if (event.oldVersion < 2) {
        if (request.result.objectStoreNames.contains(STORE)) request.result.deleteObjectStore(STORE);
        request.result.createObjectStore(STORE);
      } else {
        request.transaction?.objectStore(STORE).delete('personal');
      }
    };
    request.onblocked = () => reject(new Error('离线缓存正在被其他页面使用'));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function changeCache(memberId: string | null, snapshot: PackingSnapshot | null, sessionHint?: string) {
  const db = await openDb();
  try {
    if (memberId !== null && snapshot && (!sessionHint || sessionHint !== readSessionHint())) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const records = tx.objectStore(STORE);
      if (snapshot) records.put(snapshot, snapshotKey(memberId));
      else records.delete(snapshotKey(memberId));
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    window.dispatchEvent(new Event(CACHE_CHANGED));
  } finally { db.close(); }
}

export function saveSnapshot(memberId: string | null, snapshot: { trips: Trip[]; activeTripId: string }, sessionHint?: string) {
  const trip = snapshot.trips.find(item => item.id === snapshot.activeTripId) ?? snapshot.trips[0];
  return changeCache(memberId, {
    savedAt: new Date().toISOString(),
    trip: trip ? { title: trip.title, packing: trip.packing.map(({ text, done }) => ({ text, done })) } : null,
  }, sessionHint);
}

export function clearSnapshot(memberId: string | null) { return changeCache(memberId, null); }

export async function loadSnapshot(memberId: string | null, sessionHint?: string): Promise<PackingSnapshot | null> {
  const db = await openDb();
  try {
    return await new Promise<PackingSnapshot | null>((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(snapshotKey(memberId));
      request.onsuccess = () => resolve(memberId === null || (sessionHint && sessionHint === readSessionHint()) ? request.result ?? null : null);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
