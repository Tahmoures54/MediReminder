/**
 * Bridge: React app ↔ Service Worker (web) ↔ Capacitor LocalNotifications (Android)
 * Production: long pending follow-ups + stable notification id ranges
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Medication } from '../db/database';
import { NOTIFICATION_CHANNEL_ID } from './permissions';

const ACTION_TYPE_ID = 'MED_ALARM_ACTIONS';

/** Re-notify every 2 minutes while dose is pending (native). */
export const NATIVE_FOLLOW_UP_MS = 2 * 60 * 1000;
/** ~6 hours of pre-scheduled nags; app resync on foreground extends further. */
export const NATIVE_FOLLOW_UP_SLOTS = 180;
/** Safety follow-ups after a future scheduled dose. */
export const NATIVE_SCHEDULE_EXTRA_SLOTS = 6;

export type SwMessage =
  | { type: 'ALARM_TAKEN'; medicationId: number | string }
  | { type: 'ALARM_SNOOZED'; medicationId: number | string; minutes?: number }
  | { type: 'ALARM_DISMISSED'; medicationId: number | string }
  | { type: 'ALARM_TRIGGERED'; medicationId: number | string }
  | { type: 'ALARMS_LIST'; alarms: unknown[] };

function isNative() {
  return Capacitor.isNativePlatform();
}

export async function registerNotificationActions(): Promise<void> {
  if (!isNative()) return;
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
  } catch (e) {
    console.warn('registerActionTypes failed', e);
  }
}

function notifIdsFor(medId: number): number[] {
  const base = Math.max(1, medId) * 1000 + 100;
  const count = Math.max(NATIVE_FOLLOW_UP_SLOTS, NATIVE_SCHEDULE_EXTRA_SLOTS) + 4;
  return Array.from({ length: count }, (_, i) => base + i);
}

export async function cancelMedNotifications(medId: number): Promise<void> {
  if (!isNative()) {
    postToSw({ type: 'CANCEL_ALARM', id: medId });
    postToSw({ type: 'DISMISS_ALARM', id: medId });
    return;
  }
  try {
    await LocalNotifications.cancel({
      notifications: notifIdsFor(medId).map((id) => ({ id })),
    });
  } catch (e) {
    console.warn('cancelMedNotifications', e);
  }
}

export function dismissSwFollowUps(medId: number | string): void {
  postToSw({ type: 'DISMISS_ALARM', id: medId });
}

function postToSw(payload: Record<string, unknown>): void {
  if (isNative()) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const ctrl = navigator.serviceWorker.controller;
  if (ctrl) {
    ctrl.postMessage(payload);
  } else {
    navigator.serviceWorker.ready
      .then((reg) => reg.active?.postMessage(payload))
      .catch(() => {});
  }
}

export async function syncAllAlarms(medications: Medication[]): Promise<void> {
  if (isNative()) {
    await syncNative(medications);
  } else {
    syncWeb(medications);
  }
}

function syncWeb(medications: Medication[]): void {
  const now = Date.now();
  const alarms = medications
    .filter((m) => m.id != null)
    .flatMap((m) => {
      const id = m.id!;
      if (m.running && m.nextDoseAt && m.nextDoseAt > now) {
        return [{ id, time: m.nextDoseAt, name: m.name, dosage: m.dosage }];
      }
      if (m.pendingDose) {
        return [{ id, time: now - 1000, name: m.name, dosage: m.dosage }];
      }
      return [];
    });
  postToSw({ type: 'SCHEDULE_ALARMS', alarms });
}

async function syncNative(medications: Medication[]): Promise<void> {
  const now = Date.now();

  try {
    const allIds = medications
      .filter((m) => m.id != null)
      .flatMap((m) => notifIdsFor(m.id!).map((id) => ({ id })));
    if (allIds.length) {
      await LocalNotifications.cancel({ notifications: allIds });
    }
  } catch (e) {
    console.warn('native cancel all', e);
  }

  type Sched = {
    id: number;
    title: string;
    body: string;
    schedule: { at: Date };
    channelId: string;
    sound: string;
    actionTypeId: string;
    extra: Record<string, unknown>;
  };

  const toSchedule: Sched[] = [];

  for (const m of medications) {
    if (m.id == null) continue;
    const ids = notifIdsFor(m.id);

    if (m.pendingDose) {
      for (let slot = 0; slot < NATIVE_FOLLOW_UP_SLOTS; slot++) {
        toSchedule.push({
          id: ids[slot],
          title: slot === 0 ? '💊 زمان مصرف دارو' : '🔔 یادآوری مجدد — لطفاً تأیید کنید',
          body: `${m.name} — ${m.dosage}\nهنوز مصرف را تأیید نکرده‌اید.`,
          schedule: { at: new Date(now + slot * NATIVE_FOLLOW_UP_MS + 800) },
          channelId: NOTIFICATION_CHANNEL_ID,
          sound: 'medication_alarm.wav',
          actionTypeId: ACTION_TYPE_ID,
          extra: { medicationId: m.id, kind: 'pending', slot },
        });
      }
      continue;
    }

    if (m.running && m.nextDoseAt && m.nextDoseAt > now) {
      for (let slot = 0; slot < NATIVE_SCHEDULE_EXTRA_SLOTS; slot++) {
        toSchedule.push({
          id: ids[slot],
          title: slot === 0 ? '💊 زمان مصرف دارو' : '🔔 یادآوری مجدد دارو',
          body: `${m.name} — ${m.dosage}`,
          schedule: { at: new Date(m.nextDoseAt + slot * NATIVE_FOLLOW_UP_MS) },
          channelId: NOTIFICATION_CHANNEL_ID,
          sound: 'medication_alarm.wav',
          actionTypeId: ACTION_TYPE_ID,
          extra: { medicationId: m.id, kind: 'scheduled', slot },
        });
      }
    }
  }

  // Cap batch size for OEM stability (schedule in chunks if huge)
  const CHUNK = 64;
  for (let i = 0; i < toSchedule.length; i += CHUNK) {
    const chunk = toSchedule.slice(i, i + CHUNK);
    try {
      await LocalNotifications.schedule({ notifications: chunk as any });
    } catch (e) {
      console.warn('native schedule chunk failed', e);
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

  return {
    schedule(medications: Medication[]) {
      latest = medications;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        syncAllAlarms(latest).catch((e) => console.warn('debounced sync', e));
      }, delayMs);
    },
    flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
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
