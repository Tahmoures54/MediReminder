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

export interface BackupPayload {
  schemaVersion: number;
  exportedAt: number;
  medications: Medication[];
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
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('nextDoseAt', 'nextDoseAt', { unique: false });
        } else {
          const store = request.transaction?.objectStore(STORE_NAME);
          if (store && !store.indexNames.contains('nextDoseAt')) {
            store.createIndex('nextDoseAt', 'nextDoseAt', { unique: false });
          }
        }
        if (!db.objectStoreNames.contains(STATE_STORE)) {
          db.createObjectStore(STATE_STORE, { keyPath: 'key' });
        }
      };
    });
  }

  private async transaction<T>(
    storeName: string,
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T> | void
  ): Promise<T | void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let request: IDBRequest<T> | void;
      try {
        request = fn(store);
      } catch (e) {
        reject(e);
        return;
      }
      if (request) {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => {
        if (!request) resolve();
      };
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
    await this.transaction(STORE_NAME, 'readwrite', (store) => store.delete(id));
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
      tx.onabort = () => reject(tx.error || new Error('Import aborted'));
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

  async exportBackup(): Promise<BackupPayload> {
    return {
      schemaVersion: DB_VERSION,
      exportedAt: Date.now(),
      medications: await this.getAllMedications(),
    };
  }

  async importBackup(payload: BackupPayload): Promise<void> {
    if (!payload || !Array.isArray(payload.medications)) {
      throw new Error('Invalid backup file');
    }
    const sanitized = payload.medications.map((m) =>
      sanitizeMedication({
        ...m,
        id: undefined,
        history: Array.isArray(m.history) ? m.history : [],
        running: Boolean(m.running),
        pendingDose: Boolean(m.pendingDose),
        interval: Number(m.interval) || Number(m.intervalHours) * 3600,
        intervalHours: Number(m.intervalHours) || 1,
        quantity: Math.max(0, Number(m.quantity) || 0),
      })
    );
    await this.replaceAllMedications(sanitized);
  }
}

export const db = new Database();
