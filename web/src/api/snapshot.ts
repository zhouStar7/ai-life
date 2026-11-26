const DB_NAME = 'ai-life';
const STORE = 'snapshot';

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSnapshot(memberId: string, snapshot: unknown) {
  if (!memberId) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(snapshot, `latest:${memberId}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export type PendingWrite = { id: string; path: string; method: string; body?: string };

export async function savePending(memberId: string, queue: PendingWrite[]) {
  if (!memberId) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(queue, `pending:${memberId}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadPending(memberId: string) {
  if (!memberId) return [];
  const db = await openDb();
  const value = await new Promise<PendingWrite[] | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(`pending:${memberId}`);
    request.onsuccess = () => resolve(request.result as PendingWrite[] | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return Array.isArray(value) ? value : [];
}

export async function loadSnapshot<T>(memberId: string) {
  if (!memberId) return null;
  const db = await openDb();
  const value = await new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(`latest:${memberId}`);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value ?? null;
}
