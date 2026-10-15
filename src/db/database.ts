export type DoseStatus = 'on-time' | 'early' | 'late' | 'missed' | 'snoozed' | 'skipped';

export interface HistoryRecord {
  id?: string;
  takenAt: number;
  scheduledAt?: number;
  status: DoseStatus;
  snoozeCount?: number;
}

export interface Medication {
  id?: number;
  name: string;
  condition?: string;
  dosage: string;
  intervalHours: number;
  interval: number;
  quantity: number;
  remaining: number;
  running: boolean;
  nextDoseAt?: number;
  /** Snapshot of the due time when dose became pending (stable for adherence). */
  dueScheduledAt?: number;
  lastTakenAt?: number;
  pendingDose?: boolean;
  snoozeCount?: number;
  createdAt?: number;
  updatedAt?: number;
  history?: HistoryRecord[];
}

const DB_NAME = 'MedicationReminderDB';
const DB_VERSION = 5;
const STORE_NAME = 'medications';
const STATE_STORE = 'appState';

/** Prevent unbounded growth for long-term users at scale. */
export const MAX_HISTORY_RECORDS = 120;

export function trimHistory(history: HistoryRecord[] | undefined): HistoryRecord[] {
  const list = Array.isArray(history) ? history : [];
  if (list.length <= MAX_HISTORY_RECORDS) return list;
  return [...list].sort((a, b) => a.takenAt - b.takenAt).slice(-MAX_HISTORY_RECORDS);
}

function sanitizeMedication(m: Medication): Medication {
  const interval = Number(m.interval) || Number(m.intervalHours) * 3600 || 3600;
  return {
    ...m,
    name: String(m.name || '').trim() || 'دارو',
    condition: String(m.condition || '').trim(),
    dosage: String(m.dosage || '').trim() || '—',
    interval,
    intervalHours: Number(m.intervalHours) || Math.max(1, Math.round(interval / 3600)),
    quantity: Math.max(0, Number(m.quantity) || 0),
    remaining: Math.max(0, Number(m.remaining) || 0),
    running: Boolean(m.running),
    pendingDose: Boolean(m.pendingDose),
    history: trimHistory(m.history),
  };
}

class Database {
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = this.initDB();
  }

  private initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        // A closed connection can otherwise leave future operations failing silently.
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('by_name', 'name', { unique: false });
        }
        if (!db.objectStoreNames.contains(STATE_STORE)) {
          db.createObjectStore(STATE_STORE, { keyPath: 'key' });
        }
      };
    });
  }

  private async transaction<T = unknown>(
    storeName: string,
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest | void
  ): Promise<T | void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      let request: IDBRequest | void;
      let requestResult: T | undefined;
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error(String(error || 'IndexedDB transaction failed')));
      };

      try {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        request = fn(store);

        if (request) {
          request.onsuccess = () => {
            // A successful request does not mean the whole transaction committed.
            // Wait for tx.oncomplete before reporting writes as persisted.
            requestResult = request!.result as T;
          };
          request.onerror = () => fail(request!.error || new Error('IndexedDB request failed'));
        }

        tx.oncomplete = () => {
          if (settled) return;
          settled = true;
          resolve(request ? requestResult as T : undefined);
        };
        tx.onerror = () => fail(tx.error || new Error('IndexedDB transaction failed'));
        tx.onabort = () => fail(tx.error || new Error('IndexedDB transaction aborted'));
      } catch (error) {
        fail(error);
      }
    });
  }

  async getAllMedications(): Promise<Medication[]> {
    const rows = (await this.transaction(STORE_NAME, 'readonly', (store) => store.getAll())) as Medication[];
    return (rows || []).map(sanitizeMedication);
  }

  async addMedication(medication: Medication): Promise<number> {
    const now = Date.now();
    const value = sanitizeMedication({
      ...medication,
      createdAt: medication.createdAt ?? now,
      updatedAt: now,
      history: medication.history ?? [],
    });
    return (await this.transaction(STORE_NAME, 'readwrite', (store) => store.add(value))) as number;
  }

  async updateMedication(medication: Medication): Promise<void> {
    const value = sanitizeMedication({
      ...medication,
      updatedAt: Date.now(),
    });
    await this.transaction(STORE_NAME, 'readwrite', (store) => store.put(value));
  }

  async deleteMedication(id: number): Promise<void> {
    const key = Number(id);
    if (!Number.isFinite(key)) return;
    await this.transaction(STORE_NAME, 'readwrite', (store) => store.delete(key));
  }

  async replaceAllMedications(medications: Medication[]): Promise<void> {
    const db = await this.dbPromise;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      for (const medication of medications) {
        store.put(sanitizeMedication(medication));
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  }

  async getDeviceId(): Promise<string> {
    const value = await this.getState<string>('deviceId');
    if (value) return value;
    const id = crypto.randomUUID();
    await this.setState('deviceId', id);
    return id;
  }

  async setState<T>(key: string, value: T): Promise<void> {
    await this.transaction(STATE_STORE, 'readwrite', (store) => store.put({ key, value }));
  }

  async getState<T>(key: string): Promise<T | null> {
    const result = (await this.transaction<any>(STATE_STORE, 'readonly', (store) => store.get(key))) as any;
    return result?.value ?? null;
  }
}

export const db = new Database();
