/**
 * Bridge: React app ↔ Service Worker (web) ↔ Capacitor LocalNotifications (Android)
 * Final release: robust, battery-aware, accurate timing for mobile
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Medication } from '../db/database';
import { NOTIFICATION_CHANNEL_ID } from './permissions';

const ACTION_TYPE_ID = 'MED_ALARM_ACTIONS';

/**
 * Native follow-ups are spaced 15 minutes apart. This stays beyond Android's
 * documented 9-minute Doze allowance and extends the pre-scheduled coverage
 * without increasing the number of pending notifications per medication.
 */
export const NATIVE_FOLLOW_UP_MS = 15 * 60 * 1000;
/**
 * Android queue is intentionally bounded: 36 slots ≈ 9h per medication.
 * The app refreshes pending-dose reminders while it is running and whenever
 * it resumes. This is not an OS-level guarantee after force-stop/reboot:
 * a fully closed app cannot replenish this JavaScript-managed queue by itself.
 */
export const NATIVE_FOLLOW_UP_SLOTS = 36;
/** Refill the bounded native reminder queue before its 5.4h window expires. */
export const NATIVE_PENDING_REFRESH_MS = 4 * 60 * 60 * 1000;
/** Keep the same coverage for a future dose. */
export const NATIVE_SCHEDULE_EXTRA_SLOTS = NATIVE_FOLLOW_UP_SLOTS;
/** Keep the total queue below common Android/OEM pending-alarm pressure. */
export const MAX_PENDING_NATIVE_NOTIFICATIONS = 450;
/** حداکثر تعداد اعلان‌های زمان‌بندی‌شده در هر دسته برای جلوگیری از مشکلات OEM */
const SCHEDULE_CHUNK_SIZE = 48;
/** پراکندگی زمانی بین داروهای مختلف تا با محدودیت 9دقیقه‌ای Doze برخورد نکنند */
const MED_STAGGER_MS = 20_000;

// Prevent duplicate registration of action types
let actionsRegistered = false;

export type SwMessage =
  | { type: 'ALARM_TAKEN'; medicationId: number | string }
  | { type: 'ALARM_SNOOZED'; medicationId: number | string; minutes?: number }
  | { type: 'ALARM_DISMISSED'; medicationId: number | string }
  | { type: 'ALARM_TRIGGERED'; medicationId: number | string }
  | { type: 'ALARMS_LIST'; alarms: unknown[] };

// پیام‌های ارسالی به Service Worker
type SwOutgoingMessage =
  | { type: 'SCHEDULE_ALARMS'; alarms: unknown[] }
  | { type: 'CANCEL_ALARM'; id: number | string }
  | { type: 'DISMISS_ALARM'; id: number | string };

function isNative() {
  return Capacitor.isNativePlatform();
}

export async function registerNotificationActions(): Promise<void> {
  if (!isNative() || actionsRegistered) return;
  try {
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: ACTION_TYPE_ID,
          actions: [
            { id: 'taken', title: '✅ مصرف کردم', foreground: true },
            { id: 'snooze', title: '⏰ ۱۰ دقیقه', foreground: false },
            { id: 'dismiss', title: 'بعداً', foreground: false, destructive: false },
          ],
        },
      ],
    });
    actionsRegistered = true;
    console.info('[Alarms] Action types registered');
  } catch (e) {
    console.warn('[Alarms] registerActionTypes failed', e);
  }
}

function notifIdsFor(medId: number): number[] {
  // Use a stable range per medication to avoid collisions.
  // 1000 IDs are reserved per medication; only ~40 are currently needed.
  const base = Math.max(1, medId) * 1000 + 100;
  const count = Math.max(NATIVE_FOLLOW_UP_SLOTS, NATIVE_SCHEDULE_EXTRA_SLOTS) + 4;
  return Array.from({ length: count }, (_, i) => base + i);
}

