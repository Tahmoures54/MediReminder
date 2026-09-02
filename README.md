# MediReminder 3.1.0

**یادآور دارو** — Offline-first · persistent alerts until dose confirmed  
React 19 · TypeScript · Vite · Capacitor · IndexedDB

[![Live demo](https://img.shields.io/badge/demo-Vercel-black?style=flat-square)](https://medi-reminder-nu.vercel.app)

## Highlights

- Absolute-time scheduling (`nextDoseAt`)
- Repeating alerts until **Taken** or **Snooze**
- Taken → next interval starts immediately
- Web SW + Android LocalNotifications
- In-app permission / battery guidance
- WhatsApp support: +98 916 068 4552
- Local-only data (no server)

## User setup (required for reliable alerts)

1. Allow **notifications**
2. Android: battery **unrestricted** for this app
3. Keep alarm channel sound on
4. iOS browser: limited background alerts — prefer Android APK when possible

## Develop

```bash
npm ci
npm run check
npm run dev
```

### Android

```bash
npm run build
npx cap sync android
npx cap open android
```

See [RELEASE.md](./RELEASE.md) and [DEPLOYMENT.md](./DEPLOYMENT.md).

## License

MIT. Reminder tool only — not medical advice.
