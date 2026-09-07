// src/utils/permissions.ts
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export const NOTIFICATION_CHANNEL_ID = 'medication-alarms';

export type AppNotificationPermission =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'prompt-with-rationale'
  | 'unavailable';

function normalizePermission(value: string | undefined): AppNotificationPermission {
  switch (value) {
    case 'granted':
    case 'denied':
    case 'prompt':
    case 'prompt-with-rationale':
      return value;
    default:
      return 'unavailable';
  }
}

/**
 * بررسی وضعیت فعلی مجوز اعلان
 */
export async function checkNotificationPermission(): Promise<AppNotificationPermission> {
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await LocalNotifications.checkPermissions();
      return normalizePermission(result.display);
    } catch (error) {
      console.error('خطا در بررسی مجوز:', error);
      return 'unavailable';
    }
  }

  if (typeof window === 'undefined' || !window.isSecureContext || !('Notification' in window)) {
    return 'unavailable';
  }

  if (Notification.permission === 'default') {
    return 'prompt';
  }

  return Notification.permission as AppNotificationPermission;
}

/**
 * درخواست مجوز اعلان
 * @returns وضعیت نهایی مجوز پس از درخواست
 */
export async function requestNotificationPermission(): Promise<AppNotificationPermission> {
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await LocalNotifications.requestPermissions();
      return normalizePermission(result.display);
    } catch (error) {
      console.error('خطا در درخواست مجوز:', error);
      return 'unavailable';
    }
  }

  if (typeof window === 'undefined' || !window.isSecureContext || !('Notification' in window)) {
    return 'unavailable';
  }

  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';

  const result = await Notification.requestPermission();
  return result === 'granted' ? 'granted' : 'denied';
}

export async function checkExactAlarmPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return true;

  try {
    const status = await LocalNotifications.checkExactNotificationSetting();
    return status.exact_alarm === 'granted';
  } catch (error) {
    console.warn('خطا در بررسی مجوز آلارم دقیق:', error);
    return false;
  }
}

export async function requestExactAlarmPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return true;

  try {
    if (await checkExactAlarmPermission()) return true;
    await LocalNotifications.changeExactNotificationSetting();
    return checkExactAlarmPermission();
  } catch (error) {
    console.warn('خطا در فعال‌سازی آلارم دقیق:', error);
    return false;
  }
}

/**
 * ساخت کانال اعلان اندروید با صدا و ویبره قوی
 */
export async function setupAndroidChannel(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;

  try {
    await LocalNotifications.createChannel({
      id: NOTIFICATION_CHANNEL_ID,
      name: 'هشدار مصرف دارو',
      description: 'یادآوری مکرر زمان مصرف دارو تا تأیید کاربر',
      importance: 5,
      visibility: 1,
      sound: 'medication_alarm.wav',
      vibration: true,
      lights: true,
      lightColor: '#DC2626',
    });
  } catch (error) {
    console.warn('خطا در ساخت کانال اعلان (ممکن است از قبل وجود داشته باشد):', error);
  }
}

/**
 * راه‌اندازی کامل مجوزها + کانال اندروید
 * ابتدا وضعیت مجوز بررسی می‌شود؛ اگر prompt باشد درخواست داده می‌شود.
 * ساخت کانال اندروید در صورت Native بودن همیشه انجام می‌شود.
 */
export async function initAllPermissions(): Promise<{ notification: boolean }> {
  let permission = await checkNotificationPermission();

  if (permission === 'prompt' || permission === 'prompt-with-rationale') {
    permission = await requestNotificationPermission();
  }

  // ساخت کانال برای اندروید در هر صورت (حتی اگر مجوز رد شده باشد، ممکن است بعداً اعطا شود)
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    await setupAndroidChannel();
  }

  return { notification: permission === 'granted' };
}
