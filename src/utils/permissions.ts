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
 * بررسی وضعیت فعلی مجوز اعلان
 */
export async function checkNotificationPermission(): Promise<AppNotificationPermission> {
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await LocalNotifications.checkPermissions();
      return (result.display ?? 'prompt') as AppNotificationPermission;
    } catch (error) {
      console.error('خطا در بررسی مجوز:', error);
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
 * درخواست مجوز اعلان
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await LocalNotifications.requestPermissions();
      return result.display === 'granted';
    } catch (error) {
      console.error('خطا در درخواست مجوز:', error);
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
 * ساخت کانال اعلان اندروید با صدا و ویبره قوی
 */
export async function setupAndroidChannel(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;

  try {
    try {
      await LocalNotifications.deleteChannel({ id: NOTIFICATION_CHANNEL_ID });
    } catch {
      // کانال ممکن است هنوز وجود نداشته باشد
    }

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
    console.error('خطا در ساخت کانال اعلان:', error);
  }
}

/**
 * راه‌اندازی کامل مجوزها + کانال اندروید
 */
export async function initAllPermissions(): Promise<{ notification: boolean }> {
  const notification = await requestNotificationPermission();

  if (notification) {
    await setupAndroidChannel();
  }

  return { notification };
}
