# MediReminder Production Deployment

## Web/PWA

```bash
npm ci
npm run typecheck
npm run build
```

Deploy the generated `dist/` directory with HTTPS enabled. The application keeps medication data in IndexedDB.

## Android release

The repository workflow builds both AAB and APK from a release tag (`v*`). Production signing secrets are mandatory:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

The workflow intentionally fails if signing secrets are missing. Never use a temporary keystore for a public release.

## Pre-release verification

- Install a release APK on a physical Android device.
- Grant notification permission.
- Create a short interval test medication.
- Lock the device and verify the notification.
- Verify the reminder sequence and snooze behavior.
- Kill and reopen the app; verify pending-dose state is retained.
- Export and import a backup.
- Verify that taking a dose reduces stock exactly once.
- Verify low-stock warning.
- Verify AAB/APK signatures before publishing.

## Medical product note

MediReminder is a reminder/tracking utility, not a diagnostic or treatment system. Do not market it as a replacement for medical advice.
