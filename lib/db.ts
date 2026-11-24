// Tiny IndexedDB wrapper — everything stays on the device.
const DB = 'padlab';
const STORES = ['sources', 'samples', 'scenes', 'meta'] as const;
type Store = (typeof STORES)[number];

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => STORES.forEach((s) => req.result.createObjectStore(s));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return dbp;
}

function tx<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise((res, rej) => {
        const req = fn(db.transaction(store, mode).objectStore(store));
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      }),
  );
}

export const db = {
  put: <T>(store: Store, key: string, val: T) => tx(store, 'readwrite', (s) => s.put(val, key)),
  get: <T>(store: Store, key: string) => tx<T | undefined>(store, 'readonly', (s) => s.get(key)),
  del: (store: Store, key: string) => tx(store, 'readwrite', (s) => s.delete(key)),
  all: <T>(store: Store) => tx<T[]>(store, 'readonly', (s) => s.getAll()),
};
