import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ==========================================================================
 * permissions.ts — checkExactAlarmPermission contracts
 *
 * The exact-alarm permission on Android 12+ (SCHEDULE_EXACT_ALARM) and
 * Android 13+ (USE_EXACT_ALARM) gates whether medication reminders fire on
 * time. If the app silently assumes the permission is granted when it is
 * not, reminders can be batched into Doze windows and fire hours late —
 * a safety-critical bug for a medication reminder.
 *
 * Contract summary:
 *   1. Only Android is subject to the exact-alarm check.
 *   2. On Android, the permission is granted ONLY when the native bridge
 *      explicitly reports `exact_alarm: 'granted'`. Every other value
 *      (including 'denied', missing field, thrown error, unavailable
 *      bridge) must fail closed → `false`.
 *   3. Web and iOS short-circuit to `true` (no exact-alarm concept).
 *
 * Why fail-closed: a false negative (treating "unknown" as "denied")
 * prompts the user to re-grant the permission, which is annoying but
 * safe. A false positive (treating "unknown" as "granted") silently
 * breaks reminder timing — unsafe. So we default to the safe side.
 * ========================================================================== */

/* --------------------------------------------------------------------------
 * Mock setup
 *
 * `vi.hoisted` ensures the mock object exists before the `vi.mock` factory
 * runs — without it, the factory would close over an undefined variable.
 * -------------------------------------------------------------------------- */

interface PermissionMocks {
  isNativePlatform: ReturnType<typeof vi.fn>;
  getPlatform: ReturnType<typeof vi.fn>;
  checkPermissions: ReturnType<typeof vi.fn>;
  requestPermissions: ReturnType<typeof vi.fn>;
  createChannel: ReturnType<typeof vi.fn>;
  checkExactNotificationSetting: ReturnType<typeof vi.fn>;
  changeExactNotificationSetting: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted<PermissionMocks>(() => ({
  isNativePlatform: vi.fn(),
  getPlatform: vi.fn(),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  createChannel: vi.fn(),
  checkExactNotificationSetting: vi.fn(),
  changeExactNotificationSetting: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: mocks.isNativePlatform,
    getPlatform: mocks.getPlatform,
  },
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: mocks.checkPermissions,
    requestPermissions: mocks.requestPermissions,
    createChannel: mocks.createChannel,
    checkExactNotificationSetting: mocks.checkExactNotificationSetting,
    changeExactNotificationSetting: mocks.changeExactNotificationSetting,
  },
}));

import { checkExactAlarmPermission } from './permissions';
type LocalNotificationsType = typeof import('@capacitor/local-notifications').LocalNotifications;

/* --------------------------------------------------------------------------
 * Test helpers
 * -------------------------------------------------------------------------- */

/** Sets the platform to native Android. */
function setAndroidNative(): void {
  mocks.isNativePlatform.mockReturnValue(true);
  mocks.getPlatform.mockReturnValue('android');
}

/** Sets the platform to native iOS. */
function setIosNative(): void {
  mocks.isNativePlatform.mockReturnValue(true);
  mocks.getPlatform.mockReturnValue('ios');
}

/** Sets the platform to web (PWA). */
function setWeb(): void {
  mocks.isNativePlatform.mockReturnValue(false);
}

/** Sets the result of `checkExactNotificationSetting` to `{ exact_alarm }`. */
function setExactAlarmResult(exact_alarm: string): void {
  mocks.checkExactNotificationSetting.mockResolvedValue({ exact_alarm });
}

/* --------------------------------------------------------------------------
 * Reset between tests
 * -------------------------------------------------------------------------- */

