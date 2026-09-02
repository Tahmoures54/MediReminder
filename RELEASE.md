# MediReminder 3.1.0 — Production release

## What shipped

Hardened offline medication reminder for broad distribution:

- Long native follow-up window (~6h) + foreground resync
- Debounced notification scheduling
- Clearer UI labels and empty-stock warning
- Permission / iOS guidance
- WhatsApp support button
- CI version 3.1.0

## Publisher checklist

### Build

```bash
npm ci && npm run check
npm run build
npx cap sync android
```

Tag: `v3.1.0` (triggers signed AAB/APK when secrets are set).

Secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

### Device QA (must pass)

- [ ] Notification permission granted
- [ ] Android battery unrestricted
- [ ] Due alert with screen locked
- [ ] Taken from notification → next timer
- [ ] Dismiss → follow-up returns
- [ ] Kill process → pending restored
- [ ] Edit / backup / WhatsApp support
- [ ] Low / empty stock UI

### Store listing notes

- Explain notification + battery setup
- Disclaimer: not a medical device / not a substitute for a clinician
- Privacy: data stays on device

### Support

WhatsApp: +989160684552

## Known platform limits

- iOS Safari / PWA: weak background notification reliability
- Some OEMs still kill background work without unrestricted battery
- Web requires granted notification permission and a living service worker
