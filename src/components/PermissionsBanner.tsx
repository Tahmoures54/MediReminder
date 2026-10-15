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

export function PermissionsBanner({
  permission,
  exactAlarmGranted = true,
  batteryOptimizationIgnored = false,
  onRequest,
  onRequestExactAlarm,
  onOpenBatterySettings,
  onOpenAppSettings,
  onDismiss,
}: Props) {
  if (permission === 'granted' && exactAlarmGranted && batteryOptimizationIgnored) return null;
  if (permission === 'granted' && exactAlarmGranted && !onOpenBatterySettings) return null;
  if (permission === 'granted' && exactAlarmGranted) {
    return (
      <div
        role="region"
        aria-label="راهنمای باتری"
        className="mt-3 rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-cyan-500/10 via-slate-900/40 to-slate-950/40 px-3.5 py-3 text-xs text-cyan-50/90"
      >
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <p className="leading-relaxed">
            برای کارکرد پایدار در پس‌زمینه: باتری اپ را روی{' '}
            <strong className="text-cyan-100">بدون محدودیت</strong> بگذارید
            {Capacitor.getPlatform() === 'android' && (
              <span className="text-cyan-200/70"> (شیائومی/سامسونگ: قفل در Recent + Autostart)</span>
            )}
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
      </div>
    );
  }

  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();
  const isAndroid = platform === 'android';
  const isIOS =
    platform === 'ios' ||
    (!isNative &&
      typeof navigator !== 'undefined' &&
      /iPad|iPhone|iPod/.test(navigator.userAgent));
  const denied = permission === 'denied';
  const exactAlarmMissing = isAndroid && exactAlarmGranted === false;

  return (
    <div
      role="region"
      aria-label="راهنمای تنظیمات اعلان"
      className="mt-4 rounded-3xl border border-amber-500/35 bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-slate-950/40 p-4 text-sm text-amber-50 shadow-lg shadow-amber-950/20 ring-1 ring-amber-400/10 backdrop-blur-sm animate-slide-in-from-top"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none" aria-hidden="true">
          🔔
        </span>
        <div className="flex-1 space-y-2.5">
          <h3 className="font-bold text-amber-200 text-[15px]">برای یادآوری دقیق و مطمئن، تنظیمات لازم است</h3>

          {denied ? (
            <p className="leading-relaxed text-amber-100/90 text-[13px]">
              مجوز اعلان قبلاً رد شده است. برای کارکرد دقیق در پس‌زمینه، از تنظیمات سیستم اعلان‌های «یادآور دارو» را
              فعال کنید.
            </p>
          ) : (
            <p className="leading-relaxed text-amber-100/90 text-[13px]">
              برای یادآوری حتی وقتی برنامه بسته است یا گوشی قفل است، مجوز اعلان را بدهید. این برای دقت نهایی ضروری است.
            </p>
          )}

          <ul className="list-inside list-disc space-y-1.5 text-xs leading-relaxed text-amber-100/80 marker:text-amber-300">
            <li>
              مجوز <strong className="text-amber-100">اعلان‌ها</strong> را فعال کنید
            </li>
            {isAndroid && (
              <>
                {exactAlarmMissing && (
                  <li className="text-rose-200">
                    مجوز <strong>آلارم دقیق</strong> را در تنظیمات اندروید فعال کنید (برای دقت ثانیه‌ای)
                  </li>
                )}
                {!batteryOptimizationIgnored && (
                  <li>
                    باتری را روی <strong className="text-amber-100">بدون محدودیت</strong> بگذارید — تنظیمات → باتری → عدم
                    بهینه‌سازی
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
            {!denied && (
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
            {isAndroid && !batteryOptimizationIgnored && onOpenBatterySettings && (
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
                className="tap-target rounded-xl border border-amber-400/40 bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/25 active:scale-[0.96]"
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
                🌐 در مرورگر، روی آیکون قفل کنار آدرس بزنید → تنظیمات سایت → اعلان‌ها → Allow
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
