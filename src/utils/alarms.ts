/**
 * Bridge: React app ↔ Service Worker (web) ↔ Capacitor LocalNotifications (Android)
 *
 * Architecture
 * ============
 *   Web (PWA):     postMessage → Service Worker schedules timers
 *   Android:       Capacitor LocalNotifications — bounded pre-scheduled queue
 *
 * Safety invariants (pinned by alarms.test.ts):
 *
 *   1. Follow-up spacing ≥ Android Doze minimum (9 min) — see NATIVE_FOLLOW_UP_MS.
 *   2. Pre-scheduled coverage ≥ 8h, refreshed before expiry.
 *   3. Replacement scheduling precedes obsolete-slot removal — a failed
 *      schedule leaves the previous reminder intact instead of having
 *      none at all.
 *   4. Shared queue is capped; every medication's slot-0 (first reminder)
 *      is prioritized over any medication's follow-ups.
 *   5. Per-medication cleanup matches by `extra.medicationId`, not by ID
 *      range alone — covers legacy/stale IDs too.
 *
 * All anchor strings asserted by the contract test are preserved verbatim
 * in the bodies below. Refactor with care.
 */

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Medication } from '../db/database';
import { NOTIFICATION_CHANNEL_ID } from './permissions';

/* ==========================================================================
 * Constants
 * ========================================================================== */

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
/** Maximum scheduled notifications per `LocalNotifications.schedule` call. */
const SCHEDULE_CHUNK_SIZE = 48;
/** Stable per-medication time offset so simultaneous alarms don't collide
 *  and don't trip the 9-minute Doze minimum either. */
const MED_STAGGER_MS = 20_000;
/** Number of reserved notification IDs per medication (slots + slack). */
const NOTIF_IDS_PER_MED = Math.max(NATIVE_FOLLOW_UP_SLOTS, NATIVE_SCHEDULE_EXTRA_SLOTS) + 4;
/** Offset added to the base ID range so slot 0 never collides with a zero id. */
const NOTIF_IDS_BASE_OFFSET = 100;
/** Small leading delay (ms) for slot-0 fire so the handler can attach before
 *  the notification is delivered. */
const SLOT0_LEAD_MS = 900;
/** Tiny additional delay (ms) for follow-up slots to avoid identical fire
 *  times across medications that share the same stagger bucket. */
const FOLLOWUP_JITTER_MS = 800;
/** Reject scheduled times that would fire within this window of "now"
 *  (avoids the OS reporting an impossible past time). */
const MIN_FUTURE_MS = 500;

/* ==========================================================================
 * Types
 * ========================================================================== */

export type SwMessage =
  | { type: 'ALARM_TAKEN'; medicationId: number | string }
  | { type: 'ALARM_SNOOZED'; medicationId: number | string; minutes?: number }
  | { type: 'ALARM_DISMISSED'; medicationId: number | string }
  | { type: 'ALARM_TRIGGERED'; medicationId: number | string }
  | { type: 'ALARMS_LIST'; alarms: unknown[] };

type SwOutgoingMessage =
  | { type: 'SCHEDULE_ALARMS'; alarms: unknown[] }
  | { type: 'CANCEL_ALARM'; id: number | string }
  | { type: 'DISMISS_ALARM'; id: number | string };

/** Discriminator for which scheduling branch produced a notification. */
type ReminderKind = 'pending' | 'scheduled' | 'overdue';

/** Shape of a fully-built native notification ready for `LocalNotifications.schedule`. */
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

/* ==========================================================================
 * Module state
 * ========================================================================== */

let actionsRegistered = false;

/* ==========================================================================
 * Platform helper
 * ========================================================================== */

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/* ==========================================================================
 * Notification ID ranges
 * ========================================================================== */

/**
 * Returns the reserved notification ID range for a medication.
 * Uses a stable per-medication base so the same slot index maps to the same
 * ID across sync runs — this is what makes "schedule replaces previous"
 * semantics work without an explicit clear first.
 */
function notifIdsFor(medId: number): number[] {
  const base = Math.max(1, medId) * 1000 + NOTIF_IDS_BASE_OFFSET;
  return Array.from({ length: NOTIF_IDS_PER_MED }, (_, i) => base + i);
}

