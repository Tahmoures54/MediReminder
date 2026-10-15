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
      let requestResult: T | undefined;
      let hasRequest = false;
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error(String(error || 'IndexedDB transaction failed')));
      };

      try {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = fn(store);
        hasRequest = Boolean(request);

        if (request) {
          request.onsuccess = () => {
            // A successful request does not mean the whole transaction committed.
            // Wait for tx.oncomplete before reporting writes as persisted.
            requestResult = request.result as T;
          };
          request.onerror = () => fail(request.error || new Error('IndexedDB request failed'));
        }

        tx.oncomplete = () => {
          if (settled) return;
          settled = true;
          resolve(hasRequest ? requestResult as T : undefined);
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

  async getPaidMedicationCardCount(): Promise<number> {
    const value = await this.getState<{ count?: number }>('paidMedicationCards');
    return Math.max(0, Math.floor(Number(value?.count) || 0));
  }

  /** Grant the full bundle once per unique Bazaar purchase token. */
  async grantPaidMedicationCards(purchaseToken: string, cardCount: number): Promise<boolean> {
    const token = purchaseToken.trim();
    const cards = Math.max(1, Math.floor(Number(cardCount) || 1));
    if (!token) throw new Error('توکن خرید بازار خالی است.');

    const db = await this.dbPromise;
    return new Promise<boolean>((resolve, reject) => {
      let granted = false;
      let settled = false;
      const tx = db.transaction(STATE_STORE, 'readwrite');
      const store = tx.objectStore(STATE_STORE);
      const request = store.get('paidMedicationCards');

      request.onsuccess = () => {
        try {
          const current = request.result?.value as { count?: number; tokens?: string[] } | undefined;
          const tokens = Array.isArray(current?.tokens) ? current.tokens : [];
          if (tokens.includes(token)) return;
          const count = Math.max(0, Math.floor(Number(current?.count) || 0));
          store.put({
            key: 'paidMedicationCards',
            value: { count: count + cards, tokens: [...tokens, token] },
          });
          granted = true;
        } catch (error) {
          tx.abort();
          if (!settled) {
            settled = true;
            reject(error);
          }
        }
      };
      request.onerror = () => {
        if (!settled) {
          settled = true;
          reject(request.error || new Error('خواندن سوابق خرید ناموفق بود.'));
        }
      };
      tx.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve(granted);
      };
      tx.onerror = () => {
        if (settled) return;
        settled = true;
        reject(tx.error || new Error('ذخیره حق استفاده از کارت ناموفق بود.'));
      };
      tx.onabort = () => {
        if (settled) return;
        settled = true;
        reject(tx.error || new Error('ثبت خرید لغو شد.'));
      };
    });
  }

  /** Backward-compatible helper for any older local code paths. */
  async grantPaidMedicationCard(purchaseToken: string): Promise<boolean> {
    return this.grantPaidMedicationCards(purchaseToken, 1);
  }

  async getState<T>(key: string): Promise<T | null> {
    const result = (await this.transaction<any>(STATE_STORE, 'readonly', (store) => store.get(key))) as any;
    return result?.value ?? null;
  }
}

export const db = new Database();
