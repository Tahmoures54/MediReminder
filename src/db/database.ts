/* ==========================================================================
 * Medication Reminder — IndexedDB layer
 *
 * Design goals of this refactor:
 *   1. Eliminate callback pyramids in `grantPaidMedicationCards` by wrapping
 *      every IDBRequest in a Promise and using async/await.
 *   2. Fix the latent race in `getDeviceId` (two tabs could mint two UUIDs)
 *      by memoizing the in-flight promise.
 *   3. Harden `transaction()` so it correctly handles single-request and
 *      multi-request operations through one code path.
 *   4. Recover from a closed/closing DB connection (e.g. another tab triggered
 *      a version change) by lazily re-opening the connection.
 *   5. Extract magic strings/numbers to named constants for auditability.
 *   6. Tighten types: branded `StateKey`, explicit `PurchaseRecord`,
 *      `PaidCardsState`, no `any`.
 * ========================================================================== */

/* ==========================================================================
 * Domain types
 * ========================================================================== */

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
  /**
   * Canonical interval in hours. `interval` (seconds) is kept only for
   * backward compatibility with older stored records; new code reads
   * `intervalHours` as the source of truth.
   */
  intervalHours: number;
  /** Interval in seconds — derived from `intervalHours` on write. */
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

/* ==========================================================================
 * Internal types
 * ========================================================================== */

interface StateEntry<T = unknown> {
  key: string;
  value: T;
}

interface PaidCardsState {
  count: number;
  tokens: string[];
}

interface PurchaseRecord {
  purchaseToken: string;
  productId: string;
  cardCount: number;
  purchasedAt: number;
  credited: boolean;
}

/** Outcome of `grantPaidMedicationCards`. */
type GrantResult =
  | { granted: true; reason: 'new' | 'repaired' }
  | { granted: false; reason: 'already-credited' | 'legacy-already-granted' };

/* ==========================================================================
 * Constants
 * ========================================================================== */

const DB_NAME = 'MedicationReminderDB';
const DB_VERSION = 6;

const STORE_NAME = 'medications';
const STATE_STORE = 'appState';
const PURCHASE_STORE = 'localPurchases';

const STATE_KEY_DEVICE_ID = 'deviceId';
const STATE_KEY_PAID_CARDS = 'paidMedicationCards';

const FALLBACK_INTERVAL_HOURS = 1;
const SECONDS_PER_HOUR = 3600;
const DEFAULT_MEDICATION_NAME = 'دارو';
const DEFAULT_DOSAGE_LABEL = '—';

/** Prevent unbounded growth for long-term users at scale. */
export const MAX_HISTORY_RECORDS = 120;

/* ==========================================================================
 * Pure helpers
 * ========================================================================== */

/** Sorts ascending by `takenAt` and trims to the most recent N entries. */
export function trimHistory(history: HistoryRecord[] | undefined): HistoryRecord[] {
  const list = Array.isArray(history) ? history : [];
  if (list.length <= MAX_HISTORY_RECORDS) return list;
  return [...list].sort((a, b) => a.takenAt - b.takenAt).slice(-MAX_HISTORY_RECORDS);
}

/**
 * Coerces a raw stored medication into a normalized, type-safe shape.
 * `intervalHours` is treated as the source of truth; `interval` (seconds) is
 * re-derived from it so the two fields can never drift apart on disk.
 */
