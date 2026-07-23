// public/sw.js
const CACHE_NAME = 'medi-reminder-v3';
const ALARM_DB_NAME = 'MedicationAlarmDB';
const ALARM_STORE = 'alarms';

const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  '/apple-touch-icon.png',
  '/favicon-32x32.png',
  '/favicon-16x16.png',
  '/favicon.ico'
];

// ---------- نصب و کش ----------
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      // حذف کش‌های قدیمی
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
      // برنامه‌ریزی مجدد آلارم‌های ذخیره‌شده
      await rescheduleStoredAlarms();
    })()
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(res => res || fetch(event.request))
  );
});

// ---------- IndexedDB helper ----------
function openAlarmDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(ALARM_DB_NAME, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(ALARM_STORE)) {
        db.createObjectStore(ALARM_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, callback) {
  const db = await openAlarmDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALARM_STORE, mode);
    const store = tx.objectStore(ALARM_STORE);
    let result;
    try {
      result = callback(store);
    } catch (err) {
      reject(err);
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

async function storeAlarms(alarms) {
  if (!Array.isArray(alarms)) throw new Error('alarms must be an array');
  return withStore('readwrite', store => {
    store.clear();
    for (const alarm of alarms) {
      // اعتبارسنجی ساده
      if (!alarm.id) alarm.id = crypto.randomUUID();
      if (typeof alarm.time !== 'number') continue;
      store.put(alarm);
    }
  });
}

async function getAllStoredAlarms() {
  return withStore('readonly', store => {
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

async function removeAlarmFromDB(id) {
  return withStore('readwrite', store => {
    store.delete(id);
  });
}

// ---------- مدیریت تایمرها ----------
const activeTimers = new Map();

function clearScheduledAlarms() {
  for (const timerId of activeTimers.values()) {
    clearTimeout(timerId);
  }
  activeTimers.clear();
}

// Helper: feature detection for Notification Triggers
function supportsNotificationTrigger() {
  return 'showTrigger' in Notification.prototype || ('getNotifications' in ServiceWorkerRegistration.prototype && 'showTrigger' in Notification.prototype);
}

async function scheduleAlarm(alarm) {
  try {
    if (!alarm || typeof alarm.time !== 'number') return;
    const now = Date.now();

    // اگر Notification Triggers پشتیبانی شود، از آن استفاده کن
    if ('showTrigger' in Notification.prototype && 'timestamp' in window) {
      // Note: این API هنوز در همه مرورگرها پشتیبانی نمی‌شود؛ این بلوک صرفاً نمونه است
      try {
        await self.registration.showNotification(alarm.name || 'Medication', {
          body: `${alarm.name || ''} - ${alarm.dosage || ''}`,
          tag: `med-${alarm.id}`,
          icon: '/android-chrome-192x192.png',
          badge: '/android-chrome-192x192.png',
          showTrigger: new TimestampTrigger(alarm.time),
          data: { medicationId: alarm.id },
          requireInteraction: true
        });
        return;
      } catch (err) {
        // اگر خطا شد، به fallback ادامه بده
        console.warn('Notification trigger failed, falling back to timer', err);
      }
    }

    // اگر زمان گذشته است، بلافاصله اجرا کن
    if (alarm.time <= now) {
      triggerAlarm(alarm);
      return;
    }

    // fallback: setTimeout محلی (ناپایدار در صورت termination)
    const delay = alarm.time - now;
    // محدودیت: اگر delay خیلی بزرگ باشد، ممکن است مرورگر آن را محدود کند
    const timerId = setTimeout(() => {
      triggerAlarm(alarm);
    }, delay);
    activeTimers.set(alarm.id, timerId);
  } catch (err) {
    console.error('scheduleAlarm error', err);
  }
}

async function triggerAlarm(alarm) {
  try {
    // نمایش اعلان
    await self.registration.showNotification('🔔 Time to Medicate!', {
      body: `${alarm.name || ''} - ${alarm.dosage || ''}`,
      icon: '/android-chrome-192x192.png',
      badge: '/android-chrome-192x192.png',
      tag: `med-${alarm.id}`,
      requireInteraction: true,
      vibrate: [200, 100, 200],
      data: { medicationId: alarm.id }
    });

    // حذف از دیتابیس و پاک‌سازی تایمر محلی
    await removeAlarmFromDB(alarm.id);
    if (activeTimers.has(alarm.id)) {
      clearTimeout(activeTimers.get(alarm.id));
      activeTimers.delete(alarm.id);
    }
  } catch (err) {
    console.error('triggerAlarm error', err);
  }
}

async function rescheduleStoredAlarms() {
  try {
    clearScheduledAlarms();
    const alarms = await getAllStoredAlarms();
    const now = Date.now();
    for (const alarm of alarms) {
      if (alarm.time > now) {
        await scheduleAlarm(alarm);
      } else {
        // اگر زمان گذشته، تصمیم بگیر که آیا باید نوتیف بفرستی یا حذف کنی
        // اینجا ما اعلان می‌فرستیم و سپس حذف می‌کنیم
        await triggerAlarm(alarm);
      }
    }
  } catch (err) {
    console.error('rescheduleStoredAlarms error', err);
  }
}

// ---------- پیام از صفحه ----------
self.addEventListener('message', event => {
  // انتظار برای تکمیل عملیات async
  event.waitUntil((async () => {
    try {
      const data = event.data || {};
      if (data.type === 'SCHEDULE_ALARMS') {
        const alarms = Array.isArray(data.alarms) ? data.alarms : [];
        clearScheduledAlarms();
        await storeAlarms(alarms);
        for (const alarm of alarms) {
          await scheduleAlarm(alarm);
        }
      } else if (data.type === 'CANCEL_ALARM' && data.id) {
        // امکان لغو آلارم خاص
        if (activeTimers.has(data.id)) {
          clearTimeout(activeTimers.get(data.id));
          activeTimers.delete(data.id);
        }
        await removeAlarmFromDB(data.id);
      } else if (data.type === 'LIST_ALARMS') {
        const list = await getAllStoredAlarms();
        // ارسال پاسخ به کلاینت فرستنده
        event.source?.postMessage({ type: 'ALARMS_LIST', alarms: list });
      }
    } catch (err) {
      console.error('message handler error', err);
    }
  })());
});

// ---------- کلیک روی اعلان ----------
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const medicationId = event.notification.data?.medicationId;
  event.waitUntil((async () => {
    try {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      let client = allClients.find(c => c.visibilityState === 'visible') || allClients[0];
      if (client) {
        client.focus();
        client.postMessage({ type: 'ALARM_TRIGGERED', medicationId });
      } else {
        const newClient = await self.clients.openWindow('/');
        if (newClient) {
          // openWindow ممکن است null برگرداند
          newClient.postMessage({ type: 'ALARM_TRIGGERED', medicationId });
        }
      }
    } catch (err) {
      console.error('notificationclick error', err);
    }
  })());
});
