# 💊 یادآور دارو · MediReminder

A smart, offline-first medication reminder and tracker (PWA + Capacitor).

یک برنامه وب/اپلیکیشن هوشمند برای یادآوری و پیگیری مصرف دارو — کار روی موبایل و دسکتاپ، با اولویت حریم خصوصی.

---

## ✨ Features / امکانات

| Feature | Description |
|--------|-------------|
| 📅 Multiple medications | Track all your meds in one place |
| ⏱️ Countdown timers | Visual countdown per medication |
| 🔔 **Smart notifications** | Browser + native alarms with **Taken / Snooze / Dismiss** actions |
| ⏰ **Snooze** | Postpone reminder by 10 or 30 minutes |
| 🔁 Follow-up alerts | Repeats until you confirm or dismiss |
| 📦 Stock tracking | Low-stock alerts |
| 💾 IndexedDB | Fully local, works offline |
| 📊 Dose history | On-time / early / late tracking |
| 🌙 Dark UI | Modern, readable interface |
| 📱 PWA + APK | Installable on home screen or build with Capacitor |

---

## 🔔 Notification system (production)

- **Web / PWA**: Service Worker schedules alarms, shows rich notifications with actions, and runs follow-ups every ~1 minute until confirmed.
- **Native (Android)**: Capacitor `LocalNotifications` + high-importance channel with sound & vibration.
- **In-app popup**: Bilingual (FA/EN), accessible dialog with Taken / Snooze / Dismiss.
- **Permission UX**: Clear bilingual banner; guidance when permission was previously denied.

> **Tip:** For the most reliable background alarms on mobile, install as PWA or use the Android APK build.

---

## 🚀 Quick start

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

### Android (Capacitor)

```bash
npm run build
npx cap sync android
npx cap open android
```

Ensure `medication_alarm.wav` is present under  
`android/app/src/main/res/raw/` for native alarm sound.

---

## 📱 Install as app

**Android (Chrome)**  
Menu → Add to Home screen

**iOS (Safari)**  
Share → Add to Home Screen

---

## 🛠 Stack

- React 19 + TypeScript + Vite
- Tailwind CSS 4
- IndexedDB (local persistence)
- Service Worker (PWA alarms)
- Capacitor 8 (Android local notifications, haptics)

---

## 📄 Privacy

All data stays on the device. No accounts, no cloud sync, no tracking.

---

## License

See repository for license details.
