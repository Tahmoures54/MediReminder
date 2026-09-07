import { Capacitor } from '@capacitor/core';
import type { AppNotificationPermission } from '../utils/permissions';

export type PermissionState = AppNotificationPermission;

interface Props {
  permission: PermissionState;
  exactAlarmGranted?: boolean;
  onRequest: () => void;
  onRequestExactAlarm?: () => void;
  onDismiss?: () => void;
}

export function PermissionsBanner({ permission, exactAlarmGranted = true, onRequest, onRequestExactAlarm, onDismiss }: Props) {
  if (permission === 'granted' && exactAlarmGranted) return null;

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
      className="mt-3 rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-500/15 to-orange-500/10 p-4 text-sm text-amber-50 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden="true">
          🔔
        </span>
        <div className="flex-1 space-y-2">
          <h3 className="font-bold text-amber-200">برای یادآوری مطمئن، تنظیمات لازم است</h3>

          {denied ? (
            <p className="leading-relaxed text-amber-100/90">
              مجوز اعلان قبلاً رد شده است. از تنظیمات سیستم، اعلان‌های «یادآور دارو» را فعال کنید؛ وگرنه هشدار
              پس‌زمینه کار نمی‌کند.
            </p>
          ) : (
            <p className="leading-relaxed text-amber-100/90">
              برای یادآوری حتی وقتی برنامه بسته است، مجوز اعلان را بدهید.
            </p>
          )}

          <ul className="list-inside list-disc space-y-1 text-xs text-amber-100/80">
            <li>
              مجوز <strong>اعلان‌ها</strong> را فعال کنید
            </li>
            {isAndroid && (
              <>
                {exactAlarmMissing && <li>مجوز <strong>آلارم دقیق</strong> را در تنظیمات اندروید فعال کنید</li>}
                <li>
                  باتری را روی <strong>بدون محدودیت</strong> بگذارید (عدم بهینه‌سازی)
                </li>
                <li>صدا و ویبره کانال «هشدار مصرف دارو» را باز بگذارید</li>
              </>
            )}
            {!isNative && !isIOS && (
              <li>در مرورگر Allow بزنید و ترجیحاً برنامه را به صفحه اصلی نصب (PWA) کنید</li>
            )}
            {isIOS && (
              <li className="text-amber-200/90">
                در iOS، اعلان پس‌زمینه مرورگر محدود است؛ برای بهترین نتیجه از نسخه اندروید یا باز نگه داشتن
                برنامه استفاده کنید
              </li>
            )}
          </ul>

          <div className="flex flex-wrap gap-2 pt-1">
            {!denied && (
              <button
                type="button"
                onClick={onRequest}
                className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-gray-950 shadow-md transition hover:bg-amber-300 active:scale-95"
              >
                فعال‌سازی اعلان‌ها
              </button>
            )}
            {exactAlarmMissing && onRequestExactAlarm && (
              <button
                type="button"
                onClick={onRequestExactAlarm}
                className="rounded-xl bg-red-400 px-4 py-2.5 text-sm font-bold text-gray-950 shadow-md transition hover:bg-red-300 active:scale-95"
              >
                فعال‌سازی آلارم دقیق
              </button>
            )}
            {denied && isNative && (
              <p className="text-xs text-amber-200/80">
                {isAndroid
                  ? 'اندروید: تنظیمات ← برنامه‌ها ← یادآور دارو ← اعلان‌ها'
                  : 'iOS: تنظیمات ← اعلان‌ها ← یادآور دارو'}
              </p>
            )}
            {denied && !isNative && (
              <p className="text-xs text-amber-200/80">
                در مرورگر، تنظیمات سایت را باز کرده و مجوز اعلان را ریست کنید.
              </p>
            )}
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-xl border border-amber-500/30 bg-transparent px-3 py-2 text-xs text-amber-200/70 hover:bg-amber-500/10"
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
