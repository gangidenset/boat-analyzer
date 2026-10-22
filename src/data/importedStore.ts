import type { ResultRace } from './official/parseResults';
import type { ScheduleRace } from './official/parseSchedule';

/**
 * 取り込んだ公式データの保存先。データはこの端末のブラウザ内（IndexedDB）にだけ保存し、外部へは送らない。
 * テストでは MemoryImportedStore を使う。
 */
export interface ImportedData {
  schedules: ScheduleRace[];
  results: ResultRace[];
  importedAt: string;
  files: { name: string; kind: 'schedule' | 'results'; races: number }[];
}

export interface ImportedStore {
  load(): Promise<ImportedData | null>;
  save(data: ImportedData): Promise<void>;
  clear(): Promise<void>;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const raceKey = (r: { date: string; venueId: string; raceNo: number }) => `${r.date}_${r.venueId}_${pad2(r.raceNo)}`;

/** 既存データに新しいデータを重ねる（同じレースは新しい方で置き換える） */
export function mergeImported(prev: ImportedData | null, next: ImportedData): ImportedData {
  if (!prev) return next;
  const merge = <T extends { date: string; venueId: string; raceNo: number }>(a: T[], b: T[]) => {
    const map = new Map(a.map((r) => [raceKey(r), r]));
    b.forEach((r) => map.set(raceKey(r), r));
    return [...map.values()].sort((x, y) => raceKey(x).localeCompare(raceKey(y)));
  };
  const files = new Map(prev.files.map((f) => [f.name, f]));
  next.files.forEach((f) => files.set(f.name, f));
  return {
    schedules: merge(prev.schedules, next.schedules),
    results: merge(prev.results, next.results),
    importedAt: next.importedAt,
    files: [...files.values()],
  };
}

export class MemoryImportedStore implements ImportedStore {
  private data: ImportedData | null = null;
  async load() {
    return this.data;
  }
  async save(d: ImportedData) {
    this.data = d;
  }
  async clear() {
    this.data = null;
  }
}

const DB_NAME = 'boat-analyzer';
const STORE = 'imported';
const KEY = 'official-v1';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB を開けませんでした'));
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('IndexedDB の操作に失敗しました'));
        };
      }),
  );
}

export const indexedDbImportedStore: ImportedStore = {
  async load() {
    if (typeof indexedDB === 'undefined') return null;
    return ((await run('readonly', (s) => s.get(KEY))) as ImportedData | undefined) ?? null;
  },
  async save(d) {
    await run('readwrite', (s) => s.put(d, KEY));
  },
  async clear() {
    await run('readwrite', (s) => s.delete(KEY));
  },
};
