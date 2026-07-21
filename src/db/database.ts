export interface Medication {
  id?: number;
  name: string;
  dosage: string;
  intervalHours: number;
  interval: number; // in seconds
  quantity: number;
  remaining: number; // in seconds
  running: boolean;
}

const DB_NAME = 'MedicationReminderDB';
const DB_VERSION = 1;
const STORE_NAME = 'medications';
const STATE_STORE = 'appState';

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

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create medications store
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('name', 'name', { unique: false });
        }

        // Create app state store
        if (!db.objectStoreNames.contains(STATE_STORE)) {
          db.createObjectStore(STATE_STORE, { keyPath: 'key' });
        }
      };
    });
  }

  async getAllMedications(): Promise<Medication[]> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async addMedication(medication: Medication): Promise<number> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(medication);

      request.onsuccess = () => resolve(request.result as number);
      request.onerror = () => reject(request.error);
    });
  }

  async updateMedication(medication: Medication): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(medication);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteMedication(id: number): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getLastSavedTime(): Promise<number> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STATE_STORE, 'readonly');
      const store = transaction.objectStore(STATE_STORE);
      const request = store.get('lastSaved');

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : 0);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async setLastSavedTime(timestamp: number): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STATE_STORE, 'readwrite');
      const store = transaction.objectStore(STATE_STORE);
      const request = store.put({ key: 'lastSaved', value: timestamp });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getDeviceId(): Promise<string> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STATE_STORE, 'readonly');
      const store = transaction.objectStore(STATE_STORE);
      const request = store.get('deviceId');

      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.value);
        } else {
          // Generate new device ID
          const deviceId = crypto.randomUUID();
          this.setDeviceId(deviceId).then(() => resolve(deviceId));
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async setDeviceId(deviceId: string): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STATE_STORE, 'readwrite');
      const store = transaction.objectStore(STATE_STORE);
      const request = store.put({ key: 'deviceId', value: deviceId });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const db = new Database();
