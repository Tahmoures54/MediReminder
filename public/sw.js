// public/sw.js — Service Worker یادآور دارو (تولید)
const CACHE_NAME = 'medi-reminder-v6';
const ALARM_DB_NAME = 'MedicationAlarmDB';
const ALARM_STORE = 'alarms';
/** فاصله تکرار اعلان تا تأیید مصرف (۳۰ ثانیه) */
const FOLLOW_UP_INTERVAL = 30_000;
const SNOOZE_DEFAULT_MS = 10 * 60 * 1000;

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
    caches.match(event.request).then(res => res || fetch(event.request).catch(() => caches.match('/')))
  );
});

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

async function putAlarm(alarm) {
  return withStore('readwrite', store => store.put(alarm));
}

const activeTimers = new Map();
const followUpTimers = new Map();

function clearAllTimers() {
  for (const timerId of activeTimers.values()) clearTimeout(timerId);
  for (const timerId of followUpTimers.values()) clearTimeout(timerId);
  activeTimers.clear();
  followUpTimers.clear();
}

async function showStandardNotification(alarm, isFollowUp = false) {
  const title = isFollowUp
    ? '🔔 یادآوری مجدد دارو'
    : '🔔 زمان مصرف دارو!';

  const body = [
    `💊 ${alarm.name || 'دارو'}`,
    `⚖️ ${alarm.dosage || ''}`,
    isFollowUp ? 'هنوز مصرف نکرده‌اید؟ لطفاً تأیید کنید.' : 'الان مصرف کنید'
  ].filter(Boolean).join('\n');

  await self.registration.showNotification(title, {
    body,
    icon: '/android-chrome-192x192.png',
    badge: '/android-chrome-192x192.png',
    tag: `med-${alarm.id}`,
    requireInteraction: true,
    renotify: true,
    vibrate: [300, 100, 300, 100, 300, 100, 300],
    actions: [
      { action: 'taken', title: '✅ مصرف کردم' },
      { action: 'snooze', title: '⏰ ۱۰ دقیقه' },
      { action: 'dismiss', title: 'بعداً' }
    ],
    data: {
      medicationId: alarm.id,
      name: alarm.name,
      dosage: alarm.dosage,
      followUp: isFollowUp
    }
  });
}

async function scheduleAlarm(alarm) {
  try {
    if (!alarm || typeof alarm.time !== 'number') return;
    const now = Date.now();

    if (alarm.time <= now) {
      await triggerAlarm(alarm);
      return;
    }

    const delay = Math.min(alarm.time - now, 2147483647);
    const timerId = setTimeout(() => triggerAlarm(alarm), delay);
    activeTimers.set(String(alarm.id), timerId);
  } catch (err) {
    console.error('scheduleAlarm error', err);
  }
}

async function triggerAlarm(alarm, isFollowUp = false) {
  try {
    await showStandardNotification(alarm, isFollowUp);

    if (!isFollowUp) {
      await removeAlarmFromDB(alarm.id);
      if (activeTimers.has(String(alarm.id))) {
        clearTimeout(activeTimers.get(String(alarm.id)));
        activeTimers.delete(String(alarm.id));
      }
      startFollowUpAlarms(alarm);
    }
  } catch (err) {
    console.error('triggerAlarm error', err);
  }
}

function startFollowUpAlarms(alarm) {
  stopFollowUpAlarms(alarm.id);

  withStore('readwrite', store => {
    store.put({
      id: `followup-${alarm.id}`,
      medicationId: alarm.id,
      name: alarm.name,
      dosage: alarm.dosage
    });
  });

  const sendFollowUp = () => {
    withStore('readonly', store => {
      return new Promise(resolve => {
        const req = store.get(`followup-${alarm.id}`);
        req.onsuccess = () => {
          if (req.result) {
            const followUpAlarm = { ...alarm, time: Date.now() };
            triggerAlarm(followUpAlarm, true).then(() => {
              const nextTimer = setTimeout(sendFollowUp, FOLLOW_UP_INTERVAL);
              followUpTimers.set(String(alarm.id), nextTimer);
            });
          } else {
            stopFollowUpAlarms(alarm.id);
          }
          resolve();
        };
        req.onerror = () => resolve();
      });
    });
  };

  const firstTimer = setTimeout(sendFollowUp, FOLLOW_UP_INTERVAL);
  followUpTimers.set(String(alarm.id), firstTimer);
}

