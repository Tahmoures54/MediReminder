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

  /**
   * Check whether the one-time free first-medication allowance is still available.
   * Existing installations with medications are migrated as having used it.
   */
  async canAddMedicationWithoutToken(): Promise<boolean> {
    const alreadyUsed = await this.getState<boolean>('freeMedicationUsed');
    if (alreadyUsed) return false;
    const count = (await this.transaction(STORE_NAME, 'readonly', (store) => store.count())) as number;
    if (count > 0) {
      await this.setState('freeMedicationUsed', true);
      return false;
    }
    return true;
  }

  /**
   * Atomically create a medication and debit one token after the one-time free
   * first medication. The decision is made in IndexedDB, not from stale UI state.
   */
  async addMedicationWithToken(medication: Medication): Promise<number> {
    const now = Date.now();
    const value = sanitizeMedication({
      ...medication,
      createdAt: medication.createdAt ?? now,
      updatedAt: now,
      history: medication.history ?? [],
    });
    const db = await this.dbPromise;
    return new Promise<number>((resolve, reject) => {
      let newId: number | undefined;
      let settled = false;
      let medicationCount = 0;
      let freeUsed = false;
      let balanceRecord: { count?: number; tokens?: string[] } | undefined;
      let countReady = false;
      let freeReady = false;
      let balanceReady = false;
      const tx = db.transaction([STORE_NAME, STATE_STORE], 'readwrite');
      const medicationStore = tx.objectStore(STORE_NAME);
      const stateStore = tx.objectStore(STATE_STORE);
      const insert = () => {
        const request = medicationStore.add(value);
        request.onsuccess = () => { newId = Number(request.result); };
        request.onerror = () => {
          if (!settled) {
            settled = true;
            reject(request.error || new Error('ذخیره دارو ناموفق بود.'));
          }
        };
      };
      const decide = () => {
        if (!countReady || !freeReady || !balanceReady || settled) return;
        const firstMedicationIsFree = !freeUsed && medicationCount === 0;
        if (!firstMedicationIsFree) {
          const count = Math.max(0, Math.floor(Number(balanceRecord?.count) || 0));
          if (count < 1) {
            tx.abort();
            return;
          }
          stateStore.put({
            key: 'paidMedicationCards',
            value: {
              ...balanceRecord,
              count: count - 1,
              tokens: Array.isArray(balanceRecord?.tokens) ? balanceRecord.tokens : [],
            },
          });
        }
        stateStore.put({ key: 'freeMedicationUsed', value: true });
        insert();
      };

      const countRequest = medicationStore.count();
      countRequest.onsuccess = () => {
        medicationCount = Number(countRequest.result) || 0;
        countReady = true;
        decide();
      };
      countRequest.onerror = () => {
        if (!settled) {
          settled = true;
          reject(countRequest.error || new Error('خواندن فهرست داروها ناموفق بود.'));
        }
      };

      const freeRequest = stateStore.get('freeMedicationUsed');
      freeRequest.onsuccess = () => {
        freeUsed = Boolean(freeRequest.result?.value);
        freeReady = true;
        decide();
      };
      freeRequest.onerror = () => {
        if (!settled) {
          settled = true;
          reject(freeRequest.error || new Error('خواندن وضعیت شارژ ناموفق بود.'));
        }
      };

      const balanceRequest = stateStore.get('paidMedicationCards');
      balanceRequest.onsuccess = () => {
        balanceRecord = balanceRequest.result?.value as { count?: number; tokens?: string[] } | undefined;
        balanceReady = true;
        decide();
      };
      balanceRequest.onerror = () => {
        if (!settled) {
          settled = true;
          reject(balanceRequest.error || new Error('خواندن موجودی شارژ ناموفق بود.'));
        }
      };

      tx.oncomplete = () => {
        if (settled) return;
        settled = true;
        if (newId == null) reject(new Error('شناسه داروی ذخیره‌شده دریافت نشد.'));
        else resolve(newId);
      };
      tx.onerror = () => {
        if (settled) return;
        settled = true;
        reject(tx.error || new Error('ذخیره دارو یا مصرف شارژ ناموفق بود.'));
      };
      tx.onabort = () => {
        if (settled) return;
        settled = true;
        reject(tx.error || new Error('شارژ کافی نیست؛ ابتدا بسته شارژ بخرید.'));
      };
    });
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

  async getMedicationTokenBalance(): Promise<number> {
    return this.getPaidMedicationCardCount();
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
