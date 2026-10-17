/**
 * App identity and user-facing constants.
 *
 * - APP_VERSION must stay in sync with package.json. A unit test
 *   (`constants.test.ts`) enforces this; if you remove the test,
 *   remember that drift will silently show a wrong version in the UI.
 * - BUILD_DATE is injected at build time. Do NOT hardcode a release date
 *   here: rebuilds after the date pass will show a stale value.
 * - SUPPORT_WHATSAPP must be digits only (no '+', no leading zero) for
 *   wa.me. A runtime guard catches accidental edits.
 */

// Vite injects these in vite.config.ts `define`. Fallbacks keep the module
// importable from non-Vite contexts (tests, node scripts).
export const APP_VERSION = (import.meta.env?.VITE_APP_VERSION as string | undefined) ?? '0.0.0';

/** ISO 8601 with time — safe to `new Date()` without timezone drift. */
export const BUILD_DATE = (import.meta.env?.VITE_BUILD_DATE as string | undefined) ?? '1970-01-01T00:00:00Z';

/** Channel drives features that must not ship to end users. */
export const BUILD_CHANNEL: 'dev' | 'beta' | 'final' =
  (import.meta.env?.VITE_RELEASE_CHANNEL as 'dev' | 'beta' | 'final' | undefined) ?? 'dev';

/** In-app re-alert while a dose is still pending and the popup was dismissed. */
export const IN_APP_NAG_MS = 45_000;

/**
 * sessionStorage key for dismissing the permissions banner.
 * Scoped by major version so a permission-related update re-shows the banner.
 */
export const PERM_DISMISS_KEY = `medireminder-perm-banner-dismissed-v${APP_VERSION.split('.')[0]}`;

/** Iran country code (98) + mobile number, digits only — required by wa.me. */
export const SUPPORT_WHATSAPP = '989160684552';

if (!/^\d{10,15}$/.test(SUPPORT_WHATSAPP)) {
  throw new Error(`Invalid SUPPORT_WHATSAPP: ${SUPPORT_WHATSAPP} (must be digits only, E.164 without '+')`);
}

export const SUPPORT_WHATSAPP_URL = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(
  'سلام، درباره برنامه یادآور هوشمند دارو نیاز به پشتیبانی دارم.'
)}`;

/** Quantity at or below this is "low stock"; 0 is "out of stock". Must be >= 1. */
export const LOW_STOCK_THRESHOLD = 5;
