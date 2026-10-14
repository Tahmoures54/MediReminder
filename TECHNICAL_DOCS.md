# Technical docs — MediReminder

Offline-first medication reminder. React + Capacitor + IndexedDB.

## Layout (src)

```
src/
  App.tsx
  components/               # UI cards, forms, banners, modals
  db/database.ts            # IndexedDB medications + appState
  hooks/
  utils/
    alarms.ts               # SW + LocalNotifications bridge
    permissions.ts          # notification / exact alarm / battery helpers
    audio.ts
    medication.ts
    ids.ts
    time.ts
    cn.ts
  constants.ts
```

## Alarms

- Web: service worker messages
- Android: Capacitor LocalNotifications with `allowWhileIdle`
- Follow-ups every ~9 minutes while dose is pending
- `medStagger` spreads concurrent meds to avoid Doze collisions

## Permissions (Android)

- POST_NOTIFICATIONS
- USE_EXACT_ALARM / SCHEDULE_EXACT_ALARM
- Battery unrestricted CTA in PermissionsBanner

## Build

```bash
npm run check
npx cap sync android
```

GitHub Actions produces signed APK/AAB for store upload.
