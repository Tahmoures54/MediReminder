/** App identity and user-facing constants. Keep in sync with package.json. */
export const APP_VERSION = '3.4.1';

/** In-app re-alert while a dose is still pending and the popup was dismissed. */
export const IN_APP_NAG_MS = 45_000;

export const PERM_DISMISS_KEY = 'medireminder-perm-banner-dismissed';

export const SUPPORT_WHATSAPP = '989160684552';

export const SUPPORT_WHATSAPP_URL = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(
  'سلام، درباره MediReminder نیاز به پشتیبانی دارم.'
)}`;

export const LOW_STOCK_THRESHOLD = 5;

/** Final release: build info */
export const BUILD_DATE = '2026-09-21';
export const IS_FINAL_RELEASE = true;
