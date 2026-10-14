// src/utils/permissions.ts — Robust mobile permission + reliability helpers
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export const NOTIFICATION_CHANNEL_ID = 'medication-alarms';
/** Must match capacitor.config.ts appId (Android applicationId). */
export const ANDROID_APP_ID = 'com.tahmoures54.medireminder';

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

  if (Notification.permission === 'default') {
    return 'prompt';
  }

  return Notification.permission as AppNotificationPermission;
}

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
    const maybe = LocalNotifications as unknown as {
      checkExactNotificationSetting?: () => Promise<{ exact_alarm: string }>;
    };
    if (typeof maybe.checkExactNotificationSetting !== 'function') {
      // Fail closed: never report exact alarms as permitted when the native
      // bridge cannot verify the Android setting.
      console.warn('[Perm] checkExactNotificationSetting not available');
      return false;
    }
    const status = await maybe.checkExactNotificationSetting();
    const granted = status.exact_alarm === 'granted';
    console.info('[Perm] exact alarm check:', granted);
    return granted;
  } catch (error) {
    console.warn('[Perm] exact alarm check error:', error);
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
      await openAndroidAppSettings();
      return false;
    }

    await maybe.changeExactNotificationSetting();
    await new Promise((r) => setTimeout(r, 600));
    const granted = await checkExactAlarmPermission();
    console.info('[Perm] exact alarm after request:', granted);
    return granted;
  } catch (error) {
    console.warn('[Perm] exact alarm request error:', error);
    return false;
  }
}

async function openExternalUrl(url: string): Promise<boolean> {
  // Android intent:/package: — WebView hands these to the system activity resolver
  if (url.startsWith('intent:') || url.startsWith('package:')) {
    try {
      window.location.assign(url);
      return true;
    } catch {
      /* try anchor fallback */
    }
    try {
      const a = document.createElement('a');
      a.href = url;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return true;
    } catch {
      /* fall through */
    }
  }

  // Legacy App.openUrl (removed from typings in Capacitor 8, may exist at runtime)
  try {
    const { App } = await import('@capacitor/app');
    const maybe = App as unknown as { openUrl?: (o: { url: string }) => Promise<void> };
    if (typeof maybe.openUrl === 'function') {
      await maybe.openUrl({ url });
      return true;
    }
  } catch {
    /* ignore */
  }

  try {
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  } catch (e) {
    console.warn('[Perm] openExternalUrl failed', e);
    return false;
  }
}

export async function openAndroidAppSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;

  // App info is the most reliable OEM-agnostic screen (battery / notifications live here).
  const candidates = [
    `intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;data=package:${ANDROID_APP_ID};end`,
    `package:${ANDROID_APP_ID}`,
    `intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;scheme=package;S.android.intent.extra.PACKAGE_NAME=${ANDROID_APP_ID};end`,
  ];

  for (const url of candidates) {
    if (await openExternalUrl(url)) {
      console.info('[Perm] opened app settings via', url.slice(0, 72));
      return;
    }
  }
}

export async function openBatteryOptimizationSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;

  const urls = [
    // Direct exemption dialog (AOSP / many stock ROMs)
    `intent:#Intent;action=android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS;data=package:${ANDROID_APP_ID};end`,
    // Full system list of battery-optimized apps
    `intent:#Intent;action=android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS;end`,
    // Always-available fallback: App info → Battery
    `intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;data=package:${ANDROID_APP_ID};end`,
    `package:${ANDROID_APP_ID}`,
  ];

  for (const url of urls) {
    if (await openExternalUrl(url)) {
      console.info('[Perm] battery settings intent dispatched');
      return;
    }
  }
}

export async function setupAndroidChannel(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;

  try {
    await LocalNotifications.createChannel({
      id: NOTIFICATION_CHANNEL_ID,
      name: 'هشدار مصرف دارو',
      description: 'یادآوری مکرر زمان مصرف دارو تا تأیید کاربر — با صدای بلند و ویبره',
      importance: 5,
      visibility: 1,
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

export async function initAllPermissions(): Promise<{ notification: boolean; checked: boolean }> {
  try {
    const permission = await checkNotificationPermission();
    console.info('[Perm] boot check:', permission);

    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      await setupAndroidChannel();
    }

    return { notification: permission === 'granted', checked: true };
  } catch (e) {
    console.warn('[Perm] init error:', e);
    return { notification: false, checked: false };
  }
}

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
