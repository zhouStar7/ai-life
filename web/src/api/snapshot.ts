import type { Trip } from '../types';

const STORE = 'snapshot';
export const demoMode = import.meta.env.VITE_AI_LIFE_MODE === 'demo';
const snapshotKey = demoMode ? 'demo' : 'personal';
export const CACHE_CHANGED = 'ai-life-packing-cache-changed';

export interface PackingSnapshot {
  savedAt: string;
  trip: { title: string; packing: { text: string; done: boolean }[] } | null;
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('ai-life', 2);
    request.onupgradeneeded = () => {
      // Purge legacy full snapshots, including keys with unknown provenance.
      if (request.result.objectStoreNames.contains(STORE)) request.result.deleteObjectStore(STORE);
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function changeCache(snapshot: PackingSnapshot | null) {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const records = tx.objectStore(STORE);
      if (snapshot) records.put(snapshot, snapshotKey);
      else records.delete(snapshotKey);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    window.dispatchEvent(new Event(CACHE_CHANGED));
  } finally { db.close(); }
}

export function saveSnapshot(snapshot: { trips: Trip[]; activeTripId: string }) {
  const trip = snapshot.trips.find(item => item.id === snapshot.activeTripId) ?? snapshot.trips[0];
  return changeCache({
    savedAt: new Date().toISOString(),
    trip: trip ? { title: trip.title, packing: trip.packing.map(({ text, done }) => ({ text, done })) } : null,
  });
}

export function clearSnapshot() { return changeCache(null); }

export async function loadSnapshot(): Promise<PackingSnapshot | null> {
  const db = await openDb();
  try {
    return await new Promise<PackingSnapshot | null>((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(snapshotKey);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
