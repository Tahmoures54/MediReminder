// public/sw.js
const CACHE_NAME = 'medi-reminder-v4';
const ALARM_DB_NAME = 'MedicationAlarmDB';
const ALARM_STORE = 'alarms';
const FOLLOW_UP_INTERVAL = 60_000; // 1 minute between repeat alarms

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

// ---------- Install & Cache ----------
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
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

// ---------- IndexedDB helpers ----------
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
    try { result = callback(store); } catch (err) { reject(err); }
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
      if (!alarm.id) alarm.id = crypto.randomUUID();
      if (typeof alarm.time !== 'number') continue;
      store.put(alarm);
    }
  });
}

async function getAllStoredAlarms() {
  return withStore('readonly', store =>
    new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    })
  );
}

async function removeAlarmFromDB(id) {
  return withStore('readwrite', store => store.delete(id));
}

// ---------- Alarm handling ----------
const activeTimers = new Map();
// Track follow‑up alarms to be able to cancel them
const followUpTimers = new Map();

function clearAllTimers() {
  for (const timerId of activeTimers.values()) clearTimeout(timerId);
  for (const timerId of followUpTimers.values()) clearTimeout(timerId);
  activeTimers.clear();
  followUpTimers.clear();
}

/**
 * نشان‌دادن یک اعلان (بدون نیاز به trigger خاص)
 */
async function showStandardNotification(alarm) {
  await self.registration.showNotification('🔔 Time to Medicate!', {
    body: `${alarm.name || ''} - ${alarm.dosage || ''}`,
    icon: '/android-chrome-192x192.png',
    badge: '/android-chrome-192x192.png',
    tag: `med-${alarm.id}`,
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200],
    data: { medicationId: alarm.id, followUp: false }
  });
}

/**
 * برنامه‌ریزی یک آلارم (با fallback)
 */
async function scheduleAlarm(alarm) {
  try {
    if (!alarm || typeof alarm.time !== 'number') return;
    const now = Date.now();

    // (Optional) Notification Trigger اگر در آینده پشتیبانی شد
    if ('showTrigger' in Notification.prototype) {
      try {
        await self.registration.showNotification(alarm.name || 'Medication', {
          body: `${alarm.name || ''} - ${alarm.dosage || ''}`,
          tag: `med-${alarm.id}`,
          icon: '/android-chrome-192x192.png',
          badge: '/android-chrome-192x192.png',
          showTrigger: new TimestampTrigger(alarm.time),
          data: { medicationId: alarm.id, followUp: false },
          requireInteraction: true
        });
        // حذف از دیتابیس چون نوتیف خودکار انجام می‌شود
        await removeAlarmFromDB(alarm.id);
        return;
      } catch (err) {
        console.warn('Notification trigger failed, using fallback', err);
      }
    }

    // اگر زمان گذشته، بلافاصله آلارم
    if (alarm.time <= now) {
      await triggerAlarm(alarm);
      return;
    }

    // fallback با setTimeout
    const delay = alarm.time - now;
    const timerId = setTimeout(() => triggerAlarm(alarm), delay);
    activeTimers.set(alarm.id, timerId);
  } catch (err) {
    console.error('scheduleAlarm error', err);
  }
}

/**
 * اجرای آلارم اصلی و شروع چرخه یادآوری‌های تکمیلی
 */
async function triggerAlarm(alarm, isFollowUp = false) {
  try {
    // نمایش نوتیف اصلی
    await showStandardNotification(alarm);

    // حذف آلارم اصلی از دیتابیس
    await removeAlarmFromDB(alarm.id);
    if (activeTimers.has(alarm.id)) {
      clearTimeout(activeTimers.get(alarm.id));
      activeTimers.delete(alarm.id);
    }

    // اگر این یک یادآوری تکمیلی نیست، زنجیره تکرار را شروع کن
    if (!isFollowUp) {
      startFollowUpAlarms(alarm);
    }
  } catch (err) {
    console.error('triggerAlarm error', err);
  }
}

/**
 * ارسال آلارم‌های پی‌درپی تا زمانی که کاربر اقدامی کند
 */
