import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Unique package for Cafe Bazaar / Play (previous id was already taken)
  appId: 'com.tahmoures54.medireminder',
  appName: 'یادآور هوشمند دارو',
  webDir: 'dist',
  // Ensure the WebView uses the same origin as PWA for SW compatibility (web only)
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    // Allow navigation to support links (WhatsApp)
    allowNavigation: ['wa.me', '*.wa.me'],
  },
  android: {
    backgroundColor: '#0f172a',
    allowMixedContent: false,
  },
  ios: {
    backgroundColor: '#0f172a',
    contentInset: 'always',
    scrollEnabled: true,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#0891b2',
      sound: 'medication_alarm.wav',
    },
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#0f172a',
      showSpinner: false,
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0f172a',
      overlaysWebView: false,
    },
  },
};

export default config;