/* ==========================================================================
 * Action type registration
 * ========================================================================== */

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

/* ==========================================================================
 * Cancel / dismiss — per medication
 * ========================================================================== */

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
      (notification) =>
        ids.has(notification.id) || Number(notification.extra?.medicationId) === medId,
    );
    const delivered = deliveredResult.notifications.filter(
      (notification) =>
        ids.has(notification.id) || Number(notification.extra?.medicationId) === medId,
    );

    // De-duplicate by ID (the reserved range and the metadata match can
    // overlap for the same notification).
    const pendingToCancel = new Map<number, { id: number }>();
    for (const id of ids) pendingToCancel.set(id, { id });
    for (const notification of pending) pendingToCancel.set(notification.id, { id: notification.id });

    await cancelInChunks([...pendingToCancel.values()]);
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

/** Cancels a list of notifications in SCHEDULE_CHUNK_SIZE batches. */
async function cancelInChunks(items: { id: number }[]): Promise<void> {
  for (let i = 0; i < items.length; i += SCHEDULE_CHUNK_SIZE) {
    await LocalNotifications.cancel({
      notifications: items.slice(i, i + SCHEDULE_CHUNK_SIZE),
    });
  }
}

/* ==========================================================================
 * Service Worker bridge (web only)
 * ========================================================================== */

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

/* ==========================================================================
 * Top-level sync entry point
 * ========================================================================== */

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

/* ==========================================================================
 * Web sync
 * ========================================================================== */

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

/* ==========================================================================
 * Native sync (Android)
 * ========================================================================== */

/** Stable per-medication stagger so simultaneous alarms don't pile up. */
function medStagger(medId: number): number {
  return (Math.max(1, medId) % 9) * MED_STAGGER_MS;
}

/**
 * Reconciles the native notification store against the active medication
 * list. Removes notifications whose `extra.medicationId` is no longer in
 * the active set — covers the race where a deletion's explicit cancel
 * never reached the plugin (process death between DB delete and cancel).
 */
async function reconcileOrphanedNotifications(activeMedicationIds: Set<number>): Promise<void> {
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
}

/* ---------- per-notification builder (DRY across the three branches) ---------- */

interface NotificationBuildInput {
  medication: Medication;
  ids: number[];
  stagger: number;
  kind: ReminderKind;
}

/** Title for the slot-0 (first) reminder, varies by reminder kind. */
function primaryTitle(kind: ReminderKind): string {
  switch (kind) {
    case 'pending':   return '💊 زمان مصرف دارو';
    case 'scheduled': return '💊 زمان مصرف دارو';
    case 'overdue':   return '💊 زمان مصرف دارو (معوق)';
  }
}

/** Title for slot > 0 (follow-up) reminders, varies by reminder kind. */
function followupTitle(kind: ReminderKind): string {
  switch (kind) {
    case 'pending':   return '🔔 یادآوری مجدد — لطفاً تأیید کنید';
    case 'scheduled': return '🔔 یادآوری مجدد دارو';
    case 'overdue':   return '🔔 یادآوری مجدد — لطفاً تأیید کنید';
  }
}

/** Body text for the reminder, varies by kind and slot. */
function bodyText(medication: Medication, kind: ReminderKind, slot: number): string {
  const base = `${medication.name} — ${medication.dosage}`;
  if (kind === 'overdue') return `${base}\nزمان مصرف گذشته، لطفاً تأیید کنید.`;
  if (kind === 'pending') {
    return `${base}\n${slot === 0 ? 'الان مصرف کنید و تأیید کنید.' : 'هنوز مصرف را تأیید نکرده‌اید.'}`;
  }
  // scheduled
  return slot > 0 ? `${base}\nلطفاً تأیید کنید.` : base;
}

/** Icon color: red for urgent (pending/overdue), teal for normal scheduled. */
function iconColorFor(kind: ReminderKind): string {
  return kind === 'scheduled' ? '#0891b2' : '#DC2626';
}

/**
 * Builds the full follow-up slot list for a medication in one branch.
 * Encapsulates the (slot 0 vs slot > 0) timing logic and the kind-specific
 * title/body/color so the three callers in `syncNative` stay narrow.
 */