function startFollowUpAlarms(alarm) {
  // ابتدا تایمر قبلی را پاک کن
  stopFollowUpAlarms(alarm.id);

  // ذخیره وضعیت در دیتابیس موقت (با id='followup-{alarm.id}')
  withStore('readwrite', store => {
    store.put({ id: `followup-${alarm.id}`, medicationId: alarm.id, name: alarm.name, dosage: alarm.dosage });
  });

  const sendFollowUp = () => {
    // بررسی دوباره آیا هنوز معتبر است (در دیتابیس وجود دارد)
    withStore('readonly', async store => {
      return new Promise(resolve => {
        const req = store.get(`followup-${alarm.id}`);
        req.onsuccess = () => {
          if (req.result) {
            // هنوز پاک نشده → یک یادآوری دیگر بفرست و تایمر بعدی را تنظیم کن
            const followUpAlarm = { ...alarm, time: Date.now() }; // بلافاصله
            triggerAlarm(followUpAlarm, true).then(() => {
              const nextTimer = setTimeout(sendFollowUp, FOLLOW_UP_INTERVAL);
              followUpTimers.set(alarm.id, nextTimer);
            });
          } else {
            // متوقف شده
            stopFollowUpAlarms(alarm.id);
          }
          resolve();
        };
        req.onerror = () => resolve();
      });
    });
  };

  // اولین اجرای تاخیری (بعد از ۱ دقیقه)
  const firstTimer = setTimeout(sendFollowUp, FOLLOW_UP_INTERVAL);
  followUpTimers.set(alarm.id, firstTimer);
}

function stopFollowUpAlarms(alarmId) {
  if (followUpTimers.has(alarmId)) {
    clearTimeout(followUpTimers.get(alarmId));
    followUpTimers.delete(alarmId);
  }
  // حذف نشانگر از دیتابیس
  withStore('readwrite', store => store.delete(`followup-${alarmId}`));
}

/**
 * لغو کامل یک آلارم (هم اصلی و هم تکمیلی)
 */
async function cancelAlarmCompletely(alarmId) {
  if (activeTimers.has(alarmId)) {
    clearTimeout(activeTimers.get(alarmId));
    activeTimers.delete(alarmId);
  }
  stopFollowUpAlarms(alarmId);
  await removeAlarmFromDB(alarmId);
}

async function rescheduleStoredAlarms() {
  clearAllTimers();
  const alarms = await getAllStoredAlarms();
  const now = Date.now();
  for (const alarm of alarms) {
    if (alarm.time > now) {
      await scheduleAlarm(alarm);
    } else {
      await triggerAlarm(alarm);
    }
  }
}

// ---------- Messages from page ----------
self.addEventListener('message', event => {
  event.waitUntil((async () => {
    try {
      const data = event.data || {};
      if (data.type === 'SCHEDULE_ALARMS') {
        // برنامه تمام آلارم‌ها را یکجا می‌فرستد
        const alarms = Array.isArray(data.alarms) ? data.alarms : [];
        clearAllTimers();
        // لغو تمام follow-up های قبلی
        const allAlarms = await getAllStoredAlarms();
        for (const old of allAlarms) {
          stopFollowUpAlarms(old.id);
        }
        await storeAlarms(alarms);
        for (const alarm of alarms) {
          await scheduleAlarm(alarm);
        }
      } else if (data.type === 'CANCEL_ALARM' && data.id) {
        await cancelAlarmCompletely(data.id);
      } else if (data.type === 'DISMISS_ALARM' && data.id) {
        // کاربر در برنامه آلارم را تأیید کرد → پیگیری را متوقف کن
        stopFollowUpAlarms(data.id);
        await removeAlarmFromDB(data.id);
        // اگر نوتیفیکیشنی با آن tag وجود دارد ببند
        const notifications = await self.registration.getNotifications({ tag: `med-${data.id}` });
        notifications.forEach(n => n.close());
      } else if (data.type === 'LIST_ALARMS') {
        const list = await getAllStoredAlarms();
        event.source?.postMessage({ type: 'ALARMS_LIST', alarms: list });
      }
    } catch (err) {
      console.error('message handler error', err);
    }
  })());
});

// ---------- Notification click ----------
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const medicationId = event.notification.data?.medicationId;
  event.waitUntil((async () => {
    // لغو یادآورهای تکمیلی
    if (medicationId) {
      stopFollowUpAlarms(medicationId);
    }
    // باز کردن یا فوکوس برنامه
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    let client = allClients.find(c => c.visibilityState === 'visible') || allClients[0];
    if (client) {
      client.focus();
      client.postMessage({ type: 'ALARM_TRIGGERED', medicationId });
    } else {
      const newClient = await self.clients.openWindow('/');
      if (newClient) {
        // صبر می‌کنیم تا صفحه کامل بارگذاری شود و بعد پیام می‌دهیم
        newClient.addEventListener('load', () => {
          newClient.postMessage({ type: 'ALARM_TRIGGERED', medicationId });
        }, { once: true });
        newClient.postMessage({ type: 'ALARM_TRIGGERED', medicationId }); // fallback
      }
    }
  })());
});
