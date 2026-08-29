# MediReminder 2.1.0

**یادآور دارو** — Offline-first medication reminder & dose tracker  
Built with React 19 · TypeScript · Vite · Capacitor · IndexedDB

[![Live demo](https://img.shields.io/badge/demo-Vercel-black?style=flat-square)](https://medi-reminder-nu.vercel.app)

---

## Features / امکانات

| Feature | Description |
|--------|-------------|
| 📅 Multi-med | Unlimited medications in one place |
| ⏱️ Absolute-time scheduling | `nextDoseAt` is the source of truth (not UI timers) |
| 🔔 Persistent alarms | Survive app restarts; native Android LocalNotifications |
| ⏰ Snooze | 10 or 30 minutes from the alarm dialog |
| ✏️ Edit | Change name, dose, quantity, interval anytime |
| 📦 Low-stock | Visual warning when quantity ≤ 5 |
| 📊 History | On-time / early / late with adherence score |
| 💾 Backup | JSON export & restore, no server |
| 🌙 Dark UI | Modern, readable, reduced-motion friendly |
| 📱 PWA + APK | Install as PWA or build with Capacitor |

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

---

## Architecture highlights

- **Absolute time**: schedule lives in `nextDoseAt` (ms epoch). The 1-second UI tick only reflects it.
- **Dose lifecycle**: `scheduled → due (pendingDose) → taken | snoozed`.
- **Native sync**: Android notifications are cancelled/rescheduled only when the schedule identity changes.
- **Web / PWA**: Service Worker handles periodic reminders while the page is closed.
- **Storage**: IndexedDB (`MedicationReminderDB`), schema version 4, with JSON backup/restore.

---

## Project structure

```
src/
├── components/     # MedicationCard, AddMedicationForm, NotificationPopup, ReportModal, ConfirmDialog
├── db/             # IndexedDB wrapper + types
├── utils/          # audio (alarm), permissions, cn
├── App.tsx         # Main app logic & scheduling
└── main.tsx        # Bootstrap + Service Worker registration
public/
├── sw.js           # PWA service worker + alarm helpers
└── manifest.json
```

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Production build (single-file capable) |
| `npm run check` | typecheck + build |
| `npm run preview` | Preview production build |

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for 2.1.0 and earlier notes.

## License

MIT — see [LICENSE](./LICENSE).