function stopFollowUpAlarms(alarmId) {
  const key = String(alarmId);
  if (followUpTimers.has(key)) {
    clearTimeout(followUpTimers.get(key));
    followUpTimers.delete(key);
  }
  withStore('readwrite', store => store.delete(`followup-${alarmId}`));
}

async function cancelAlarmCompletely(alarmId) {
  const key = String(alarmId);
  if (activeTimers.has(key)) {
    clearTimeout(activeTimers.get(key));
    activeTimers.delete(key);
  }
  stopFollowUpAlarms(alarmId);
  await removeAlarmFromDB(alarmId);
}

async function snoozeAlarm(alarmId, minutes = 10) {
  stopFollowUpAlarms(alarmId);
  const notifications = await self.registration.getNotifications({ tag: `med-${alarmId}` });
  notifications.forEach(n => n.close());

  const all = await getAllStoredAlarms();
  let base = all.find(a => String(a.id) === String(alarmId));
  if (!base) {
    base = all.find(a => a.id === `followup-${alarmId}`);
  }

  const snoozeMs = (minutes || 10) * 60 * 1000;
  const newAlarm = {
    id: alarmId,
    time: Date.now() + snoozeMs,
    name: base?.name || 'دارو',
    dosage: base?.dosage || ''
  };

  await putAlarm(newAlarm);
  await scheduleAlarm(newAlarm);
}

async function rescheduleStoredAlarms() {
  clearAllTimers();
  const alarms = await getAllStoredAlarms();
  const now = Date.now();
  for (const alarm of alarms) {
    if (String(alarm.id).startsWith('followup-')) continue;
    if (alarm.time > now) {
      await scheduleAlarm(alarm);
    } else {
      await triggerAlarm(alarm);
    }
  }
}

self.addEventListener('message', event => {
  event.waitUntil((async () => {
    try {
      const data = event.data || {};
      if (data.type === 'SCHEDULE_ALARMS') {
        const alarms = Array.isArray(data.alarms) ? data.alarms : [];
        clearAllTimers();
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
        stopFollowUpAlarms(data.id);
        await removeAlarmFromDB(data.id);
        const notifications = await self.registration.getNotifications({ tag: `med-${data.id}` });
        notifications.forEach(n => n.close());
      } else if (data.type === 'SNOOZE_ALARM' && data.id) {
        await snoozeAlarm(data.id, data.minutes || 10);
      } else if (data.type === 'LIST_ALARMS') {
        const list = await getAllStoredAlarms();
        event.source?.postMessage({ type: 'ALARMS_LIST', alarms: list });
      }
    } catch (err) {
      console.error('message handler error', err);
    }
  })());
});

self.addEventListener('notificationclick', event => {
  const medicationId = event.notification.data?.medicationId;
  const action = event.action || 'open';

  event.notification.close();

  event.waitUntil((async () => {
    if (action === 'taken') {
      stopFollowUpAlarms(medicationId);
      await removeAlarmFromDB(medicationId);
      await notifyClients({ type: 'ALARM_TAKEN', medicationId });
    } else if (action === 'snooze') {
      await snoozeAlarm(medicationId, 10);
      await notifyClients({ type: 'ALARM_SNOOZED', medicationId, minutes: 10 });
    } else if (action === 'dismiss') {
      // dismiss فقط اعلان را می‌بندد؛ follow-up ادامه دارد تا Taken یا Snooze
      await notifyClients({ type: 'ALARM_DISMISSED', medicationId });
      // follow-up عمداً متوقف نمی‌شود
    } else {
      if (medicationId) {
        // فقط اپ را باز می‌کنیم؛ follow-up ادامه دارد
      }
      await openOrFocusApp(medicationId);
    }
  })());
});

async function notifyClients(payload) {
  const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of allClients) {
    client.postMessage(payload);
  }
}

async function openOrFocusApp(medicationId) {
  const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  let client = allClients.find(c => c.visibilityState === 'visible') || allClients[0];
  if (client) {
    await client.focus();
    client.postMessage({ type: 'ALARM_TRIGGERED', medicationId });
  } else {
    const newClient = await self.clients.openWindow('/');
    if (newClient) {
      newClient.postMessage({ type: 'ALARM_TRIGGERED', medicationId });
    }
  }
}
