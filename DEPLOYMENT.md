# MediReminder Production Deployment

## Web/PWA

```bash
npm ci
npm run typecheck
npm run build
```

Deploy the generated `dist/` directory with **HTTPS** enabled. Medication data stays in IndexedDB on the device.

After deploy, verify:
- Service Worker registers (`sw.js`)
- Notification permission prompt works
- Permissions banner appears when permission is not granted

## Android release

```bash
npm run build
npx cap sync android
npx cap open android
```

The repository workflow can build AAB/APK from a release tag (`v*`). Production signing secrets are mandatory:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Never use a temporary keystore for a public release.

### User settings (document in store listing / README)

For reliable background alerts on Android, ask users to:

1. Allow notifications  
2. Disable battery optimization for MediReminder  
3. Keep the medication alarm channel sound enabled  

The in-app **PermissionsBanner** reinforces this.

## Pre-release verification

- [ ] Install release APK on a physical device  
- [ ] Grant notification permission  
- [ ] Disable battery optimization  
- [ ] Short-interval test medication  
- [ ] Lock device → notification fires  
- [ ] Taken from notification → next timer starts  
- [ ] Dismiss without taken → follow-up returns  
- [ ] Kill/reopen app → pending dose retained  
- [ ] Backup export/import  
- [ ] Low-stock warning  
- [ ] Signed AAB/APK  

## Medical product note

MediReminder is a reminder/tracking utility, not a diagnostic or treatment system. Do not market it as a replacement for medical advice.
