# MediReminder 3.0.0

**یادآور دارو** — Offline-first medication reminder & dose tracker  
Built with React 19 · TypeScript · Vite · Capacitor · IndexedDB

[![Live demo](https://img.shields.io/badge/demo-Vercel-black?style=flat-square)](https://medi-reminder-nu.vercel.app)

---

## Features / امکانات

| Feature | Description |
|--------|-------------|
| 📅 Multi-med | Unlimited medications in one place |
| ⏱️ Absolute-time scheduling | `nextDoseAt` is the source of truth |
| 🔔 **Persistent repeating alerts** | Keep notifying until the patient confirms |
| ✅ Confirm → next timer | «مصرف کردم» stops nags and starts the next interval |
| ⏰ Snooze | 10 or 30 minutes |
| ⚙️ **Setup guidance** | In-app reminder to enable notifications & battery settings |
| ✏️ Edit | Name, dose, quantity, interval |
| 📦 Low-stock | Warning when quantity ≤ 5 |
| 📊 History | On-time / early / late + adherence |
| 💾 Backup | JSON export & restore |
| 📱 PWA + APK | Install as PWA or Capacitor Android |

## First-run setup (مهم برای کاربر)

1. **مجوز اعلان** را بدهید (دکمه «فعال‌سازی اعلان‌ها» داخل برنامه).
2. **اندروید:** تنظیمات ← برنامه‌ها ← یادآور دارو ← باتری ← بدون محدودیت / عدم بهینه‌سازی.
3. صدای اعلان و ویبره را خاموش نکنید.
4. در وب: اعلان مرورگر را Allow کنید؛ در صورت امکان PWA را نصب کنید.

بدون این تنظیمات، هشدار در پس‌زمینه ممکن است از دست برود.

## Alert policy

1. Dose due → in-app alarm + system notification  
2. Until **Taken** or **Snooze** → reminders repeat (Web ~45s / Android ~2min)  
3. **Dismiss** does not stop reminders  
4. **Taken** → next interval timer starts immediately  

## Quick start

```bash
npm ci
npm run typecheck
npm run build
npm run dev
```

### Android

```bash
npx cap sync android
npx cap open android
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) and [RELEASE.md](./RELEASE.md).

## License

MIT — see [LICENSE](./LICENSE).

MediReminder is a reminder tool only — not medical advice.
