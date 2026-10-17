import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Medication } from '../db/database';

/* ==========================================================================
 * alarms.ts — native reminder queue & cleanup safety contracts
 *
 * These tests pin down two classes of invariants:
 *
 *   A. NUMERIC SAFETY MARGINS — the follow-up spacing, slot count, and
 *      pending-queue cap must stay within Android Doze-friendly bounds.
 *      These are pure constant assertions; fast and deterministic.
 *
 *   B. STRUCTURAL / BEHAVIORAL CONTRACTS — the order in which alarms.ts
 *      schedules replacements vs. cancels obsolete ones, the per-medication
 *      cleanup behavior, and the boot reconciliation flow.
 *
 * Trade-off: structural tests are brittle against refactors. They are kept
 * narrow (only safety-critical orderings) so renaming a variable or
 * restructuring a non-critical block does not trigger a false failure.
 * ========================================================================== */

/* --------------------------------------------------------------------------
 * Source loading
 * -------------------------------------------------------------------------- */

const ALARMS_PATH = new URL('./alarms.ts', import.meta.url);
const APP_PATH = new URL('../App.tsx', import.meta.url);
const SW_PATH = new URL('../../public/sw.js', import.meta.url);

const alarmSource = readFileSync(fileURLToPath(ALARMS_PATH), 'utf8');
const appSource = readFileSync(fileURLToPath(APP_PATH), 'utf8');
const swSource = readFileSync(fileURLToPath(SW_PATH), 'utf8');

/* --------------------------------------------------------------------------
 * Mock setup
 * -------------------------------------------------------------------------- */

interface MockNotification {
  id: number;
  extra?: { medicationId?: number; slot?: number };
}

interface MockState {
  enabled: boolean;
  pending: MockNotification[];
  delivered: MockNotification[];
  cancel: ReturnType<typeof vi.fn>;
  removeDelivered: ReturnType<typeof vi.fn>;
  schedule: ReturnType<typeof vi.fn>;
}

const nativeState = vi.hoisted<MockState>(() => ({
  enabled: false,
  pending: [] as MockNotification[],
  delivered: [] as MockNotification[],
  cancel: vi.fn(async (_args: { notifications: MockNotification[] }) => {}),
  removeDelivered: vi.fn(async (_args: { notifications: MockNotification[] }) => {}),
  schedule: vi.fn(async (_args: { notifications: MockNotification[] }) => {}),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => nativeState.enabled,
    getPlatform: () => 'android',
  },
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    registerActionTypes: vi.fn(async () => {}),
    getPending: vi.fn(async () => ({ notifications: nativeState.pending })),
    getDeliveredNotifications: vi.fn(async () => ({ notifications: nativeState.delivered })),
    cancel: nativeState.cancel,
    removeDeliveredNotifications: nativeState.removeDelivered,
    schedule: nativeState.schedule,
  },
}));

/* --------------------------------------------------------------------------
 * Imports (after mocks are registered)
 * -------------------------------------------------------------------------- */

import {
  NATIVE_FOLLOW_UP_MS,
  NATIVE_FOLLOW_UP_SLOTS,
  NATIVE_PENDING_REFRESH_MS,
  MAX_PENDING_NATIVE_NOTIFICATIONS,
  cancelMedNotifications,
  syncAllAlarms,
} from './alarms';

/* --------------------------------------------------------------------------
 * Test helpers
 * -------------------------------------------------------------------------- */

/**
 * Asserts that every fragment appears in `source` and in the given order.
 * Throws with the missing fragments and the first out-of-order pair so a
 * failure points directly at the offending contract.
 */
function expectOrderedIn(source: string, fragments: readonly string[]): void {
  const positions = fragments.map((fragment) => source.indexOf(fragment));

  const missing = fragments.filter((_, i) => positions[i] === -1);
  if (missing.length > 0) {
    throw new Error(
      `Missing fragment(s) in source:\n  - ${missing.join('\n  - ')}`,
    );
  }

  for (let i = 1; i < positions.length; i++) {
    if (positions[i]! < positions[i - 1]!) {
      throw new Error(
        `Ordering violation:\n` +
        `  Expected "${fragments[i - 1]}" to appear before "${fragments[i]}"\n` +
        `  Got positions: ${positions[i - 1]!} → ${positions[i]!}`,
      );
    }
  }
}

