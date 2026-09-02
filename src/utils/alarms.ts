/**
 * Bridge between the React app and:
 *  - Web/PWA Service Worker (background alarms + follow-ups)
 *  - Capacitor LocalNotifications (native Android)
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Medication } from '../db/database';
import { NOTIFICATION_CHANNEL_ID } from './permissions';

const ACTION_TYPE_ID = 'MED_ALARM_ACTIONS';

/** How often native re-notifies while a dose is still pending (ms). */
export const NATIVE_FOLLOW_UP_MS = 2 * 60 * 1000; // 2 minutes
/** How many native follow-up slots to pre-schedule while pending. */
export const NATIVE_FOLLOW_UP_SLOTS = 30; // ~1 hour of nags

export type SwMessage =
  | { type: 'ALARM_TAKEN'; medicationId: number | string }
  | { type: 'ALARM_SNOOZED'; medicationId: number | string; minutes?: number }
  | { type: 'ALARM_DISMISSED'; medicationId: number | string }
  | { type: 'ALARM_TRIGGERED'; medicationId: number | string }
  | { type: 'ALARMS_LIST'; alarms: unknown[] };

function isNative() {
  return Capacitor.isNativePlatform();
}

/** Register Android notification action buttons once. */
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

/** Stable notification id ranges per medication. */
function notifIdsFor(medId: number): number[] {
  // reserve 0..NATIVE_FOLLOW_UP_SLOTS for pending nags, + a few for schedule
  const base = Math.max(1, medId) * 1000 + 100;
  return Array.from({ length: NATIVE_FOLLOW_UP_SLOTS + 4 }, (_, i) => base + i);
}

/** Cancel every scheduled notification belonging to a medication. */
export async function cancelMedNotifications(medId: number): Promise<void> {
  if (!isNative()) {
    postToSw({ type: 'CANCEL_ALARM', id: medId });
    postToSw({ type: 'DISMISS_ALARM', id: medId });
    return;
  }
  try {
    const ids = notifIdsFor(medId).map((id) => ({ id }));
    await LocalNotifications.cancel({ notifications: ids });
  } catch (e) {
    console.warn('cancelMedNotifications', e);
  }
}

/** Tell the Service Worker to stop follow-ups for this med (web). */
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
    navigator.serviceWorker.ready.then((reg) => {
      reg.active?.postMessage(payload);
    }).catch(() => {});
  }
}

/**
 * Sync the full medication schedule to SW (web) or LocalNotifications (native).
 * - running + future nextDoseAt → schedule primary alarm
 * - pendingDose → schedule repeating follow-up nags until confirmed
 */
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
      // Primary future alarm
      if (m.running && m.nextDoseAt && m.nextDoseAt > now) {
        return [
          {
            id,
            time: m.nextDoseAt,
            name: m.name,
            dosage: m.dosage,
          },
        ];
      }
      // Already due → trigger immediately (SW will start follow-ups)
      if (m.pendingDose) {
        return [
          {
            id,
            time: now - 1000, // in the past → SW triggers + starts follow-ups
            name: m.name,
            dosage: m.dosage,
          },
        ];
      }
      return [];
    });

  postToSw({ type: 'SCHEDULE_ALARMS', alarms });
}

async function syncNative(medications: Medication[]): Promise<void> {
  const now = Date.now();

  // Cancel everything we manage, then re-schedule from current state
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

  const toSchedule: Array<{
    id: number;
    title: string;
    body: string;
    schedule: { at: Date };
    channelId: string;
    sound: string;
    actionTypeId: string;
    extra: Record<string, unknown>;
  }> = [];

  for (const m of medications) {
    if (m.id == null) continue;
    const ids = notifIdsFor(m.id);

    if (m.pendingDose) {
      // Aggressive follow-ups starting now, every NATIVE_FOLLOW_UP_MS
      for (let slot = 0; slot < NATIVE_FOLLOW_UP_SLOTS; slot++) {
        const at = new Date(now + slot * NATIVE_FOLLOW_UP_MS + 500);
        toSchedule.push({
          id: ids[slot],
          title: slot === 0 ? '💊 زمان مصرف دارو' : '🔔 یادآوری مجدد — لطفاً تأیید کنید',
          body: `${m.name} — ${m.dosage}\nهنوز مصرف را تأیید نکرده‌اید.`,
          schedule: { at },
          channelId: NOTIFICATION_CHANNEL_ID,
          sound: 'medication_alarm.wav',
          actionTypeId: ACTION_TYPE_ID,
          extra: { medicationId: m.id, kind: 'pending', slot },
        });
      }
      continue;
    }

    if (m.running && m.nextDoseAt && m.nextDoseAt > now) {
      // Primary + a few safety follow-ups after due time (in case first is missed)
      for (let slot = 0; slot < 4; slot++) {
        const at = new Date(m.nextDoseAt + slot * NATIVE_FOLLOW_UP_MS);
        toSchedule.push({
          id: ids[slot],
          title: slot === 0 ? '💊 زمان مصرف دارو' : '🔔 یادآوری مجدد دارو',
          body: `${m.name} — ${m.dosage}`,
          schedule: { at },
          channelId: NOTIFICATION_CHANNEL_ID,
          sound: 'medication_alarm.wav',
          actionTypeId: ACTION_TYPE_ID,
          extra: { medicationId: m.id, kind: 'scheduled', slot },
        });
      }
    }
  }

  if (toSchedule.length) {
    try {
      await LocalNotifications.schedule({ notifications: toSchedule as any });
    } catch (e) {
      console.warn('native schedule failed', e);
    }
  }
}

/** Subscribe to Service Worker messages (web only). Returns unsubscribe. */
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
