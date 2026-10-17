import type { CapacitorConfig } from '@capacitor/cli';

/* ==========================================================================
 * Capacitor configuration — MediReminder (Android + iOS + PWA)
 *
 * This config drives the native shell that wraps the Vite-built web app.
 * It is consumed by `npx cap sync` to generate the Android Studio and
 * Xcode projects. Changes here require a re-sync before they take effect
 * in the native builds.
 *
 * Build-time invariant
 * ====================
 *   `appId` MUST match `ANDROID_APP_ID` in `src/utils/permissions.ts` and
 *   the `applicationId` in `android/app/build.gradle`. A mismatch breaks
 *   the SystemSettings plugin's intent routing (the settings activity
 *   cannot find the app) and silently fails the battery-optimization and
 *   exact-alarm permission flows.
 *
 * Security notes
 * ==============
 *   - `allowMixedContent: false` is deliberate. Mixed-content loading
 *     weakens HTTPS guarantees and is flagged by Play Protect.
 *   - `allowNavigation` is scoped to WhatsApp only. Adding broad patterns
 *     here would let arbitrary URLs load inside the WebView, bypassing the
 *     browser's phishing protections.
 * ========================================================================== */

/** MUST match `android/app/build.gradle` `applicationId` and `ANDROID_APP_ID` in permissions.ts. */
const APP_ID = 'com.tahmoures54.medireminder';

/** App display name (Persian — surfaces in the Android app drawer and iOS home screen). */
const APP_NAME = 'یادآور هوشمند دارو';

/** Build output directory. Must match `build.outDir` in `vite.config.ts`. */
const WEB_DIR = 'dist';

/** Dark slate background used by the native shell before the WebView paints. */
const SHELL_BACKGROUND_COLOR = '#0f172a';

/** Notification icon color (teal) — used by the status bar + heads-up icon. */
const NOTIFICATION_ICON_COLOR = '#0891b2';
/** Notification icon resource name (lives in `android/app/src/main/res/drawable-*`). */
const NOTIFICATION_SMALL_ICON = 'ic_stat_icon_config_sample';
/** Alarm sound file (lives in `android/app/src/main/res/raw/`). */
const NOTIFICATION_SOUND = 'medication_alarm.wav';

/** Splash screen visible duration (ms). Tuned to feel responsive without flicker. */
const SPLASH_DURATION_MS = 400;
/** Android splash resource name (lives in `res/drawable/splash.png`). */
const SPLASH_ANDROID_RESOURCE = 'splash';

const config: CapacitorConfig = {
  // Unique package for Cafe Bazaar / Play (previous id was already taken).
  // WARNING: changing this after publish means a new store listing — existing
  // users will not get the update as an upgrade.
  appId: APP_ID,
  appName: APP_NAME,
  webDir: WEB_DIR,

  // WebView origin + external navigation policy.
  server: {
    // Force HTTPS scheme so the WebView shares origin semantics with the PWA.
    // This is required for Service Worker registration inside the WebView.
    androidScheme: 'https',
    iosScheme: 'https',
    // Allow navigation ONLY to WhatsApp domains for the support deep-link.
    // Keep this list narrow — broad patterns let arbitrary URLs render inside
    // the app, bypassing browser phishing protections.
    allowNavigation: ['wa.me', '*.wa.me'],
  },

  android: {
    backgroundColor: SHELL_BACKGROUND_COLOR,
    // Block mixed-content (HTTPS page loading HTTP resources). Play Protect
    // flags this; keeping it off is both safer and required for store review.
    allowMixedContent: false,
  },

  ios: {
    backgroundColor: SHELL_BACKGROUND_COLOR,
    // 'always' insets content below the status bar so it is not occluded.
    contentInset: 'always',
    scrollEnabled: true,
  },

  plugins: {
    LocalNotifications: {
      smallIcon: NOTIFICATION_SMALL_ICON,
      iconColor: NOTIFICATION_ICON_COLOR,
      sound: NOTIFICATION_SOUND,
    },

    SplashScreen: {
      launchShowDuration: SPLASH_DURATION_MS,
      backgroundColor: SHELL_BACKGROUND_COLOR,
      showSpinner: false,
      androidSplashResourceName: SPLASH_ANDROID_RESOURCE,
      androidScaleType: 'CENTER_CROP',
    },

    StatusBar: {
      // Dark style = light icons on dark background (matches shell bg).
      style: 'DARK',
      backgroundColor: SHELL_BACKGROUND_COLOR,
      // Do not overlay the WebView under the status bar — the WebView's own
      // safe-area insets (env(safe-area-inset-top)) handle the gap.
      overlaysWebView: false,
    },
  },
};

export default config;