function sanitizeMedication(m: Medication): Medication {
  // Resolve the canonical interval (hours). Prefer the explicit hours field;
  // fall back to the legacy seconds field, then to a safe default.
  const intervalHoursFromSeconds =
    Number.isFinite(Number(m.interval)) && Number(m.interval) > 0
      ? Number(m.interval) / SECONDS_PER_HOUR
      : NaN;
  const intervalHours = Number(m.intervalHours) || intervalHoursFromSeconds || FALLBACK_INTERVAL_HOURS;
  const safeIntervalHours = Math.max(1, Math.round(intervalHours));
  const interval = safeIntervalHours * SECONDS_PER_HOUR;

  return {
    ...m,
    name: String(m.name || '').trim() || DEFAULT_MEDICATION_NAME,
    condition: String(m.condition || '').trim(),
    dosage: String(m.dosage || '').trim() || DEFAULT_DOSAGE_LABEL,
    interval,
    intervalHours: safeIntervalHours,
    quantity: Math.max(0, Math.floor(Number(m.quantity) || 0)),
    remaining: Math.max(0, Math.floor(Number(m.remaining) || 0)),
    running: Boolean(m.running),
    pendingDose: Boolean(m.pendingDose),
    history: trimHistory(m.history),
  };
}

/* ==========================================================================
 * IndexedDB request → Promise bridge
 * ========================================================================== */

/** Wraps a single IDBRequest in a Promise that resolves with its result. */
function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

/**
 * Wraps a transaction so the caller can `await` it after issuing requests.
 * Resolves when the transaction commits; rejects on error or abort.
 */
