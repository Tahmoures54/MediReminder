// public/sw.js — Service Worker یادآور دارو — Final Release v10
// هشدارهای تکرارشونده تا تأیید «مصرف کردم» یا اسنوز — بهینه برای موبایل
const CACHE_NAME = 'medi-reminder-v10-final';
const ALARM_DB_NAME = 'MedicationAlarmDB';
const ALARM_STORE = 'alarms';
/** فاصله تکرار اعلان تا تأیید مصرف — 45s */
const FOLLOW_UP_INTERVAL = 45_000;

const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  '/apple-touch-icon.png',
  '/favicon-32x32.png',
  '/favicon-16x16.png',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', event => {
  console.info('[SW] install', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)).catch(err => {
      console.warn('[SW] cache addAll failed', err);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.info('[SW] activate', CACHE_NAME);
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
      await rescheduleStoredAlarms();
      // Ensure clients are controlled immediately for alarm accuracy
      await self.clients.claim();
      console.info('[SW] activated and claimed');
    })()
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation: network-first, fallback to cache (offline support)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache successful navigations
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() =>
          caches.match('/index.html').then(cached => cached || caches.match('/')).then(cached => {
            if (cached) return cached;
            // Fallback minimal offline page
            return new Response('آفلاین — لطفاً اتصال را بررسی کنید', {
              status: 503,
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
          })
        )
    );
    return;
  }

  // Assets: cache-first, network fallback, cache update
  event.respondWith(
    caches.match(request).then(cached => {
      const fetched = fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetched;
    })
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
    try {
      result = callback(store);
    } catch (err) {
      reject(err);
      return;
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
      if (alarm.id == null) alarm.id = crypto.randomUUID();
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
  const title = isFollowUp ? '🔔 یادآوری مجدد دارو — لطفاً تأیید کنید' : '🔔 زمان مصرف دارو!';

  const body = [
    `💊 ${alarm.name || 'دارو'}`,
    `⚖️ ${alarm.dosage || ''}`,
    isFollowUp ? 'هنوز مصرف را تأیید نکرده‌اید. لطفاً «مصرف کردم» را بزنید.' : 'الان مصرف کنید و سپس تأیید کنید.'
  ]
    .filter(Boolean)
    .join('\n');

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
    console.error('[SW] scheduleAlarm error', err);
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
      // Start repeating until Taken or Snooze — critical for mobile accuracy
      startFollowUpAlarms(alarm);
    }
  } catch (err) {
    console.error('[SW] triggerAlarm error', err);
  }
}

function startFollowUpAlarms(alarm) {
  stopFollowUpAlarms(alarm.id);

  withStore('readwrite', store => {
    store.put({
      id: `followup-${alarm.id}`,
      medicationId: alarm.id,
      name: alarm.name,
      dosage: alarm.dosage,
      pending: true,
      startedAt: Date.now()
    });
  }).catch(() => {});

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
  withStore('readwrite', store => {
    store.delete(`followup-${alarmId}`);
  }).catch(() => {});
}

async function cancelAlarmCompletely(alarmId) {
  const key = String(alarmId);
  if (activeTimers.has(key)) {
    clearTimeout(activeTimers.get(key));
    activeTimers.delete(key);
  }
  stopFollowUpAlarms(alarmId);
  await removeAlarmFromDB(alarmId);
  try {
    const notifications = await self.registration.getNotifications({ tag: `med-${alarmId}` });
    notifications.forEach(n => n.close());
  } catch {}
}

async function snoozeAlarm(alarmId, minutes = 10) {
  stopFollowUpAlarms(alarmId);
  try {
    const notifications = await self.registration.getNotifications({ tag: `med-${alarmId}` });
    notifications.forEach(n => n.close());
  } catch {}

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
  try {
    const alarms = await getAllStoredAlarms();
    const now = Date.now();
    console.info('[SW] rescheduling', alarms.length, 'alarms');
    for (const alarm of alarms) {
      if (String(alarm.id).startsWith('followup-')) {
        // Resume pending follow-ups after SW restart — critical for mobile
        const medId = alarm.medicationId ?? String(alarm.id).replace(/^followup-/, '');
        startFollowUpAlarms({
          id: medId,
          name: alarm.name,
          dosage: alarm.dosage,
          time: now
        });
        continue;
      }
      if (alarm.time > now) {
        await scheduleAlarm(alarm);
      } else {
        await triggerAlarm(alarm);
      }
    }
  } catch (e) {
    console.warn('[SW] reschedule failed', e);
  }
}

