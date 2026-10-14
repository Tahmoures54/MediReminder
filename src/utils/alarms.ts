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
 * Native follow-up cadence is deliberately aligned with Android Doze limits.
 * Capacitor documents that allowWhileIdle notifications can fire at most
 * once per 9 minutes per app while the device is in Doze.
 */
export const NATIVE_FOLLOW_UP_MS = 9 * 60 * 1000;
/** 36 slots ≈ 5.4h of follow-ups — keeps AlarmManager under OEM caps (e.g. Samsung ~500). */
export const NATIVE_FOLLOW_UP_SLOTS = 36;
/** Keep the same coverage for a future dose. */
export const NATIVE_SCHEDULE_EXTRA_SLOTS = NATIVE_FOLLOW_UP_SLOTS;
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
  if (!isNative()) {
    postToSw({ type: 'CANCEL_ALARM', id: medId });
    return;
  }
  try {
    const ids = notifIdsFor(medId).map((id) => ({ id }));
    for (let i = 0; i < ids.length; i += SCHEDULE_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + SCHEDULE_CHUNK_SIZE);
      await LocalNotifications.cancel({ notifications: chunk });
    }
    console.info('[Alarms] canceled native', medId);
  } catch (e) {
    console.warn('[Alarms] cancelMedNotifications', e);
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

  try {
    const allIds = medications
      .filter((m) => m.id != null)
      .flatMap((m) => notifIdsFor(m.id!).map((id) => ({ id })));
    if (allIds.length) {
      for (let i = 0; i < allIds.length; i += SCHEDULE_CHUNK_SIZE) {
        const chunk = allIds.slice(i, i + SCHEDULE_CHUNK_SIZE);
        await LocalNotifications.cancel({ notifications: chunk });
      }
    }
  } catch (e) {
    console.warn('[Alarms] native cancel all', e);
  }

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
          extra: { medicationId: m.id, kind: 'pending', slot },
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
          extra: { medicationId: m.id, kind: 'scheduled', slot },
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
          extra: { medicationId: m.id, kind: 'overdue', slot },
          autoCancel: false,
          ongoing: slot === 0,
        });
      }
    }
  }

  toSchedule.sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime());

  console.info('[Alarms] scheduling native', toSchedule.length, 'notifications');

  for (let i = 0; i < toSchedule.length; i += SCHEDULE_CHUNK_SIZE) {
    const chunk = toSchedule.slice(i, i + SCHEDULE_CHUNK_SIZE);
    try {
      await LocalNotifications.schedule({ notifications: chunk });
    } catch (e) {
      console.warn('[Alarms] native schedule chunk failed', i, e);
    }
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