beforeEach(() => {
  vi.clearAllMocks();
  // Default to native Android with granted permission — individual tests
  // override what they need.
  setAndroidNative();
  setExactAlarmResult('granted');
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* --------------------------------------------------------------------------
 * Contracts
 * -------------------------------------------------------------------------- */

describe('checkExactAlarmPermission — Android explicit-grant contract', () => {
  /* --------------------------------------------------------------------
   * Contract: only the literal string 'granted' from the native bridge
   * permits exact alarms. This is the single positive case.
   * ------------------------------------------------------------------ */
  it('returns true only when Android explicitly reports exact_alarm=granted', async () => {
    setExactAlarmResult('granted');
    await expect(checkExactAlarmPermission()).resolves.toBe(true);
  });

  /* --------------------------------------------------------------------
   * Contract: 'denied' must fail. This is the explicit negative case.
   * ------------------------------------------------------------------ */
  it('returns false when Android reports exact_alarm=denied', async () => {
    setExactAlarmResult('denied');
    await expect(checkExactAlarmPermission()).resolves.toBe(false);
  });

  /* --------------------------------------------------------------------
   * Contract: any other string value must fail closed. Guards against a
   * future Capacitor release that adds a new state (e.g. 'prompt',
   * 'blocked', 'restricted') from silently being treated as granted.
   * ------------------------------------------------------------------ */
  it('returns false for unknown exact_alarm states (future-proofing)', async () => {
    setExactAlarmResult('prompt');
    await expect(checkExactAlarmPermission()).resolves.toBe(false);

    setExactAlarmResult('blocked');
    await expect(checkExactAlarmPermission()).resolves.toBe(false);

    setExactAlarmResult('restricted');
    await expect(checkExactAlarmPermission()).resolves.toBe(false);
  });

  /* --------------------------------------------------------------------
   * Contract: a missing `exact_alarm` field must fail closed. Some
   * Capacitor bridge implementations on older Android versions return
   * an empty object — treating that as "granted" would be unsafe.
   * ------------------------------------------------------------------ */
  it('returns false when the exact_alarm field is missing from the response', async () => {
    mocks.checkExactNotificationSetting.mockResolvedValue({});
    await expect(checkExactAlarmPermission()).resolves.toBe(false);
  });

  /* --------------------------------------------------------------------
   * Contract: a null/undefined response must fail closed. Catches a
   * buggy bridge that returns void.
   * ------------------------------------------------------------------ */
  it('returns false when the native response is null or undefined', async () => {
    mocks.checkExactNotificationSetting.mockResolvedValue(null);
    await expect(checkExactAlarmPermission()).resolves.toBe(false);

    mocks.checkExactNotificationSetting.mockResolvedValue(undefined);
    await expect(checkExactAlarmPermission()).resolves.toBe(false);
  });
});

describe('checkExactAlarmPermission — fail-closed on bridge failures', () => {
  /* --------------------------------------------------------------------
   * Contract: if the native bridge method is missing entirely (older
   * plugin version, partial install, OEM-modified webview), the check
   * must NOT throw — it must return false so the caller can prompt the
   * user to grant via the in-app settings deep-link.
   * ------------------------------------------------------------------ */
  it('fails closed when the native exact-alarm check is unavailable', async () => {
    const notifications = (await import('@capacitor/local-notifications')) as {
      LocalNotifications: LocalNotificationsType & {
        checkExactNotificationSetting?: unknown;
      };
    };
    const nativeNotifications = notifications.LocalNotifications as {
      checkExactNotificationSetting?: unknown;
    };
    const originalCheck = nativeNotifications.checkExactNotificationSetting;
    try {
      nativeNotifications.checkExactNotificationSetting = undefined;
      await expect(checkExactAlarmPermission()).resolves.toBe(false);
    } finally {
      nativeNotifications.checkExactNotificationSetting = originalCheck;
    }
  });

  /* --------------------------------------------------------------------
   * Contract: a thrown error from the bridge (e.g. native code crashed,
   * JNI error, permission-check service unavailable) must fail closed.
   * ------------------------------------------------------------------ */
  it('fails closed when the native permission check throws', async () => {
    mocks.checkExactNotificationSetting.mockRejectedValue(
      new Error('native bridge unavailable'),
    );
    await expect(checkExactAlarmPermission()).resolves.toBe(false);
  });

  /* --------------------------------------------------------------------
   * Contract: a non-Error rejection (string, plain object) must also
   * fail closed without propagating the rejection to the caller.
   * ------------------------------------------------------------------ */
  it('fails closed when the native permission check rejects with a non-Error', async () => {
    mocks.checkExactNotificationSetting.mockRejectedValue('string error');
    await expect(checkExactAlarmPermission()).resolves.toBe(false);

    mocks.checkExactNotificationSetting.mockRejectedValue({ code: 'X' });
    await expect(checkExactAlarmPermission()).resolves.toBe(false);
  });
});

describe('checkExactAlarmPermission — platform gating', () => {
  /* --------------------------------------------------------------------
   * Contract: web (PWA) does not have the exact-alarm concept — short-
   * circuit to true so the web build does not block on a missing API.
   * ------------------------------------------------------------------ */
  it('returns true on web without calling the native bridge', async () => {
    setWeb();
    await expect(checkExactAlarmPermission()).resolves.toBe(true);
    expect(mocks.checkExactNotificationSetting).not.toHaveBeenCalled();
  });

  /* --------------------------------------------------------------------
   * Contract: iOS does not have the exact-alarm concept (notifications
   * fire on time by default, no separate permission tier) — short-
   * circuit to true.
   * ------------------------------------------------------------------ */
  it('returns true on iOS without calling the native bridge', async () => {
    setIosNative();
    await expect(checkExactAlarmPermission()).resolves.toBe(true);
    expect(mocks.checkExactNotificationSetting).not.toHaveBeenCalled();
  });

  /* --------------------------------------------------------------------
   * Contract: an unknown native platform (e.g. 'electron', future
   * platforms) must NOT call the Android-specific exact-alarm API.
   * Safer to short-circuit to true and let platform-specific paths
   * handle their own permission flows.
   * ------------------------------------------------------------------ */
  it('returns true on unknown native platforms without calling the Android bridge', async () => {
    mocks.isNativePlatform.mockReturnValue(true);
    mocks.getPlatform.mockReturnValue('electron');
    await expect(checkExactAlarmPermission()).resolves.toBe(true);
    expect(mocks.checkExactNotificationSetting).not.toHaveBeenCalled();
  });
});
