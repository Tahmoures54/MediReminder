// src/utils/permissions.ts — Final release: robust mobile permission handling
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
 * بررسی وضعیت فعلی مجوز اعلان — بدون درخواست
 * Safe to call on boot, no prompt triggered
 */
export async function checkNotificationPermission(): Promise<AppNotificationPermission> {
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await LocalNotifications.checkPermissions();
      return normalizePermission(result.display);
    } catch (error) {
      console.error('[Perm] check native:', error);
      return 'unavailable';
    }
  }

  if (typeof window === 'undefined' || !window.isSecureContext || !('Notification' in window)) {
    return 'unavailable';
  }

  // Web: Notification.permission is sync
  if (Notification.permission === 'default') {
    return 'prompt';
  }

  return Notification.permission as AppNotificationPermission;
}

/**
 * درخواست مجوز اعلان — باید با user gesture فراخوانی شود در موبایل
 * @returns وضعیت نهایی مجوز پس از درخواست
 */
export async function requestNotificationPermission(): Promise<AppNotificationPermission> {
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await LocalNotifications.requestPermissions();
      const normalized = normalizePermission(result.display);
      console.info('[Perm] native request result:', normalized);
      return normalized;
    } catch (error) {
      console.error('[Perm] request native error:', error);
      return 'unavailable';
    }
  }

  if (typeof window === 'undefined' || !window.isSecureContext || !('Notification' in window)) {
    return 'unavailable';
  }

  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';

  try {
    const result = await Notification.requestPermission();
    console.info('[Perm] web request result:', result);
    return result === 'granted' ? 'granted' : 'denied';
  } catch (e) {
    console.warn('[Perm] web request failed:', e);
    return 'denied';
  }
}

export async function checkExactAlarmPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return true;

  try {
    // Plugin method may not exist on older versions — guard
    const maybe = LocalNotifications as unknown as {
      checkExactNotificationSetting?: () => Promise<{ exact_alarm: string }>;
    };
    if (typeof maybe.checkExactNotificationSetting !== 'function') {
      console.warn('[Perm] checkExactNotificationSetting not available');
      return true; // assume granted if API missing (older Android)
    }
    const status = await maybe.checkExactNotificationSetting();
    const granted = status.exact_alarm === 'granted';
    console.info('[Perm] exact alarm check:', granted);
    return granted;
  } catch (error) {
    console.warn('[Perm] exact alarm check error:', error);
    // On error, assume not granted to show banner, but don't block
    return false;
  }
}

export async function requestExactAlarmPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return true;

  try {
    if (await checkExactAlarmPermission()) return true;

    const maybe = LocalNotifications as unknown as {
      changeExactNotificationSetting?: () => Promise<void>;
    };
    if (typeof maybe.changeExactNotificationSetting !== 'function') {
      console.warn('[Perm] changeExactNotificationSetting not available');
      return false;
    }

    await maybe.changeExactNotificationSetting();
    // Re-check after user returns from settings
    // Small delay to allow system to update
    await new Promise((r) => setTimeout(r, 500));
    const granted = await checkExactAlarmPermission();
    console.info('[Perm] exact alarm after request:', granted);
    return granted;
  } catch (error) {
    console.warn('[Perm] exact alarm request error:', error);
    return false;
  }
}

/**
 * ساخت کانال اعلان اندروید با صدا و ویبره قوی
 * Must be called after permission granted, but safe to call anytime on Android
 */
export async function setupAndroidChannel(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;

  try {
    // Delete old channel if exists to update sound/vibration? Plugin handles upsert
    await LocalNotifications.createChannel({
      id: NOTIFICATION_CHANNEL_ID,
      name: 'هشدار مصرف دارو',
      description: 'یادآوری مکرر زمان مصرف دارو تا تأیید کاربر — با صدای بلند و ویبره',
      importance: 5, // Max importance
      visibility: 1, // Public
      sound: 'medication_alarm.wav',
      vibration: true,
      lights: true,
      lightColor: '#DC2626',
    });
    console.info('[Perm] Android channel created/updated');
  } catch (error) {
    console.warn('[Perm] create channel failed (may already exist):', error);
  }
}

/**
 * راه‌اندازی مجوزها در بوت — فقط چک، بدون درخواست خودکار
 * درخواست باید با کلیک کاربر انجام شود تا در iOS/Android WebView بلاک نشود
 */
export async function initAllPermissions(): Promise<{ notification: boolean; checked: boolean }> {
  try {
    const permission = await checkNotificationPermission();
    console.info('[Perm] boot check:', permission);

    // ساخت کانال برای اندروید در هر صورت (حتی اگر مجوز رد شده باشد، ممکن است بعداً اعطا شود)
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      await setupAndroidChannel();
    }

    return { notification: permission === 'granted', checked: true };
  } catch (e) {
    console.warn('[Perm] init error:', e);
    return { notification: false, checked: false };
  }
}

/**
 * درخواست کامل با UX مناسب موبایل — باید از handler کلیک فراخوانی شود
 */
export async function requestAllPermissionsWithUX(): Promise<{
  notification: AppNotificationPermission;
  exactAlarm: boolean;
}> {
  const notification = await requestNotificationPermission();
  let exactAlarm = true;

  if (notification === 'granted' && Capacitor.isNativePlatform()) {
    await setupAndroidChannel();
    exactAlarm = await requestExactAlarmPermission();
  }

  return { notification, exactAlarm };
}