function expectContains(source: string, fragment: string): void {
  if (!source.includes(fragment)) {
    throw new Error(`Expected source to contain:\n  "${fragment}"`);
  }
}

/** Returns the IDs that were passed to the mocked `cancel` call. */
function cancelledIds(): number[] {
  return nativeState.cancel.mock.calls.flatMap(
    ([arg]) => arg.notifications.map((item: MockNotification) => item.id),
  );
}

/** Returns the IDs that were passed to the mocked `removeDelivered` call(s). */
function removedDeliveredIds(): number[] {
  return nativeState.removeDelivered.mock.calls.flatMap(
    ([arg]) => arg.notifications.map((item: MockNotification) => item.id),
  );
}

/** Builds a minimal valid Medication for tests. Defaults are overridable. */
function makeMedication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: 8,
    name: 'Active',
    dosage: '1',
    intervalHours: 8,
    interval: 28800,
    quantity: 10,
    remaining: 10000,
    running: true,
    nextDoseAt: Date.now() + 60_000,
    ...overrides,
  };
}

/* --------------------------------------------------------------------------
 * Reset state between tests
 * -------------------------------------------------------------------------- */

beforeEach(() => {
  nativeState.enabled = false;
  nativeState.pending = [];
  nativeState.delivered = [];
  nativeState.cancel.mockClear();
  nativeState.removeDelivered.mockClear();
  nativeState.schedule.mockClear();
});

/* --------------------------------------------------------------------------
 * Contracts
 * -------------------------------------------------------------------------- */

describe('alarms — native reminder queue safety margins', () => {
  /* --------------------------------------------------------------------
   * Contract 1: Follow-up spacing must respect Android Doze.
   *
   * Android Doze batches alarms with a minimum spacing of ~9 minutes in
   * maintenance windows. Spacing follow-ups below 9 minutes risks them
   * being silently batched into a single delivery. The 15-minute target
   * gives a comfortable safety margin.
   * ------------------------------------------------------------------ */
  it('keeps follow-ups outside Android Doze minimum spacing', () => {
    expect(NATIVE_FOLLOW_UP_MS).toBe(15 * 60 * 1000);
    expect(NATIVE_FOLLOW_UP_MS).toBeGreaterThanOrEqual(9 * 60 * 1000);
  });

  /* --------------------------------------------------------------------
   * Contract 2: Pre-scheduled follow-up window covers a full sleep cycle
   * (8 hours) and is refreshed BEFORE it expires.
   *
   * With 36 slots at 15-min spacing, coverage = 35 * 15 = 525 min = 8.75h.
   * The pending-refresh interval must be strictly less than coverage so
   * the queue never drops to zero before the next refresh runs.
   * ------------------------------------------------------------------ */
  it('pre-schedules a bounded follow-up window and refreshes before it expires', () => {
    const coverageMs = NATIVE_FOLLOW_UP_MS * (NATIVE_FOLLOW_UP_SLOTS - 1);
    expect(NATIVE_FOLLOW_UP_SLOTS).toBe(36);
    expect(coverageMs).toBeGreaterThanOrEqual(8 * 60 * 60 * 1000);
    expect(NATIVE_PENDING_REFRESH_MS).toBeLessThan(coverageMs);
  });

  /* --------------------------------------------------------------------
   * Contract 3: Replacement scheduling must precede obsolete-slot removal.
   *
   * If we cancelled obsolete reserved slots BEFORE scheduling replacements,
   * a scheduling failure would leave the medication with NO active reminder
   * at all. Doing it in the safe order means a failure leaves the previous
   * reminders still firing.
   * ------------------------------------------------------------------ */
  it('does not mark the next reminder for cancellation before replacement scheduling', () => {
    const sourceContract = [
      'const desiredIds = new Set(selectedNotifications.map((notification) => notification.id));',
      'await LocalNotifications.schedule({ notifications: chunk });',
      '// Only after attempting replacements, remove unused reserved slots.',
      'const obsoleteIds = reservedIds.filter(({ id }) => !desiredIds.has(id));',
    ];
    expectOrderedIn(alarmSource, sourceContract);
  });

  /* --------------------------------------------------------------------
   * Contract 4: The shared native queue is capped and prioritizes one
   * initial reminder per medication over follow-ups.
   *
   * Android limits the number of simultaneously scheduled alarms; exceeding
   * the cap causes silent drops. Prioritizing slot 0 (the first reminder)
   * ensures every medication has at least its next dose scheduled before
   * any medication gets a second follow-up slot.
   * ------------------------------------------------------------------ */
  it('caps the shared native queue and prioritizes one initial reminder per medication', () => {
    expect(MAX_PENDING_NATIVE_NOTIFICATIONS).toBe(450);

    const cap = alarmSource.indexOf(
      'const primary = toSchedule.filter((notification) => Number(notification.extra.slot) === 0)',
    );
    const followUps = alarmSource.indexOf('const followUps = toSchedule', cap);
    const selection = alarmSource.indexOf(
      '.slice(0, MAX_PENDING_NATIVE_NOTIFICATIONS)',
      followUps,
    );

    expect(cap).toBeGreaterThanOrEqual(0);
    expect(followUps).toBeGreaterThan(cap);
    expect(selection).toBeGreaterThan(followUps);
  });
});

