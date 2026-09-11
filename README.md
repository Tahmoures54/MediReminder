# MediReminder 3.3.1

**یادآور دارو** — Offline-first · هشدار تا تأیید مصرف · PWA + Android  
React 19 · TypeScript · Vite · Capacitor · IndexedDB

[![Live demo](https://img.shields.io/badge/demo-Vercel-black?style=flat-square)](https://medi-reminder-nu.vercel.app)

---

## امکانات اصلی

- زمان‌بندی مطلق (`nextDoseAt`)
- هشدار **تکرارشونده** تا «مصرف کردم» یا اسنوز
- پس از تأیید → **شروع فوری** تایمر دوز بعدی
- پشتیبان JSON (ورود با تأیید جایگزینی)، گزارش پایبندی، ویرایش دارو
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

`npm run check` شامل typecheck، تست واحد و بیلد است.

جزئیات فنی: [TECHNICAL_DOCS.md](./TECHNICAL_DOCS.md) · تاریخچه: [CHANGELOG.md](./CHANGELOG.md)

## ساخت APK در GitHub Actions

از بخش **Actions**، workflow با نام **Build MediReminder Android APK** را با گزینه **Run workflow** اجرا کنید؛ همچنین با push کردن یک tag مانند `v3.3.1` به‌صورت خودکار اجرا می‌شود.

خروجی artifact شامل این‌هاست:

- `MediReminder-<version>.apk` امضاشده برای نصب و مارکت‌هایی که APK می‌گیرند (بازار، مایکت، …)
- `MediReminder-<version>.aab` برای Google Play
- اگر secretهای امضا هنوز تنظیم نشده باشند، پوشهٔ `signing-key/` هم همراهش می‌آید: فایل `.jks` و `credentials.txt`

**این کلید را برای همیشه نگه دارید.** آپدیت بعدی در مارکت فقط با همین کلید پذیرفته می‌شود. بعد از اولین ساخت، این secretها را در Settings → Secrets بگذارید تا کلید جدید ساخته نشود: `ANDROID_KEYSTORE_BASE64`، `ANDROID_KEYSTORE_PASSWORD`، `ANDROID_KEY_ALIAS`، `ANDROID_KEY_PASSWORD`.

ساخت کلید به‌صورت محلی:

```bash
bash scripts/generate_upload_keystore.sh ./signing-key
```

## معماری کوتاه

| مفهوم | توضیح |
|-------|--------|
| Source of truth | `nextDoseAt` (ms epoch) |
| UI tick | فقط نمایش‌دهنده — مالک زمان‌بندی نیست و تیک ۱ثانیه‌ای persist نمی‌شود |
| Pending | تا «مصرف کردم» یا اسنوز، هشدار تکرار می‌شود |
| Storage | IndexedDB محلی — بدون سرور |

## License

MIT — ابزار یادآوری است، جایگزین پزشک نیست.
