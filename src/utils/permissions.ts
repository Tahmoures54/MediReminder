/* ==========================================================================
 * permissions.ts — mobile permission + reliability helpers
 *
 * Three layers of permission are required for medication reminders to fire
 * on time on Android:
 *
 *   1. POST_NOTIFICATIONS (Android 13+) — display notifications at all.
 *   2. USE_EXACT_ALARM / SCHEDULE_EXACT_ALARM (Android 12+) — fire alarms
 *      at an exact time instead of being batched into Doze windows.
 *   3. Battery-optimization exemption — prevent Doze from killing the
 *      alarm-firing process between scheduled fires.
 *
 * Design rules
 * ============
 *   - Fail closed: when the native bridge cannot CONFIRM a permission is
 *     granted, return the "not granted" answer. A false negative (treating
 *     "unknown" as "denied") prompts the user to re-grant, which is
 *     annoying but safe. A false positive (treating "unknown" as "granted")
 *     silently breaks reminder timing — unsafe for a medication app.
 *   - Platform gating: only Android is subject to the exact-alarm and
 *     battery checks. Web and iOS short-circuit to "ok" because they do
 *     not have the same Doze / exact-alarm split.
 *   - Lazy plugin registration: `SystemSettings` is registered lazily so
 *     browser-only tests and non-Android builds do not require the native
 *     bridge to be present.
 *
 * All public functions are async and never throw — they return a fail-
 * closed result instead. Callers can `await` them without try/catch.
 * ========================================================================== */

import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

/* ==========================================================================
 * Constants
 * ========================================================================== */

/** Notification channel id used by all medication reminders. */
export const NOTIFICATION_CHANNEL_ID = 'medication-alarms';

/** Must match capacitor.config.ts appId (Android applicationId). */
export const ANDROID_APP_ID = 'com.tahmoures54.medireminder';

/** Delay (ms) after `changeExactNotificationSetting` returns before re-checking.
 *  Gives the Android settings activity time to commit the user's choice. */
const EXACT_ALARM_RECHECK_DELAY_MS = 600;

/** Android notification importance: 5 = HIGH (heads-up + sound). */
const ANDROID_IMPORTANCE_HIGH = 5;
/** Android notification visibility: 1 = PUBLIC (shown on lock screen). */
const ANDROID_VISIBILITY_PUBLIC = 1;

/* ==========================================================================
 * Types
 * ========================================================================== */

export type AppNotificationPermission =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'prompt-with-rationale'
  | 'unavailable';

/** Shape of the optional exact-alarm probe on LocalNotifications. */
interface ExactAlarmProbe {
  checkExactNotificationSetting?: () => Promise<{ exact_alarm?: string }>;
}

/** Shape of the optional exact-alarm setter on LocalNotifications. */
interface ExactAlarmSetter {
  changeExactNotificationSetting?: () => Promise<void>;
}

/** Shape of the SystemSettings plugin (registered lazily). */
interface SystemSettingsPlugin {
  checkBatteryOptimization(): Promise<{ ignoringBatteryOptimizations: boolean }>;
  openBatterySettings(): Promise<{ opened: boolean; screen?: string }>;
  openAppSettings(): Promise<{ opened: boolean }>;
}

/* ==========================================================================
 * Pure helpers
 * ========================================================================== */

/**
 * Coerces a raw permission string into the canonical AppNotificationPermission
 * union. Unknown / missing values become 'unavailable' so downstream code
 * can treat anything it does not recognize as a fail-closed state.
 */
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

/** Returns true only when running on native Android. */
function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/** Returns true when running on any native platform (Android or iOS). */
function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/* ==========================================================================
 * Notification permission (POST_NOTIFICATIONS on Android 13+, Notification API on web)
 * ========================================================================== */

/**
 * Checks whether the app may display notifications.
 *
 * Native: queries `LocalNotifications.checkPermissions()`.
 * Web:    queries the browser `Notification.permission` API.
 *
 * Returns 'unavailable' for any failure mode (no Notification API on web,
 * non-secure context, native bridge error). Never throws.
 */