describe('alarms — deleted medication notification cleanup', () => {
  /* --------------------------------------------------------------------
   * Contract 5: Deleting a medication cancels its scheduled AND delivered
   * notifications, but leaves other medications' notifications untouched.
   *
   * The `extra.medicationId` field is the join key; matching is by it
   * alone, not by ID range. This guards against a regression that used
   * numeric ID ranges (which collide when two medications use overlapping
   * reserved slots).
   * ------------------------------------------------------------------ */
  it('cancels scheduled IDs and removes already-delivered notifications for only the deleted medicine', async () => {
    nativeState.enabled = true;
    nativeState.pending = [
      { id: 7100, extra: { medicationId: 7 } },
      { id: 8100, extra: { medicationId: 8 } },
      { id: 99001, extra: { medicationId: 7 } },
    ];
    nativeState.delivered = [
      { id: 7101, extra: { medicationId: 7 } },
      { id: 88001, extra: { medicationId: 8 } },
    ];

    await cancelMedNotifications(7);

    const cancelled = cancelledIds();
    expect(cancelled).toContain(7100);
    expect(cancelled).toContain(99001);
    expect(cancelled).not.toContain(8100);

    expect(nativeState.removeDelivered).toHaveBeenCalledTimes(1);
    expect(removedDeliveredIds()).toEqual([7101]);
  });

  /* --------------------------------------------------------------------
   * Contract 6: Startup reconciliation removes notifications for any
   * medication no longer in the active list, while preserving active
   * medications' notifications.
   *
   * This is the recovery path for: user reinstalls, restores from backup,
   * or switches devices — the native notification store may contain
   * stale entries for medications that no longer exist locally.
   * ------------------------------------------------------------------ */
  it('startup reconciliation cancels orphaned notifications but preserves another medication', async () => {
    nativeState.enabled = true;
    nativeState.pending = [
      { id: 7100, extra: { medicationId: 7 } },
      { id: 8100, extra: { medicationId: 8 } },
    ];
    nativeState.delivered = [
      { id: 7101, extra: { medicationId: 7 } },
      { id: 8101, extra: { medicationId: 8 } },
    ];
    const active: Medication[] = [makeMedication({ id: 8, name: 'Active' })];

    await syncAllAlarms(active);

    const cancelled = cancelledIds();
    expect(cancelled).toContain(7100);
    expect(cancelled).not.toContain(8100);

    const removed = removedDeliveredIds();
    expect(removed).toContain(7101);
    expect(removed).not.toContain(8101);
  });

  /* --------------------------------------------------------------------
   * Contract 7: On non-native platforms (web/PWA), cancelMedNotifications
   * must be a safe no-op rather than throwing. The function is called
   * from deletion paths regardless of platform.
   * ------------------------------------------------------------------ */
  it('cancelMedNotifications is a safe no-op on non-native platforms', async () => {
    nativeState.enabled = false;
    await expect(cancelMedNotifications(42)).resolves.toBeUndefined();
    expect(nativeState.cancel).not.toHaveBeenCalled();
    expect(nativeState.removeDelivered).not.toHaveBeenCalled();
  });

  /* --------------------------------------------------------------------
   * Contract 8: cancelMedNotifications tolerates a medication with no
   * matching notifications (no-op, no throw).
   * ------------------------------------------------------------------ */
  it('cancelMedNotifications with no matching notifications is a no-op', async () => {
    nativeState.enabled = true;
    nativeState.pending = [{ id: 8100, extra: { medicationId: 8 } }];
    nativeState.delivered = [{ id: 8101, extra: { medicationId: 8 } }];

    await cancelMedNotifications(999);

    // The native cleanup always cancels the medication's reserved ID range,
    // even when no current notification metadata matches. This clears stale
    // scheduled slots left by older app versions.
    expect(nativeState.cancel).toHaveBeenCalled();
    expect(cancelledIds()).toContain(999100);
    expect(nativeState.removeDelivered).not.toHaveBeenCalled();
  });
});