export async function cancelMedNotifications(medId: number): Promise<void> {
  if (!Number.isFinite(medId)) return;
  if (!isNative()) {
    // CANCEL_ALARM removes timers, persisted alarms, follow-ups, and visible
    // notifications. The message is intentionally idempotent.
    postToSw({ type: 'CANCEL_ALARM', id: medId });
    return;
  }

  try {
    const ids = new Set(notifIdsFor(medId));
    // cancel() clears scheduled alarms, but an already delivered notification
    // can remain visible in Android's notification shade. Match both the
    // stable ID range and plugin metadata so legacy/stale IDs are covered too.
    const [pendingResult, deliveredResult] = await Promise.all([
      LocalNotifications.getPending(),
      LocalNotifications.getDeliveredNotifications(),
    ]);
    const pending = pendingResult.notifications.filter(
      (notification) => ids.has(notification.id) || Number(notification.extra?.medicationId) === medId,
    );
    const delivered = deliveredResult.notifications.filter(
      (notification) => ids.has(notification.id) || Number(notification.extra?.medicationId) === medId,
    );

    const pendingToCancel = new Map<number, { id: number }>();
    for (const id of ids) pendingToCancel.set(id, { id });
    for (const notification of pending) pendingToCancel.set(notification.id, { id: notification.id });
    const cancelList = [...pendingToCancel.values()];
    for (let i = 0; i < cancelList.length; i += SCHEDULE_CHUNK_SIZE) {
      await LocalNotifications.cancel({ notifications: cancelList.slice(i, i + SCHEDULE_CHUNK_SIZE) });
    }
    if (delivered.length > 0) {
      await LocalNotifications.removeDeliveredNotifications({ notifications: delivered });
    }
    console.info('[Alarms] canceled scheduled and delivered native notifications', {
      medicationId: medId,
      pending: pending.length,
      delivered: delivered.length,
    });
  } catch (e) {
    console.warn('[Alarms] cancelMedNotifications', { medicationId: medId, error: e });
  }
}

export function dismissSwFollowUps(medId: number | string): void {
  postToSw({ type: 'DISMISS_ALARM', id: medId });
}

function postToSw(payload: SwOutgoingMessage): void {
  if (isNative()) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const ctrl = navigator.serviceWorker.controller;
    if (ctrl) {
      ctrl.postMessage(payload);
    } else {
      navigator.serviceWorker.ready
        .then((reg) => reg.active?.postMessage(payload))
        .catch(() => {});
    }
  } catch (e) {
    console.warn('[Alarms] postToSw failed', e);
  }
}

export async function syncAllAlarms(medications: Medication[]): Promise<void> {
  try {
    if (isNative()) {
      await registerNotificationActions();
      await syncNative(medications);
    } else {
      syncWeb(medications);
    }
  } catch (e) {
    console.warn('[Alarms] syncAll failed', e);
  }
}

/** آفست پایدار بر اساس id دارو تا آلارم‌های همزمان روی هم نیفتند */
function medStagger(medId: number): number {
  return (Math.max(1, medId) % 9) * MED_STAGGER_MS;
}

function syncWeb(medications: Medication[]): void {
  const now = Date.now();
  const alarms = medications
    .filter((m) => m.id != null)
    .flatMap((m) => {
      const id = m.id!;
      if (m.pendingDose) {
        return [{ id, time: now - 1000, name: m.name, dosage: m.dosage }];
      }
      if (m.running && m.nextDoseAt && m.nextDoseAt <= now) {
        return [{ id, time: now - 1000, name: m.name, dosage: m.dosage }];
      }
      if (m.running && m.nextDoseAt && m.nextDoseAt > now) {
        return [{ id, time: m.nextDoseAt, name: m.name, dosage: m.dosage }];
      }
      return [];
    });

  console.info('[Alarms] syncWeb', alarms.length, 'alarms');
  postToSw({ type: 'SCHEDULE_ALARMS', alarms });
}