export async function checkNotificationPermission(): Promise<AppNotificationPermission> {
  if (isNative()) {
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

/**
 * Requests notification permission from the user.
 *
 * Native: calls `LocalNotifications.requestPermissions()`.
 * Web:    calls `Notification.requestPermission()`.
 *
 * Returns 'granted' or 'denied' on web (the browser API has only two
 * post-request states); on native, returns the full union. Never throws.
 */
export async function requestNotificationPermission(): Promise<AppNotificationPermission> {
  if (isNative()) {
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

/* ==========================================================================
 * Exact-alarm permission (Android 12+)
 * ========================================================================== */

/**
 * Checks whether the user has granted the exact-alarm permission.
 *
 * Returns `true` ONLY when ALL of the following hold:
 *   - Running on native Android (other platforms short-circuit to `true`).
 *   - The `checkExactNotificationSetting` bridge method is available.
 *   - The bridge call resolves without throwing.
 *   - The response object has `exact_alarm === 'granted'`.
 *
 * Every other case returns `false` (fail-closed). Never throws.
 *
 * Why fail-closed: a false positive here means the app schedules alarms
 * assuming exact timing, but Android silently batches them into Doze
 * windows — reminders fire hours late. For a medication reminder, that
 * is a safety-critical bug.
 */
export async function checkExactAlarmPermission(): Promise<boolean> {
  if (!isAndroidNative()) return true;

  try {
    const maybe = LocalNotifications as unknown as ExactAlarmProbe;
    if (typeof maybe.checkExactNotificationSetting !== 'function') {
      // Fail closed: never report exact alarms as permitted when the native
      // bridge cannot verify the Android setting.
      console.warn('[Perm] checkExactNotificationSetting not available');
      return false;
    }
    const status = await maybe.checkExactNotificationSetting();
    // Defensive: the bridge may return null/undefined on some OEM webviews.
    const granted = status?.exact_alarm === 'granted';
    console.info('[Perm] exact alarm check:', granted);
    return granted;
  } catch (error) {
    console.warn('[Perm] exact alarm check error:', error);
    return false;
  }
}

/**
 * Requests the exact-alarm permission by opening the Android settings
 * activity. If the `changeExactNotificationSetting` bridge method is not
 * available, falls back to opening the app's settings page.
 *
 * Returns the result of a follow-up `checkExactAlarmPermission()` call
 * after giving the OS a short delay to commit the user's choice. Never
 * throws.
 */
export async function requestExactAlarmPermission(): Promise<boolean> {
  if (!isAndroidNative()) return true;

  try {
    if (await checkExactAlarmPermission()) return true;

    const maybe = LocalNotifications as unknown as ExactAlarmSetter;
    if (typeof maybe.changeExactNotificationSetting !== 'function') {
      console.warn('[Perm] changeExactNotificationSetting not available');
      await openAndroidAppSettings();
      return false;
    }

    await maybe.changeExactNotificationSetting();
    await new Promise((r) => setTimeout(r, EXACT_ALARM_RECHECK_DELAY_MS));
    const granted = await checkExactAlarmPermission();
    console.info('[Perm] exact alarm after request:', granted);
    return granted;
  } catch (error) {
    console.warn('[Perm] exact alarm request error:', error);
    return false;
  }
}

/* ==========================================================================
 * SystemSettings plugin (lazy registration)
 * ========================================================================== */

/**
 * Lazily registers the SystemSettings plugin. Deferring registration means
 * browser-only tests and non-Android builds do not need the native bridge
 * to be present at module load time.
 */
function getSystemSettings(): SystemSettingsPlugin {
  return registerPlugin<SystemSettingsPlugin>('SystemSettings');
}

/**
 * Opens the Android app settings activity. Throws if the activity fails
 * to open (so the caller can surface a fallback message).
 */
export async function openAndroidAppSettings(): Promise<void> {
  if (!isAndroidNative()) return;

  try {
    const result = await getSystemSettings().openAppSettings();
    if (!result.opened) throw new Error('Android settings activity did not open');
  } catch (error) {
    console.error('[Perm] native app settings failed:', error);
    throw error;
  }
}

/**
 * Checks whether the app is exempt from battery optimization (Doze).
 *
 * Returns `true` on non-Android platforms (no Doze concept). Returns
 * `false` if the Android bridge cannot confirm the state — fail-closed
 * so the in-app guidance stays visible. Never throws.
 */
export async function checkBatteryOptimizationExemption(): Promise<boolean> {
  if (!isAndroidNative()) return true;

  try {
    const result = await getSystemSettings().checkBatteryOptimization();
    return result.ignoringBatteryOptimizations === true;
  } catch (error) {
    // Fail closed: if Android cannot confirm the state, keep the guidance visible.
    console.warn('[Perm] battery optimization check failed:', error);
    return false;
  }
}

/**
 * Opens the Android battery-optimization settings activity. Throws if
 * the activity fails to open.
 */
export async function openBatteryOptimizationSettings(): Promise<void> {
  if (!isAndroidNative()) return;

  try {
    const result = await getSystemSettings().openBatterySettings();
    if (!result.opened) throw new Error('Android battery settings activity did not open');
    console.info('[Perm] native battery settings opened:', result.screen ?? 'unknown');
  } catch (error) {
    console.error('[Perm] native battery settings failed:', error);
    throw error;
  }
}

/* ==========================================================================
 * Android notification channel setup
 * ========================================================================== */

/**
 * Creates (or updates) the medication-alarms notification channel on
 * Android with high importance, sound, vibration, and lights. Safe to
 * call repeatedly — Android treats `createChannel` as upsert.
 *
 * No-op on non-Android platforms. Never throws — a channel-creation
 * failure is logged but does not block the rest of the permission flow
 * (the channel may already exist from a previous install).
 */
export async function setupAndroidChannel(): Promise<void> {
  if (!isAndroidNative()) return;

  try {
    await LocalNotifications.createChannel({
      id: NOTIFICATION_CHANNEL_ID,
      name: 'هشدار مصرف دارو',
      description: 'یادآوری مکرر زمان مصرف دارو تا تأیید کاربر — با صدای بلند و ویبره',
      importance: ANDROID_IMPORTANCE_HIGH,
      visibility: ANDROID_VISIBILITY_PUBLIC,
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

/* ==========================================================================
 * Aggregators
 * ========================================================================== */

/** Result of the boot-time permission initialization. */
export interface InitPermissionsResult {
  /** Whether the notification permission is currently granted. */
  notification: boolean;
  /** Whether the boot check completed without an unexpected error. */
  checked: boolean;
}

/**
 * Boot-time permission check. Does NOT prompt the user — only inspects the
 * current state and ensures the Android notification channel exists.
 *
 * Returns `{ notification: false, checked: false }` on any unexpected
 * error so the UI can show a "please retry" message. Never throws.
 */
export async function initAllPermissions(): Promise<InitPermissionsResult> {
  try {
    const permission = await checkNotificationPermission();
    console.info('[Perm] boot check:', permission);

    if (isAndroidNative()) {
      await setupAndroidChannel();
    }

    return { notification: permission === 'granted', checked: true };
  } catch (e) {
    console.warn('[Perm] init error:', e);
    return { notification: false, checked: false };
  }
}

/** Result of the user-facing permission request flow. */
export interface RequestAllPermissionsResult {
  notification: AppNotificationPermission;
  exactAlarm: boolean;
}

/**
 * Runs the full user-facing permission request flow:
 *   1. Request notification permission (prompts the user).
 *   2. If granted AND on native, ensure the Android channel exists.
 *   3. If granted AND on native, request the exact-alarm permission.
 *
 * The exact-alarm step is only attempted after notifications are granted
 * — opening the exact-alarm settings before notifications are granted
 * would confuse the user (they would see two unrelated permission prompts).
 *
 * Never throws.
 */
export async function requestAllPermissionsWithUX(): Promise<RequestAllPermissionsResult> {
  const notification = await requestNotificationPermission();
  let exactAlarm = true;

  if (notification === 'granted' && isNative()) {
    await setupAndroidChannel();
    exactAlarm = await requestExactAlarmPermission();
  }

  return { notification, exactAlarm };
}
