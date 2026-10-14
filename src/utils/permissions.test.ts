import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
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

describe('checkExactAlarmPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isNativePlatform.mockReturnValue(true);
    mocks.getPlatform.mockReturnValue('android');
    mocks.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'granted' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows exact alarms only when Android explicitly reports granted', async () => {
    mocks.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'granted' });
    await expect(checkExactAlarmPermission()).resolves.toBe(true);

    mocks.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'denied' });
    await expect(checkExactAlarmPermission()).resolves.toBe(false);
  });

  it('fails closed when the native exact-alarm check is unavailable', async () => {
    const notifications = await import('@capacitor/local-notifications');
    const nativeNotifications = notifications.LocalNotifications as unknown as {
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

  it('fails closed when the native permission check throws', async () => {
    mocks.checkExactNotificationSetting.mockRejectedValue(new Error('native bridge unavailable'));
    await expect(checkExactAlarmPermission()).resolves.toBe(false);
  });

  it('does not require Android exact-alarm permission on web or iOS', async () => {
    mocks.isNativePlatform.mockReturnValue(false);
    await expect(checkExactAlarmPermission()).resolves.toBe(true);

    mocks.isNativePlatform.mockReturnValue(true);
    mocks.getPlatform.mockReturnValue('ios');
    await expect(checkExactAlarmPermission()).resolves.toBe(true);

    expect(mocks.checkExactNotificationSetting).not.toHaveBeenCalled();
  });
});