function buildFollowUpNotifications({
  medication,
  ids,
  stagger,
  kind,
}: NotificationBuildInput): SchedNotification[] {
  const slotCount =
    kind === 'scheduled' ? NATIVE_SCHEDULE_EXTRA_SLOTS : NATIVE_FOLLOW_UP_SLOTS;
  const anchor = medication.dueScheduledAt ?? medication.nextDoseAt;
  const result: SchedNotification[] = [];

  for (let slot = 0; slot < slotCount; slot++) {
    const atMs =
      slot === 0
        ? Date.now() + SLOT0_LEAD_MS + stagger
        : Date.now() + slot * NATIVE_FOLLOW_UP_MS + stagger + FOLLOWUP_JITTER_MS;
    if (kind === 'scheduled' && atMs <= Date.now() + MIN_FUTURE_MS) continue;
    const notificationId = ids[slot];
    if (notificationId == null) continue;

    result.push({
      id: notificationId,
      title: slot === 0 ? primaryTitle(kind) : followupTitle(kind),
      body: bodyText(medication, kind, slot),
      schedule: { at: new Date(atMs), allowWhileIdle: true },
      channelId: NOTIFICATION_CHANNEL_ID,
      sound: 'medication_alarm.wav',
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: iconColorFor(kind),
      actionTypeId: ACTION_TYPE_ID,
      extra: {
        medicationId: medication.id,
        kind,
        slot,
        scheduledAt: anchor,
      },
      autoCancel: false,
      ongoing: slot === 0 && kind !== 'scheduled',
    });
  }
  return result;
}

/**
 * Builds the native schedule list for a single medication. Returns an empty
 * array if the medication has nothing to schedule (paused, no future dose).
 *
 * Three branches:
 *   1. `pendingDose` → 'pending' kind, fire immediately + follow-ups.
 *   2. running + future `nextDoseAt` → 'scheduled' kind, fire at nextDoseAt
 *      + follow-ups anchored on nextDoseAt.
 *   3. running + past `nextDoseAt` → 'overdue' kind, fire immediately +
 *      follow-ups.
 */
function buildMedicationNotifications(medication: Medication): SchedNotification[] {
  if (medication.id == null) return [];
  const ids = notifIdsFor(medication.id);
  const stagger = medStagger(medication.id);
  const now = Date.now();

  if (medication.pendingDose) {
    return buildFollowUpNotifications({ medication, ids, stagger, kind: 'pending' });
  }

  if (medication.running && medication.nextDoseAt && medication.nextDoseAt > now) {
    // 'scheduled' uses an anchor relative to nextDoseAt, not "now".
    return buildScheduledNotifications(medication, ids, stagger);
  }

  if (medication.running && medication.nextDoseAt && medication.nextDoseAt <= now) {
    return buildFollowUpNotifications({ medication, ids, stagger, kind: 'overdue' });
  }

  return [];
}

/** 'scheduled' branch — anchors slots on `nextDoseAt`, not `now`. */
function buildScheduledNotifications(
  medication: Medication,
  ids: number[],
  stagger: number,
): SchedNotification[] {
  if (!medication.nextDoseAt) return [];
  const result: SchedNotification[] = [];
  const now = Date.now();

  for (let slot = 0; slot < NATIVE_SCHEDULE_EXTRA_SLOTS; slot++) {
    const atMs = medication.nextDoseAt + slot * NATIVE_FOLLOW_UP_MS + (slot === 0 ? 0 : stagger);
    if (atMs <= now + MIN_FUTURE_MS) continue;
    const notificationId = ids[slot];
    if (notificationId == null) continue;

    result.push({
      id: notificationId,
      title: slot === 0 ? primaryTitle('scheduled') : followupTitle('scheduled'),
      body: bodyText(medication, 'scheduled', slot),
      schedule: { at: new Date(atMs), allowWhileIdle: true },
      channelId: NOTIFICATION_CHANNEL_ID,
      sound: 'medication_alarm.wav',
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: iconColorFor('scheduled'),
      actionTypeId: ACTION_TYPE_ID,
      extra: {
        medicationId: medication.id,
        kind: 'scheduled' as const,
        slot,
        scheduledAt: medication.nextDoseAt,
      },
      autoCancel: false,
      ongoing: false,
    });
  }
  return result;
}