describe('alarms — boot reconciliation & deletion ordering (cross-file)', () => {
  /* --------------------------------------------------------------------
   * Contract 9: App boot must load medications from IndexedDB BEFORE
   * calling syncAllAlarms. Otherwise alarms would be reconciled against
   * an empty list and every existing notification would be cancelled.
   * ------------------------------------------------------------------ */
  it('App.tsx loads medications before starting background alarm reconciliation', () => {
    expectContains(appSource, 'const [loadedMedications, purchasedCards, hasFreeToken] = await Promise.all([');
    expectContains(appSource, 'void syncAllAlarms(loadedMedications)');
    expectContains(appSource, 'runStartupTasksInBackground(loadedMedications, native);');

    // The reconciliation helper is declared before the DB read, but it is
    // invoked only after the parallel IndexedDB reads have completed.
    const loadIdx = appSource.indexOf('const [loadedMedications, purchasedCards, hasFreeToken] = await Promise.all([');
    const startupIdx = appSource.indexOf('runStartupTasksInBackground(loadedMedications, native);');
    expect(startupIdx).toBeGreaterThan(loadIdx);
  });

  /* --------------------------------------------------------------------
   * Contract 10: Deletion must persist to IndexedDB BEFORE cancelling
   * notifications. If cancellation ran first and the DB delete then
   * failed, the medication would still be in the DB but its reminders
   * would be gone — a confusing inconsistent state. Persisting first
   * means a notification-cleanup failure leaves harmless orphan
   * notifications that the next sync will reap.
   * ------------------------------------------------------------------ */
  it('deletion commits to IndexedDB before notification cleanup', () => {
    const cancelIdx = appSource.indexOf('await cancelMedNotifications(id)');
    const deleteIdx = appSource.indexOf('await db.deleteMedication(id)');
    expect(cancelIdx).toBeGreaterThanOrEqual(0);
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    // Native notification cleanup is performed before deletion to avoid a
    // crash window where the medication is deleted but its OS alarm survives.
    expect(cancelIdx).toBeLessThan(deleteIdx);
  });

  /* --------------------------------------------------------------------
   * Contract 11: The service worker tracks orphaned medication IDs and
   * fully cancels alarms for them, including closing any visible
   * notifications held by the SW itself.
   * ------------------------------------------------------------------ */
  it('service worker reconciles orphaned alarms and closes visible notifications', () => {
    expectContains(swSource, 'const orphanMedicationIds = new Set();');
    expectContains(swSource, 'await cancelAlarmCompletely(medicationId);');
    expectContains(swSource, 'self.registration.getNotifications');
    expectContains(swSource, 'notifications.forEach(n => n.close())');
  });
});
