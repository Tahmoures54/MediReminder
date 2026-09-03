# MediReminder 3.2.0

**یادآور دارو** — Offline-first · هشدار تا تأیید مصرف · PWA + Android  
React 19 · TypeScript · Vite · Capacitor · IndexedDB

[![Live demo](https://img.shields.io/badge/demo-Vercel-black?style=flat-square)](https://medi-reminder-nu.vercel.app)

---

## امکانات اصلی

- زمان‌بندی مطلق (`nextDoseAt`)
- هشدار **تکرارشونده** تا «مصرف کردم» یا اسنوز
- پس از تأیید → **شروع فوری** تایمر دوز بعدی
- پشتیبان JSON، گزارش پایبندی، ویرایش دارو
- راهنمای مجوز اعلان + پشتیبانی واتساپ
- داده فقط روی دستگاه کاربر

## تنظیمات ضروری کاربر

1. مجوز **اعلان**  
2. اندروید: باتری → **بدون محدودیت**  
3. صدای اعلان را قطع نکنید  

## توسعه

```bash
npm ci
npm run check
npm run dev
npx cap sync android
```

جزئیات انتشار: [RELEASE.md](./RELEASE.md) · فنی: [TECHNICAL_DOCS.md](./TECHNICAL_DOCS.md)

## ساخت APK در GitHub Actions

از بخش **Actions**، workflow با نام **Build MediReminder Android APK** را با گزینه **Run workflow** اجرا کنید؛ همچنین با push کردن یک tag مانند `v3.2.0` به‌صورت خودکار اجرا می‌شود.

- بدون تنظیم secret، یک APK قابل نصب debug در artifact خروجی قرار می‌گیرد.
- برای APK release و AAB امضاشده، این secretها را در تنظیمات repository بسازید: `ANDROID_KEYSTORE_BASE64`، `ANDROID_KEYSTORE_PASSWORD`، `ANDROID_KEY_ALIAS` و `ANDROID_KEY_PASSWORD`.

## License

MIT — ابزار یادآوری است، جایگزین پزشک نیست.
