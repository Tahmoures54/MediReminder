// src/utils/permissions.ts
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export type PermissionStatus = 'granted' | 'denied' | 'prompt' | 'unavailable';

/**
 * بررسی وضعیت فعلی مجوز نوتیفیکیشن
 */
export async function checkNotificationPermission(): Promise<PermissionStatus> {
  if (Capacitor.isNativePlatform()) {
    const result = await LocalNotifications.checkPermissions();
    return result.display as PermissionStatus;
  }

  if (!('Notification' in window)) return 'unavailable';
  return Notification.permission as PermissionStatus;
}

/**
 * درخواست مجوز نوتیفیکیشن از کاربر
 * مقدار برگشتی: true یعنی مجوز داده شد
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await LocalNotifications.requestPermissions();
      return result.display === 'granted';
    } catch (err) {
      console.error('Native notification permission error:', err);
      return false;
    }
  }

  // وب / PWA
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  const result = await Notification.requestPermission();
  return result === 'granted';
}

/**
 * ایجاد کانال نوتیفیکیشن اندروید (فقط یک‌بار کافی است)
 */
export async function setupAndroidChannel(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    // حذف کانال قدیمی و ساخت مجدد (برای جلوگیری از cache بدون صدا)
    await LocalNotifications.deleteChannel({ id: 'medication-alarms' });
  } catch {}

  try {
    await LocalNotifications.createChannel({
      id: 'medication-alarms',
      name: 'Medication Alarms',
      description: 'Reminders for medication doses',
      importance: 5,        // IMPORTANCE_HIGH
      visibility: 1,        // VISIBILITY_PUBLIC
      sound: 'medication_alarm.wav',
      vibration: true,
      lights: true,
      lightColor: '#DC2626',
    });
  } catch (err) {
    console.error('createChannel error:', err);
  }
}

/**
 * تابع کلی که همه مجوزها را یک‌جا مدیریت می‌کند
 * باید بعد از اولین تعامل کاربر صدا زده شود
 */
export async function initAllPermissions(): Promise<{
  notification: boolean;
}> {
  const notification = await requestNotificationPermission();
  await setupAndroidChannel();

  return { notification };
}