async function syncNative(medications: Medication[]): Promise<void> {
  const now = Date.now();

  // Reconcile orphaned notifications against the database-backed medication
  // list on startup/resume. This also catches a process death between deleting
  // the medication record and posting its explicit cancellation request.
  const activeMedicationIds = new Set(
    medications.filter((medication) => medication.id != null).map((medication) => Number(medication.id)),
  );
  try {
    const [pendingResult, deliveredResult] = await Promise.all([
      LocalNotifications.getPending(),
      LocalNotifications.getDeliveredNotifications(),
    ]);
    const orphanIds = new Set<number>();
    for (const notification of pendingResult.notifications) {
      const id = Number(notification.extra?.medicationId);
      if (Number.isFinite(id) && !activeMedicationIds.has(id)) orphanIds.add(id);
    }
    for (const notification of deliveredResult.notifications) {
      const id = Number(notification.extra?.medicationId);
      if (Number.isFinite(id) && !activeMedicationIds.has(id)) orphanIds.add(id);
    }
    for (const id of orphanIds) await cancelMedNotifications(id);
  } catch (error) {
    console.warn('[Alarms] orphan notification reconciliation failed', error);
  }

  // Do not cancel the currently working reminders before replacements are scheduled.
  // If Android rejects a new schedule request, the previous reminder must remain.
  const reservedIds = medications
    .filter((m) => m.id != null)
    .flatMap((m) => notifIdsFor(m.id!).map((id) => ({ id })));

  interface SchedNotification {
    id: number;
    title: string;
    body: string;
    schedule: { at: Date; allowWhileIdle: boolean };
    channelId: string;
    sound: string;
    smallIcon?: string;
    iconColor?: string;
    actionTypeId: string;
    extra: Record<string, unknown>;
    autoCancel?: boolean;
    ongoing?: boolean;
  }

  const toSchedule: SchedNotification[] = [];

  for (const m of medications) {
    if (m.id == null) continue;
    const ids = notifIdsFor(m.id);
    const stagger = medStagger(m.id);

    if (m.pendingDose) {
      for (let slot = 0; slot < NATIVE_FOLLOW_UP_SLOTS; slot++) {
        const atMs =
          slot === 0
            ? now + 900 + stagger
            : now + slot * NATIVE_FOLLOW_UP_MS + stagger + 800;
        toSchedule.push({
          id: ids[slot],
          title: slot === 0 ? '💊 زمان مصرف دارو' : '🔔 یادآوری مجدد — لطفاً تأیید کنید',
          body: `${m.name} — ${m.dosage}\n${slot === 0 ? 'الان مصرف کنید و تأیید کنید.' : 'هنوز مصرف را تأیید نکرده‌اید.'}`,
          schedule: { at: new Date(atMs), allowWhileIdle: true },
          channelId: NOTIFICATION_CHANNEL_ID,
          sound: 'medication_alarm.wav',
          smallIcon: 'ic_stat_icon_config_sample',
          iconColor: '#DC2626',
          actionTypeId: ACTION_TYPE_ID,
          extra: { medicationId: m.id, kind: 'pending', slot, scheduledAt: m.dueScheduledAt ?? m.nextDoseAt },
          autoCancel: false,
          ongoing: slot === 0,
        });
      }
      continue;
    }

    if (m.running && m.nextDoseAt && m.nextDoseAt > now) {
      for (let slot = 0; slot < NATIVE_SCHEDULE_EXTRA_SLOTS; slot++) {
        const atMs = m.nextDoseAt + slot * NATIVE_FOLLOW_UP_MS + (slot === 0 ? 0 : stagger);
        if (atMs <= now + 500) continue;
        toSchedule.push({
          id: ids[slot],
          title: slot === 0 ? '💊 زمان مصرف دارو' : '🔔 یادآوری مجدد دارو',
          body: `${m.name} — ${m.dosage}${slot > 0 ? '\nلطفاً تأیید کنید.' : ''}`,
          schedule: { at: new Date(atMs), allowWhileIdle: true },
          channelId: NOTIFICATION_CHANNEL_ID,
          sound: 'medication_alarm.wav',
          smallIcon: 'ic_stat_icon_config_sample',
          iconColor: '#0891b2',
          actionTypeId: ACTION_TYPE_ID,
          extra: { medicationId: m.id, kind: 'scheduled', slot, scheduledAt: m.nextDoseAt },
          autoCancel: false,
          ongoing: false,
        });
      }
      continue;
    }

    if (m.running && m.nextDoseAt && m.nextDoseAt <= now) {
      for (let slot = 0; slot < NATIVE_FOLLOW_UP_SLOTS; slot++) {
        const atMs =
          slot === 0
            ? now + 900 + stagger
            : now + slot * NATIVE_FOLLOW_UP_MS + stagger + 800;
        toSchedule.push({
          id: ids[slot],
          title: slot === 0 ? '💊 زمان مصرف دارو (معوق)' : '🔔 یادآوری مجدد — لطفاً تأیید کنید',
          body: `${m.name} — ${m.dosage}\nزمان مصرف گذشته، لطفاً تأیید کنید.`,
          schedule: { at: new Date(atMs), allowWhileIdle: true },
          channelId: NOTIFICATION_CHANNEL_ID,
          sound: 'medication_alarm.wav',
          smallIcon: 'ic_stat_icon_config_sample',
          iconColor: '#DC2626',
          actionTypeId: ACTION_TYPE_ID,
          extra: { medicationId: m.id, kind: 'overdue', slot, scheduledAt: m.nextDoseAt },
          autoCancel: false,
          ongoing: slot === 0,
        });
      }
    }
  }

  toSchedule.sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime());

  // The queue is shared across all medications. Reserve the first alert for
  // every medication before distributing follow-ups round-robin by slot, so
  // a large medication list cannot silently crowd out another medicine's
  // initial reminder. Unselected slots are canceled below and will be rebuilt
  // on the next sync/resume.
  let selectedNotifications = toSchedule;
  if (toSchedule.length > MAX_PENDING_NATIVE_NOTIFICATIONS) {
    const primary = toSchedule.filter((notification) => Number(notification.extra.slot) === 0);
    const followUps = toSchedule
      .filter((notification) => Number(notification.extra.slot) !== 0)
      .sort((a, b) =>
        Number(a.extra.slot) - Number(b.extra.slot) ||
        a.schedule.at.getTime() - b.schedule.at.getTime()
      );
    selectedNotifications = [...primary, ...followUps]
      .slice(0, MAX_PENDING_NATIVE_NOTIFICATIONS)
      .sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime());
    console.warn('[Alarms] native queue capped to protect initial reminders', {
      requested: toSchedule.length,
      scheduled: selectedNotifications.length,
      limit: MAX_PENDING_NATIVE_NOTIFICATIONS,
    });
  }

  console.info('[Alarms] scheduling native', selectedNotifications.length, 'notifications');

  const desiredIds = new Set(selectedNotifications.map((notification) => notification.id));
  let failedChunks = 0;

  for (let i = 0; i < selectedNotifications.length; i += SCHEDULE_CHUNK_SIZE) {
    const chunk = selectedNotifications.slice(i, i + SCHEDULE_CHUNK_SIZE);
    try {
      await LocalNotifications.schedule({ notifications: chunk });
    } catch (e) {
      failedChunks += 1;
      // Keep old notifications for these IDs: scheduling the same ID replaces
      // the old notification only when the new schedule succeeds.
      console.error('[Alarms] native schedule chunk failed; preserving existing reminders where possible', {
        offset: i,
        count: chunk.length,
        error: e,
      });
    }
  }

  // Only after attempting replacements, remove unused reserved slots. Desired IDs
  // are never cancelled here, including IDs in a chunk that failed to schedule.
  const obsoleteIds = reservedIds.filter(({ id }) => !desiredIds.has(id));
  for (let i = 0; i < obsoleteIds.length; i += SCHEDULE_CHUNK_SIZE) {
    const chunk = obsoleteIds.slice(i, i + SCHEDULE_CHUNK_SIZE);
    try {
      await LocalNotifications.cancel({ notifications: chunk });
    } catch (e) {
      console.warn('[Alarms] failed to cancel obsolete native reminder slots', {
        offset: i,
        count: chunk.length,
        error: e,
      });
    }
  }

  if (failedChunks > 0) {
    console.error('[Alarms] reminder sync incomplete; previous notifications were preserved where possible', {
      failedChunks,
      requested: toSchedule.length,
    });
  }
}

export function onSwMessage(handler: (msg: SwMessage) => void): () => void {
  if (isNative() || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {};
  }
  const listener = (event: MessageEvent) => {
    if (event.data && typeof event.data === 'object' && event.data.type) {
      handler(event.data as SwMessage);
    }
  };
  navigator.serviceWorker.addEventListener('message', listener);
  return () => navigator.serviceWorker.removeEventListener('message', listener);
}

/** Debounce helper for high-churn medication state updates. */
export function createDebouncedSync(delayMs = 350) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: Medication[] = [];
  let lastSync = 0;
  const minInterval = 1000;

  return {
    schedule(medications: Medication[]) {
      latest = medications;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const now = Date.now();
        if (now - lastSync < minInterval) {
          this.schedule(latest);
          return;
        }
        lastSync = now;
        syncAllAlarms(latest).catch((e) => console.warn('[Alarms] debounced sync', e));
      }, delayMs);
    },
    flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      lastSync = Date.now();
      return syncAllAlarms(latest);
    },
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