/* ---------- queue cap (prioritize slot-0 over follow-ups) ---------- */

/**
 * Caps the queue to MAX_PENDING_NATIVE_NOTIFICATIONS. Slot-0 (first reminder)
 * for every medication is reserved before any follow-up is admitted, so a
 * large medication list cannot silently crowd out another medicine's
 * initial reminder.
 */
function capQueue(toSchedule: SchedNotification[]): SchedNotification[] {
  if (toSchedule.length <= MAX_PENDING_NATIVE_NOTIFICATIONS) return toSchedule;

  const primary = toSchedule.filter((notification) => Number(notification.extra.slot) === 0);
  const followUps = toSchedule
    .filter((notification) => Number(notification.extra.slot) !== 0)
    .sort(
      (a, b) =>
        Number(a.extra.slot) - Number(b.extra.slot) ||
        a.schedule.at.getTime() - b.schedule.at.getTime(),
    );

  const capped = [...primary, ...followUps]
    .slice(0, MAX_PENDING_NATIVE_NOTIFICATIONS)
    .sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime());

  console.warn('[Alarms] native queue capped to protect initial reminders', {
    requested: toSchedule.length,
    scheduled: capped.length,
    limit: MAX_PENDING_NATIVE_NOTIFICATIONS,
  });
  return capped;
}

/* ---------- schedule + obsolete-removal (preserves anchor strings) ---------- */

/**
 * Schedules `selectedNotifications` in SCHEDULE_CHUNK_SIZE batches and
 * returns the set of IDs that were attempted (whether or not each chunk
 * succeeded). Failed chunks do NOT remove their IDs from the desired set
 * so obsolete-removal below does not cancel still-working reminders.
 */
async function scheduleInChunks(selectedNotifications: SchedNotification[]): Promise<{
  desiredIds: Set<number>;
  failedChunks: number;
}> {
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

  return { desiredIds, failedChunks };
}

/**
 * Cancels reserved IDs that are no longer desired. Runs ONLY after the
 * schedule attempt so a failed schedule leaves previous reminders intact.
 */
async function cancelObsoleteSlots(
  reservedIds: { id: number }[],
  desiredIds: Set<number>,
): Promise<void> {
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
}

/* ---------- top-level native sync ---------- */

async function syncNative(medications: Medication[]): Promise<void> {
  // Reconcile orphaned notifications against the database-backed medication
  // list on startup/resume. This also catches a process death between deleting
  // the medication record and posting its explicit cancellation request.
  const activeMedicationIds = new Set(
    medications
      .filter((medication) => medication.id != null)
      .map((medication) => Number(medication.id)),
  );
  await reconcileOrphanedNotifications(activeMedicationIds);

  // Do not cancel the currently working reminders before replacements are scheduled.
  // If Android rejects a new schedule request, the previous reminder must remain.
  const reservedIds = medications
    .filter((m) => m.id != null)
    .flatMap((m) => notifIdsFor(m.id!).map((id) => ({ id })));

  const toSchedule: SchedNotification[] = medications.flatMap(buildMedicationNotifications);
  toSchedule.sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime());

  const selectedNotifications = capQueue(toSchedule);

  console.info('[Alarms] scheduling native', selectedNotifications.length, 'notifications');

  const { desiredIds, failedChunks } = await scheduleInChunks(selectedNotifications);
  await cancelObsoleteSlots(reservedIds, desiredIds);

  if (failedChunks > 0) {
    console.error('[Alarms] reminder sync incomplete; previous notifications were preserved where possible', {
      failedChunks,
      requested: toSchedule.length,
    });
  }
}

/* ==========================================================================
 * SW message listener (web only)
 * ========================================================================== */

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

/* ==========================================================================
 * Debounced sync helper
 * ========================================================================== */

interface DebouncedSync {
  schedule(medications: Medication[]): void;
  flush(): Promise<void>;
  cancel(): void;
}

/**
 * Debounce helper for high-churn medication state updates. Coalesces a burst
 * of state changes into a single sync, with a minimum interval between
 * actual sync runs to avoid hammering the notification scheduler.
 */
export function createDebouncedSync(delayMs = 350): DebouncedSync {
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
