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

/**
 * بررسی وضعیت فعلی مجوز نوتیفیکیشن
 */
export async function checkNotificationPermission(): Promise<AppNotificationPermission> {
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await LocalNotifications.checkPermissions();
      return (result.display ?? 'prompt') as AppNotificationPermission;
    } catch (error) {
      console.error('checkPermissions error:', error);
      return 'unavailable';
    }
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unavailable';
  }

  if (Notification.permission === 'default') {
    return 'prompt';
  }

  return Notification.permission as AppNotificationPermission;
}

/**
 * درخواست مجوز نوتیفیکیشن
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await LocalNotifications.requestPermissions();
      return result.display === 'granted';
    } catch (error) {
      console.error('requestPermissions error:', error);
      return false;
    }
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  const result = await Notification.requestPermission();
  return result === 'granted';
}

/**
 * ساخت کانال نوتیفیکیشن اندروید با صدا و ویبره
 * مهم: فایل صدا باید در این مسیر باشد:
 * android/app/src/main/res/raw/medication_alarm.wav
 */
export async function setupAndroidChannel(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;

  try {
    // اگر قبلاً کانال بدون صدا ساخته شده بود، پاک شود
    try {
      await LocalNotifications.deleteChannel({ id: NOTIFICATION_CHANNEL_ID });
    } catch {
      // اگر وجود نداشت مشکلی نیست
    }

    await LocalNotifications.createChannel({
      id: NOTIFICATION_CHANNEL_ID,
      name: 'Medication Alarms',
      description: 'Medication reminder alerts',
      importance: 5,
      visibility: 1,
      sound: 'medication_alarm.wav',
      vibration: true,
      lights: true,
      lightColor: '#DC2626',
    });
  } catch (error) {
    console.error('createChannel error:', error);
  }
}

/**
 * راه‌اندازی کامل مجوزها
 */
export async function initAllPermissions(): Promise<{
  notification: boolean;
}> {
  const notification = await requestNotificationPermission();

  if (notification) {
    await setupAndroidChannel();
  }

  return { notification };
}
