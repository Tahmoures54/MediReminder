# MediReminder 2.2.0

**یادآور دارو** — Offline-first medication reminder & dose tracker  
Built with React 19 · TypeScript · Vite · Capacitor · IndexedDB

[![Live demo](https://img.shields.io/badge/demo-Vercel-black?style=flat-square)](https://medi-reminder-nu.vercel.app)

---

## Features / امکانات

| Feature | Description |
|--------|-------------|
| 📅 Multi-med | Unlimited medications in one place |
| ⏱️ Absolute-time scheduling | `nextDoseAt` is the source of truth (not UI timers) |
| 🔔 **Persistent repeating alerts** | Keep notifying until the patient confirms the dose |
| ✅ Confirm → next timer | «مصرف کردم» stops nags and **immediately starts** the next interval |
| ⏰ Snooze | 10 or 30 minutes |
| ✏️ Edit | Change name, dose, quantity, interval anytime |
| 📦 Low-stock | Visual warning when quantity ≤ 5 |
| 📊 History | On-time / early / late with adherence score |
| 💾 Backup | JSON export & restore, no server |
| 🌙 Dark UI | Modern, readable, reduced-motion friendly |
| 📱 PWA + APK | Install as PWA or build with Capacitor |

## Alert policy / سیاست هشدار

1. When a dose is due → in-app alarm + system notification.
2. Until the patient taps **«مصرف کردم»** or **Snooze**, reminders **repeat**:
   - Web/PWA: ~every 45 seconds (Service Worker)
   - Android APK: ~every 2 minutes (LocalNotifications)
3. **«بعداً»** only closes the banner — it does **not** stop reminders.
4. After **«مصرف کردم»** the next-interval timer starts immediately.

## Important / مهم

MediReminder is a **reminder and tracking tool**.  
It does **not** diagnose, prescribe, or replace a physician or pharmacist.

داده‌های دارو فقط روی دستگاه شما ذخیره می‌شوند و به هیچ سروری ارسال نمی‌شوند.

---

## Quick start

```bash
npm ci
npm run typecheck
npm run dev          # http://localhost:5173
npm run build        # production build
```

### Android

```bash
npx cap sync android
npx cap open android
```

Release builds **require** a production keystore (see `DEPLOYMENT.md` and CI workflow).

For reliable background alerts on Android, grant notification permission and disable battery optimization for the app when possible.

---

## Architecture highlights

- **Absolute time**: schedule lives in `nextDoseAt` (ms epoch).
- **Dose lifecycle**: `scheduled → due (pendingDose) → taken | snoozed`.
- **Web**: Service Worker stores alarms, shows notifications, and runs follow-ups until confirmed.
- **Native**: Capacitor LocalNotifications with action buttons; pending doses get a burst of follow-up schedules.
- **Storage**: IndexedDB (`MedicationReminderDB`), schema version 4, JSON backup/restore.

---

## Project structure

```
src/
├── components/
├── db/
├── utils/          # audio, permissions, alarms (SW + native bridge)
├── App.tsx
└── main.tsx
public/
├── sw.js           # PWA service worker + repeating alarms
└── manifest.json
```

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for 2.2.0 and earlier notes.

## License

MIT — see [LICENSE](./LICENSE).
