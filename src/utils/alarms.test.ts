import { describe, expect, it, vi } from 'vitest';

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
});
