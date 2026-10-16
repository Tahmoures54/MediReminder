import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const alarmSource = readFileSync(fileURLToPath(new URL('./alarms.ts', import.meta.url)), 'utf8');

const nativeState = vi.hoisted(() => ({
  enabled: false,
  pending: [] as Array<{ id: number; extra?: { medicationId?: number } }>,
  delivered: [] as Array<{ id: number; extra?: { medicationId?: number } }>,
  cancel: vi.fn(async (_args: { notifications: Array<{ id: number }> }) => {}),
  removeDelivered: vi.fn(async (_args: { notifications: Array<{ id: number; extra?: { medicationId?: number } }> }) => {}),
  schedule: vi.fn(async (_args: { notifications: Array<{ id: number }> }) => {}),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => nativeState.enabled, getPlatform: () => 'android' },
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

import {
  NATIVE_FOLLOW_UP_MS,
  NATIVE_FOLLOW_UP_SLOTS,
  NATIVE_PENDING_REFRESH_MS,
  MAX_PENDING_NATIVE_NOTIFICATIONS,
  cancelMedNotifications,
  syncAllAlarms,
} from './alarms';
import type { Medication } from '../db/database';

beforeEach(() => {
  nativeState.enabled = false;
  nativeState.pending = [];
  nativeState.delivered = [];
  nativeState.cancel.mockClear();
  nativeState.removeDelivered.mockClear();
  nativeState.schedule.mockClear();
});

describe('native reminder queue safety margins', () => {
  it('keeps follow-ups outside Android Doze minimum spacing', () => {
    expect(NATIVE_FOLLOW_UP_MS).toBe(15 * 60 * 1000);
    expect(NATIVE_FOLLOW_UP_MS).toBeGreaterThanOrEqual(9 * 60 * 1000);
  });

  it('pre-schedules a bounded follow-up window and refreshes before it expires', () => {
    const coverageMs = NATIVE_FOLLOW_UP_MS * (NATIVE_FOLLOW_UP_SLOTS - 1);
    expect(NATIVE_FOLLOW_UP_SLOTS).toBe(36);
    expect(coverageMs).toBeGreaterThanOrEqual(8 * 60 * 60 * 1000);
    expect(NATIVE_PENDING_REFRESH_MS).toBeLessThan(coverageMs);
  });
  it('does not mark the next reminder for cancellation before replacement scheduling', () => {
    const sourceContract = [
      'const desiredIds = new Set(selectedNotifications.map((notification) => notification.id));',
      'await LocalNotifications.schedule({ notifications: chunk });',
      '// Only after attempting replacements, remove unused reserved slots.',
      'const obsoleteIds = reservedIds.filter(({ id }) => !desiredIds.has(id));',
    ];
    // Guard the ordering that prevents a failed replacement from first deleting
    // all working reminders for the medication.
    const order = sourceContract.map((fragment) => alarmSource.indexOf(fragment));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('caps the shared native queue and prioritizes one initial reminder per medication', () => {
    expect(MAX_PENDING_NATIVE_NOTIFICATIONS).toBe(450);
    const cap = alarmSource.indexOf('const primary = toSchedule.filter((notification) => Number(notification.extra.slot) === 0)');
    const followUps = alarmSource.indexOf('const followUps = toSchedule', cap);
    const selection = alarmSource.indexOf('.slice(0, MAX_PENDING_NATIVE_NOTIFICATIONS)', followUps);
    expect(cap).toBeGreaterThanOrEqual(0);
    expect(followUps).toBeGreaterThan(cap);
    expect(selection).toBeGreaterThan(followUps);
  });

});

describe('deleted medication notification cleanup', () => {
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

    const cancelledIds = nativeState.cancel.mock.calls.flatMap(([arg]) => arg.notifications.map((item) => item.id));
    expect(cancelledIds).toContain(7100);
    expect(cancelledIds).toContain(99001);
    expect(cancelledIds).not.toContain(8100);
    expect(nativeState.removeDelivered).toHaveBeenCalledTimes(1);
    expect(nativeState.removeDelivered.mock.calls[0][0].notifications.map((item) => item.id)).toEqual([7101]);
  });

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
    const active: Medication[] = [{
      id: 8, name: 'Active', dosage: '1', intervalHours: 8, interval: 28800,
      quantity: 10, remaining: 10000, running: true, nextDoseAt: Date.now() + 60000,
    }];

    await syncAllAlarms(active);

    const cancelledIds = nativeState.cancel.mock.calls.flatMap(([arg]) => arg.notifications.map((item) => item.id));
    expect(cancelledIds).toContain(7100);
    expect(cancelledIds).not.toContain(8100);
    expect(nativeState.removeDelivered.mock.calls.flatMap(([arg]) => arg.notifications.map((item) => item.id))).toContain(7101);
    expect(nativeState.removeDelivered.mock.calls.flatMap(([arg]) => arg.notifications.map((item) => item.id))).not.toContain(8101);
  });

  it('boot reconciles alarms and deletion commits to IndexedDB before notification cleanup', () => {
    const appSource = readFileSync(fileURLToPath(new URL('../App.tsx', import.meta.url)), 'utf8');
    const swSource = readFileSync(fileURLToPath(new URL('../../public/sw.js', import.meta.url)), 'utf8');
    expect(appSource).toContain('const loadedMedications = await load();');
    expect(appSource).toContain('await syncAllAlarms(loadedMedications);');
    expect(appSource.indexOf('await db.deleteMedication(id)'))
      .toBeLessThan(appSource.indexOf('await cancelMedNotifications(id)'));
    expect(swSource).toContain('const orphanMedicationIds = new Set();');
    expect(swSource).toContain('await cancelAlarmCompletely(medicationId);');
    expect(swSource).toContain('self.registration.getNotifications');
    expect(swSource).toContain('notifications.forEach(n => n.close())');
  });
});