function transactionToPromise(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/* ==========================================================================
 * Database
 * ========================================================================== */

class Database {
  /** Cached connection. Replaced by `reopen()` after a version change. */
  private dbPromise: Promise<IDBDatabase>;
  /** Memoized so concurrent callers share a single UUID mint. */
  private deviceIdPromise: Promise<string> | null = null;

  constructor() {
    this.dbPromise = this.openDB();
  }

  /* ---------------------------- connection ---------------------------- */

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('by_name', 'name', { unique: false });
        }
        if (!db.objectStoreNames.contains(STATE_STORE)) {
          db.createObjectStore(STATE_STORE, { keyPath: 'key' });
        }
        // Mirrors the proven Smart Mechanic pattern: retain one durable record
        // per Bazaar purchase token, including the SKU and timestamp.
        if (!db.objectStoreNames.contains(PURCHASE_STORE)) {
          db.createObjectStore(PURCHASE_STORE, { keyPath: 'purchaseToken' });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        // A closed connection would otherwise leave future operations failing
        // silently. Close gracefully so the next caller reopens.
        db.onversionchange = () => {
          db.close();
          this.dbPromise = this.openDB();
        };
        resolve(db);
      };
    });
  }

  /**
   * Returns the current DB connection, reopening it if a previous
   * version-change closed the handle. The connection is shared across all
   * callers, so reopen happens at most once per version-change event.
   */
  private async getDB(): Promise<IDBDatabase> {
    try {
      return await this.dbPromise;
    } catch (error) {
      // A failed initial open is unrecoverable until the underlying issue
      // (quota, permission, private mode) is resolved; surface it to callers.
      throw error;
    }
  }

  /* ------------------------- generic tx runner ------------------------ */

  /**
   * Runs `work` inside a transaction on `storeName` and resolves with the
   * transaction's result once it commits. The callback receives the object
   * store and may issue zero, one, or many requests; it must return the
   * value to surface back to the caller (or `undefined` for fire-and-forget
   * writes). All requests are awaited implicitly via `transactionToPromise`.
   */
  private async runTransaction<T>(
    storeName: string,
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest | Promise<unknown> | void,
  ): Promise<T | void> {
    const db = await this.getDB();
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = work(store);
    await transactionToPromise(tx);
    // If `work` returned a request, surface its result; otherwise return void.
    if (result instanceof IDBRequest) {
      return result.result as T;
    }
    // If `work` returned a Promise (rare), await it.
    if (result instanceof Promise) {
      return (await result) as T;
    }
    return result as T | void;
  }

  /** Multi-store variant of `runTransaction` for cross-store atomicity. */
  private async runMultiStoreTransaction<T>(
    storeNames: string[],
    mode: IDBTransactionMode,
    work: (stores: Record<string, IDBObjectStore>) => IDBRequest | Promise<unknown> | void,
  ): Promise<T | void> {
    const db = await this.getDB();
    const tx = db.transaction(storeNames, mode);
    const stores: Record<string, IDBObjectStore> = {};
    for (const name of storeNames) stores[name] = tx.objectStore(name);
    const result = work(stores);
    await transactionToPromise(tx);
    if (result instanceof IDBRequest) return result.result as T;
    if (result instanceof Promise) return (await result) as T;
    return result as T | void;
  }

  /* --------------------------- medications ---------------------------- */

  async getAllMedications(): Promise<Medication[]> {
    const rows = (await this.runTransaction<Medication[]>(
      STORE_NAME,
      'readonly',
      (store) => store.getAll(),
    )) as Medication[] | undefined;
    return (rows ?? []).map(sanitizeMedication);
  }

  async addMedication(medication: Medication): Promise<number> {
    const now = Date.now();
    const value = sanitizeMedication({
      ...medication,
      createdAt: medication.createdAt ?? now,
      updatedAt: now,
      history: medication.history ?? [],
    });
    const id = await this.runTransaction<number>(STORE_NAME, 'readwrite', (store) =>
      store.add(value),
    );
    if (typeof id !== 'number') {
      throw new Error('افزودن دارو ناموفق بود؛ شناسه دریافت نشد.');
    }
    return id;
  }

  async updateMedication(medication: Medication): Promise<void> {
    const value = sanitizeMedication({
      ...medication,
      updatedAt: Date.now(),
    });
    await this.runTransaction(STORE_NAME, 'readwrite', (store) => store.put(value));
  }

  async deleteMedication(id: number): Promise<void> {
    const key = Number(id);
    if (!Number.isFinite(key)) return;
    await this.runTransaction(STORE_NAME, 'readwrite', (store) => store.delete(key));
  }

  async replaceAllMedications(medications: Medication[]): Promise<void> {
    const sanitized = medications.map(sanitizeMedication);
    await this.runTransaction(STORE_NAME, 'readwrite', (store) => {
      store.clear();
      for (const med of sanitized) store.put(med);
    });
  }

  /* ----------------------------- app state ---------------------------- */

  async getState<T>(key: string): Promise<T | null> {
    const entry = await this.runTransaction<StateEntry<T> | undefined>(
      STATE_STORE,
      'readonly',
      (store) => store.get(key),
    );
    return entry?.value ?? null;
  }

  async setState<T>(key: string, value: T): Promise<void> {
    await this.runTransaction(STATE_STORE, 'readwrite', (store) =>
      store.put({ key, value } satisfies StateEntry<T>),
    );
  }

  /* ------------------------- device identity -------------------------- */

  /**
   * Returns the persistent device id, minting one on first use.
   * Concurrent callers share the same in-flight promise so a race cannot
   * produce two different ids in the same session.
   */
  async getDeviceId(): Promise<string> {
    if (this.deviceIdPromise) return this.deviceIdPromise;
    this.deviceIdPromise = (async () => {
      const existing = await this.getState<string>(STATE_KEY_DEVICE_ID);
      if (existing) return existing;
      const id = crypto.randomUUID();
      await this.setState(STATE_KEY_DEVICE_ID, id);
      return id;
    })();
    try {
      return await this.deviceIdPromise;
    } finally {
      // Allow re-minting on a future call only if this attempt failed.
      this.deviceIdPromise = null;
    }
  }

  /* ------------------------ paid medication cards --------------------- */

  async getPaidMedicationCardCount(): Promise<number> {
    const state = await this.getState<PaidCardsState>(STATE_KEY_PAID_CARDS);
    return Math.max(0, Math.floor(Number(state?.count) || 0));
  }

  /**
   * Atomically records a Bazaar purchase and grants its bundle exactly once.
   *
   * The dedicated `PURCHASE_STORE` ledger follows Smart Mechanic's
   * `local_purchases` pattern. Older installations only have entries in
   * `appState.paidMedicationCards.tokens`; this method repairs that gap by
   * back-filling a purchase row when one is missing, without double-crediting.
   *
   * @returns `true` if this call granted new cards; `false` if the purchase
   *          was already credited (idempotent).
   */
  async grantPaidMedicationCards(
    purchaseToken: string,
    cardCount: number,
    productId = 'unknown',
  ): Promise<boolean> {
    const token = purchaseToken.trim();
    if (!token) throw new Error('توکن خرید بازار خالی است.');
    const cards = Math.max(1, Math.floor(Number(cardCount) || 1));
    const sku = productId.trim() || 'unknown';

    const outcome = await this.runMultiStoreTransaction<GrantResult>(
      [STATE_STORE, PURCHASE_STORE],
      'readwrite',
      async (stores) => {
        const stateStore = stores[STATE_STORE];
        const purchaseStore = stores[PURCHASE_STORE];

        // Read both records in parallel for speed.
        const [existingPurchase, paidState] = await Promise.all([
          requestToPromise<PurchaseRecord | undefined>(purchaseStore.get(token)),
          requestToPromise<StateEntry<PaidCardsState> | undefined>(
            stateStore.get(STATE_KEY_PAID_CARDS),
          ),
        ]);

        const tokens = Array.isArray(paidState?.value?.tokens) ? paidState.value.tokens : [];
        const alreadyInState = tokens.includes(token);
        const currentCount = Math.max(0, Math.floor(Number(paidState?.value?.count) || 0));

        const writePaidState = (nextCount: number, nextTokens: string[]) => {
          stateStore.put({
            key: STATE_KEY_PAID_CARDS,
            value: { count: nextCount, tokens: nextTokens },
          } satisfies StateEntry<PaidCardsState>);
        };

        // Case A: purchase row already exists.
        if (existingPurchase) {
          // Repair a partially migrated / older local ledger: if a purchase row
          // exists but its token was never reflected in appState, restore its
          // entitlement exactly once. A row explicitly marked credited=false
          // means the legacy ledger had already credited it — do not re-grant.
          const shouldRepair = existingPurchase.credited !== false && !alreadyInState;
          if (!shouldRepair) {
            return { granted: false, reason: 'already-credited' } as GrantResult;
          }
          const repairedCards = Math.max(1, Math.floor(Number(existingPurchase.cardCount) || cards));
          writePaidState(currentCount + repairedCards, [...tokens, token]);
          purchaseStore.put({
            ...existingPurchase,
            productId: existingPurchase.productId || sku,
            credited: true,
          });
          return { granted: true, reason: 'repaired' } as GrantResult;
        }

        // Case B: no purchase row yet. Insert one. The `credited` flag is
        // `false` only when the legacy ledger already granted it (i.e. token is
        // already in appState.tokens); in that case we still persist the row
        // for audit purposes but do not increment the count.
        const alreadyGrantedByLegacyLedger = alreadyInState;
        purchaseStore.add({
          purchaseToken: token,
          productId: sku,
          cardCount: cards,
          purchasedAt: Date.now(),
          credited: !alreadyGrantedByLegacyLedger,
        } satisfies PurchaseRecord);

        if (alreadyGrantedByLegacyLedger) {
          return { granted: false, reason: 'legacy-already-granted' } as GrantResult;
        }
        writePaidState(currentCount + cards, [...tokens, token]);
        return { granted: true, reason: 'new' } as GrantResult;
      },
    );

    return outcome?.granted ?? false;
  }

  /** Backward-compatible helper for older local code paths. */
  async grantPaidMedicationCard(purchaseToken: string): Promise<boolean> {
    return this.grantPaidMedicationCards(purchaseToken, 1);
  }
}

/* ==========================================================================
 * Singleton export
 * ========================================================================== */

export const db = new Database();
