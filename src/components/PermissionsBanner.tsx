import { Capacitor } from '@capacitor/core';

interface Props {
  permission: string;
  onRequest: () => void;
  onDismiss?: () => void;
}

/**
 * Reminds the user to grant notification (and related) settings
 * so background / repeating medication alerts can work reliably.
 */
export function PermissionsBanner({ permission, onRequest, onDismiss }: Props) {
  if (permission === 'granted') return null;

  const isNative = Capacitor.isNativePlatform();
  const isAndroid = Capacitor.getPlatform() === 'android';
  const denied = permission === 'denied';

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
              مجوز اعلان قبلاً رد شده است. لطفاً از تنظیمات سیستم، اعلان‌های «یادآور دارو» را فعال کنید؛ در غیر این
              صورت هشدار در پس‌زمینه کار نمی‌کند.
            </p>
          ) : (
            <p className="leading-relaxed text-amber-100/90">
              برای اینکه حتی وقتی برنامه بسته است هم زمان مصرف دارو به شما یادآوری شود، باید مجوز اعلان را بدهید.
            </p>
          )}

          <ul className="list-inside list-disc space-y-1 text-xs text-amber-100/80">
            <li>مجوز <strong>اعلان‌ها (Notifications)</strong> را فعال کنید</li>
            {isAndroid && (
              <>
                <li>
                  در تنظیمات باتری، <strong>بهینه‌سازی باتری</strong> را برای این برنامه خاموش کنید (بدون محدودیت)
                </li>
                <li>صدا و ویبره اعلان را در کانال «هشدار مصرف دارو» باز بگذارید</li>
              </>
            )}
            {!isNative && (
              <li>در مرورگر، اعلان را Allow کنید و در صورت امکان برنامه را به صفحه اصلی نصب (PWA) کنید</li>
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
            {denied && isNative && (
              <p className="text-xs text-amber-200/80">
                مسیر معمول اندروید: تنظیمات ← برنامه‌ها ← یادآور دارو ← اعلان‌ها
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
