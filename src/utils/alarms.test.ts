import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const alarmSource = readFileSync(fileURLToPath(new URL('./alarms.ts', import.meta.url)), 'utf8');

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {},
}));

import {
  NATIVE_FOLLOW_UP_MS,
  NATIVE_FOLLOW_UP_SLOTS,
  NATIVE_PENDING_REFRESH_MS,
  MAX_PENDING_NATIVE_NOTIFICATIONS,
} from './alarms';

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