self.addEventListener('message', event => {
  event.waitUntil(
    (async () => {
      try {
        const data = event.data || {};
        if (data.type === 'SKIP_WAITING') {
          self.skipWaiting();
          return;
        }
        if (data.type === 'SCHEDULE_ALARMS') {
          const alarms = Array.isArray(data.alarms) ? data.alarms : [];
          clearAllTimers();
          const allAlarms = await getAllStoredAlarms();
          const desiredIds = new Set(alarms.map(alarm => String(alarm.id)));
          const orphanMedicationIds = new Set();

          // The app's current database-backed queue is authoritative. Remove
          // timers, persisted follow-ups, and visible notifications for alarms
          // no longer present before replacing the stored queue.
          for (const old of allAlarms) {
            const isFollowUp = String(old.id).startsWith('followup-');
            const medicationId = isFollowUp
              ? (old.medicationId ?? String(old.id).replace(/^followup-/, ''))
              : old.id;
            if (!desiredIds.has(String(medicationId))) {
              orphanMedicationIds.add(medicationId);
            }
          }
          for (const medicationId of orphanMedicationIds) {
            await cancelAlarmCompletely(medicationId);
          }

          // cancelAlarmCompletely is safe to repeat; storeAlarms then removes
          // any stale rows, including legacy follow-up entries.
          await storeAlarms(alarms);
          for (const alarm of alarms) {
            await scheduleAlarm(alarm);
          }
          console.info('[SW] reconciled and scheduled', alarms.length, 'alarms');
        } else if (data.type === 'CANCEL_ALARM' && data.id != null) {
          await cancelAlarmCompletely(data.id);
        } else if (data.type === 'DISMISS_ALARM' && data.id != null) {
          stopFollowUpAlarms(data.id);
          await removeAlarmFromDB(data.id);
          try {
            const notifications = await self.registration.getNotifications({ tag: `med-${data.id}` });
            notifications.forEach(n => n.close());
          } catch {}
        } else if (data.type === 'SNOOZE_ALARM' && data.id != null) {
          await snoozeAlarm(data.id, data.minutes || 10);
        } else if (data.type === 'LIST_ALARMS') {
          const list = await getAllStoredAlarms();
          event.source?.postMessage({ type: 'ALARMS_LIST', alarms: list });
        }
      } catch (err) {
        console.error('[SW] message handler error', err);
      }
    })()
  );
});

self.addEventListener('notificationclick', event => {
  const medicationId = event.notification.data?.medicationId;
  const action = event.action || 'open';

  event.notification.close();

  event.waitUntil(
    (async () => {
      if (action === 'taken') {
        stopFollowUpAlarms(medicationId);
        await removeAlarmFromDB(medicationId);
        await notifyClients({ type: 'ALARM_TAKEN', medicationId });
        await openOrFocusApp(medicationId);
      } else if (action === 'snooze') {
        await snoozeAlarm(medicationId, 10);
        await notifyClients({ type: 'ALARM_SNOOZED', medicationId, minutes: 10 });
        await openOrFocusApp(medicationId);
      } else if (action === 'dismiss') {
        await notifyClients({ type: 'ALARM_DISMISSED', medicationId });
        await openOrFocusApp(medicationId);
      } else {
        await openOrFocusApp(medicationId);
        await notifyClients({ type: 'ALARM_TRIGGERED', medicationId });
      }
    })()
  );
});

self.addEventListener('notificationclose', () => {
  // Intentionally no-op: closing banner must not stop follow-ups
});

async function notifyClients(payload) {
  try {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      client.postMessage(payload);
    }
  } catch {}
}

async function openOrFocusApp(medicationId) {
  try {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    let client = allClients.find(c => c.visibilityState === 'visible') || allClients[0];
    if (client) {
      await client.focus();
      client.postMessage({ type: 'ALARM_TRIGGERED', medicationId });
    } else {
      const newClient = await self.clients.openWindow('/?source=notification&med=' + medicationId);
      if (newClient) {
        setTimeout(() => {
          newClient.postMessage({ type: 'ALARM_TRIGGERED', medicationId });
        }, 600);
      }
    }
  } catch (e) {
    console.warn('[SW] openOrFocus failed', e);
  }
}

// Periodic sync for PWA — keep alarms alive (if supported)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'medi-reminder-sync') {
    event.waitUntil(rescheduleStoredAlarms());
  }
});
