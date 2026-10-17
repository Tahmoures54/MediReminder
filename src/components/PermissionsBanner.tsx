import { Capacitor } from '@capacitor/core';
import type { AppNotificationPermission } from '../utils/permissions';

export type PermissionState = AppNotificationPermission;

interface Props {
  permission: PermissionState;
  exactAlarmGranted?: boolean;
  batteryOptimizationIgnored?: boolean;
  onRequest: () => void;
  onRequestExactAlarm?: () => void;
  onOpenBatterySettings?: () => void;
  onOpenAppSettings?: () => void;
  onDismiss?: () => void;
}

// iPadOS 13+ reports "MacIntel" with touch points — include it in iOS detection.
function detectIsIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (Capacitor.isNativePlatform()) return Capacitor.getPlatform() === 'ios';
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  // navigator.platform is deprecated but the only reliable iPadOS 13+ signal.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export function PermissionsBanner({
  permission,
  exactAlarmGranted = true,
  batteryOptimizationIgnored = true,
  onRequest,
  onRequestExactAlarm,
  onOpenBatterySettings,
  onOpenAppSettings,
  onDismiss,
}: Props) {
  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();
  const isAndroid = platform === 'android';
  const isIOS = detectIsIOS();

  const denied = permission === 'denied';
  const granted = permission === 'granted';
  const exactAlarmMissing = isAndroid && exactAlarmGranted === false;
  const batteryNeedsHelp = isAndroid && !batteryOptimizationIgnored;

  // All clear on the permission front.
  if (granted && !exactAlarmMissing && !batteryNeedsHelp) return null;

  // Battery-only guidance. Show it even without an openBatterySettings callback
  // — the manual instructions are still useful.
  if (granted && !exactAlarmMissing && batteryNeedsHelp) {
    return (
      <div
        role="status"
        aria-label="راهنمای باتری"
        className="mt-3 rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-cyan-500/10 via-slate-900/40 to-slate-950/40 px-3.5 py-3 text-xs text-cyan-50/90"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="leading-relaxed">
            برای کارکرد پایدار در پس‌زمینه: باتری اپ را روی{' '}
            <strong className="text-cyan-100">بدون محدودیت</strong> بگذارید
            <span className="text-cyan-200/70">
              {' '}(شیائومی/سامسونگ: قفل در Recent + Autostart)
            </span>
          </p>
          <div className="flex gap-2">
            {onOpenBatterySettings && (
              <button
                type="button"
                onClick={onOpenBatterySettings}
                className="tap-target rounded-lg bg-cyan-400/90 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-300 active:scale-[0.97]"
              >
                🔋 تنظیم باتری
              </button>
            )}
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="tap-target rounded-lg border border-cyan-500/30 px-3 py-2 text-xs text-cyan-100/70 hover:bg-cyan-500/10"
              >
                بستن
              </button>
            )}
          </div>
        </div>
        {!onOpenBatterySettings && (
          <p className="mt-2 rounded-lg bg-cyan-950/40 p-2 text-[11px] leading-relaxed text-cyan-200/80">
            📱 مسیر دستی: تنظیمات → برنامه‌ها → یادآور دارو → باتری → «بدون محدودیت»
          </p>
        )}
      </div>
    );
  }

  // Main permission / exact-alarm / mixed guidance.
  const needsNotificationAction = !granted && !denied;

  return (
    <div
      role="status"
      aria-label="راهنمای تنظیمات اعلان"
      className="mt-4 rounded-3xl border border-amber-500/35 bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-slate-950/40 p-4 text-sm text-amber-50 shadow-lg shadow-amber-950/20 ring-1 ring-amber-400/10 backdrop-blur-sm animate-slide-in-from-top"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none" aria-hidden="true">
          🔔
        </span>
        <div className="flex-1 space-y-2.5">
          <h3 className="text-[15px] font-bold text-amber-200">
            {denied
              ? 'اعلان‌ها مسدود شده — برای یادآوری دارو فعالشان کنید'
              : exactAlarmMissing
                ? 'آلارم دقیق فعال نیست — برای دقت ثانیه‌ای لازم است'
                : 'برای یادآوری دقیق و مطمئن، تنظیمات لازم است'}
          </h3>

          {denied ? (
            <p className="text-[13px] leading-relaxed text-amber-100/90">
              مجوز اعلان قبلاً رد شده است. برای کارکرد دقیق در پس‌زمینه، از تنظیمات سیستم اعلان‌های «یادآور دارو» را
              فعال کنید.
            </p>
          ) : granted ? (
            <p className="text-[13px] leading-relaxed text-amber-100/90">
              مجوز اعلان‌ها داده شده است؛ فقط چند تنظیم دیگر اندروید برای دقت آلارم باقی مانده.
            </p>
          ) : (
            <p className="text-[13px] leading-relaxed text-amber-100/90">
              برای یادآوری حتی وقتی برنامه بسته است یا گوشی قفل است، مجوز اعلان را بدهید. این برای دقت نهایی ضروری است.
            </p>
          )}

          <ul className="list-inside list-disc space-y-1.5 text-xs leading-relaxed text-amber-100/80 marker:text-amber-300">
            {!granted && (
              <li>
                مجوز <strong className="text-amber-100">اعلان‌ها</strong> را فعال کنید
              </li>
            )}
            {isAndroid && (
              <>
                {exactAlarmMissing && (
                  <li className="text-rose-200">
                    مجوز <strong>آلارم دقیق</strong> را در تنظیمات اندروید فعال کنید (برای دقت ثانیه‌ای)
                  </li>
                )}
                {batteryNeedsHelp && (
                  <li>
                    باتری را روی <strong className="text-amber-100">بدون محدودیت</strong> بگذارید — تنظیمات → باتری →
                    عدم بهینه‌سازی
                  </li>
                )}
                <li>صدا و ویبره کانال «هشدار مصرف دارو» را باز بگذارید</li>
                <li className="text-[11px] text-amber-200/70">
                  در شیائومی/سامسونگ: قفل برنامه در Recent Apps + Autostart را فعال کنید
                </li>
              </>
            )}
            {!isNative && !isIOS && (
              <li>در مرورگر Allow بزنید و برنامه را به صفحه اصلی نصب کنید (PWA) برای بهترین دقت</li>
            )}
            {isIOS && (
              <li className="text-amber-200/90">
                در iOS، اعلان پس‌زمینه مرورگر محدود است؛ برای دقت کامل از نسخه اندروید استفاده کنید یا برنامه را باز نگه
                دارید
              </li>
            )}
          </ul>

          <div className="flex flex-wrap gap-2 pt-2">
            {needsNotificationAction && (
              <button
                type="button"
                onClick={onRequest}
                className="tap-target rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-slate-950 shadow-md transition hover:bg-amber-300 active:scale-[0.96] touch-manipulation"
              >
                ✅ فعال‌سازی اعلان‌ها
              </button>
            )}
            {exactAlarmMissing && onRequestExactAlarm && (
              <button
                type="button"
                onClick={onRequestExactAlarm}
                className="tap-target rounded-xl bg-rose-400 px-5 py-3 text-sm font-bold text-slate-950 shadow-md transition hover:bg-rose-300 active:scale-[0.96] touch-manipulation"
              >
                ⏰ فعال‌سازی آلارم دقیق
              </button>
            )}
            {batteryNeedsHelp && onOpenBatterySettings && (
              <button
                type="button"
                onClick={onOpenBatterySettings}
                className="tap-target rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 shadow-md transition hover:bg-cyan-300 active:scale-[0.96] touch-manipulation"
              >
                🔋 بدون محدودیت باتری
              </button>
            )}
            {denied && isNative && onOpenAppSettings && (
              <button
                type="button"
                onClick={onOpenAppSettings}
                className="tap-target rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-slate-950 shadow-md transition hover:bg-amber-300 active:scale-[0.96] touch-manipulation"
              >
                ⚙️ باز کردن تنظیمات اپ
              </button>
            )}
            {denied && isNative && !onOpenAppSettings && (
              <p className="w-full rounded-lg bg-amber-950/40 p-2.5 text-xs leading-relaxed text-amber-200/80">
                {isAndroid
                  ? '📱 اندروید: تنظیمات → برنامه‌ها → یادآور دارو → اعلان‌ها → اجازه دادن'
                  : '📱 iOS: تنظیمات → اعلان‌ها → یادآور دارو → اجازه دادن'}
              </p>
            )}
            {denied && !isNative && (
              <p className="w-full rounded-lg bg-amber-950/40 p-2.5 text-xs leading-relaxed text-amber-200/80">
                {isIOS
                  ? '📱 iOS: تنظیمات → اعلان‌ها → یادآور دارو → اجازه دادن'
                  : '🌐 در مرورگر، روی آیکون قفل کنار آدرس بزنید → تنظیمات سایت → اعلان‌ها → Allow'}
              </p>
            )}
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="tap-target rounded-xl border border-amber-500/30 bg-transparent px-4 py-2.5 text-xs font-medium text-amber-200/70 transition hover:bg-amber-500/10 hover:text-amber-200 active:scale-95 touch-manipulation"
              >
                بعداً یادآوری کن
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
