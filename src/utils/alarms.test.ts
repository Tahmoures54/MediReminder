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
      'const desiredIds = new Set(toSchedule.map((notification) => notification.id));',
      'await LocalNotifications.schedule({ notifications: chunk });',
      'const obsoleteIds = reservedIds.filter(({ id }) => !desiredIds.has(id));',
      'await LocalNotifications.cancel({ notifications: chunk });',
    ];
    // Guard the ordering that prevents a failed replacement from first deleting
    // all working reminders for the medication.
    const order = sourceContract.map((fragment) => alarmSource.indexOf(fragment));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

});
