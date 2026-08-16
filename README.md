# 💊 یادآور دارو

**نسخه ۱.۰.۱** — برنامه وب/اپلیکیشن هوشمند برای یادآوری و پیگیری مصرف دارو  
کار روی موبایل و دسکتاپ، با اولویت حریم خصوصی.

[![Build AAB & APK](https://github.com/Tahmoures54/MediReminder/actions/workflows/build-apk.yml/badge.svg)](https://github.com/Tahmoures54/MediReminder/actions/workflows/build-apk.yml)

---

## امکانات

| امکان | توضیح |
|--------|-------------|
| 📅 چند دارو همزمان | همه داروها در یک جا |
| ⏱️ تایمر شمارش معکوس | نمایش بصری برای هر دارو |
| 🔔 اعلان هوشمند و مکرر | زنگ و ویبره تا تأیید «مصرف کردم» |
| ⏰ به تعویق انداختن | ۱۰ یا ۳۰ دقیقه |
| 📦 پیگیری موجودی | هشدار موجودی کم |
| 💾 IndexedDB | کاملاً محلی و آفلاین |
| 📊 تاریخچه دوز | به‌موقع / زودتر / دیرتر |
| 🌙 رابط تیره | خوانا و مدرن |
| 📱 PWA + APK / AAB | نصب روی صفحه اصلی یا انتشار در بازار |

## سیستم اعلان

- **وب / PWA**: Service Worker یادآوری می‌فرستد تا تأیید مصرف.
- **اندروید (نیتیو)**: LocalNotifications با صدای آلارم و ویبره + دنباله یادآوری.
- **داخل اپ**: صدای بوق تکراری + ویبره تا زدن «مصرف کردم» یا اسنوز.
- رابط کاملاً فارسی.

> برای اعلان پس‌زمینه پایدار روی موبایل، به‌عنوان PWA نصب کنید یا APK/AAB بسازید.

---

## شروع سریع (توسعه)

```bash
npm install
npm run dev
```

ساخت نسخه تولید:

```bash
npm run build
npm run preview
```

### اندروید (محلی با Capacitor)

```bash
npm run build
npx cap add android   # فقط بار اول
npx cap sync android
npx cap open android
```

فایل صدا باید در این مسیر باشد:  
`src/main/res/raw/medication_alarm.wav`

---

## ساخت برای بازار (گوگل پلی)

با هر push به `main` یا اجرای دستی workflow، **AAB** و **APK** امضاشده ساخته می‌شوند.

### ۱. ساخت کی‌استور (یک‌بار)

```bash
keytool -genkey -v \
  -keystore medireminder-upload.jks \
  -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

### ۲. تبدیل به Base64 برای Secrets

```bash
base64 -w0 medireminder-upload.jks > keystore.b64
```

### ۳. اضافه کردن Secrets در گیت‌هاب

مسیر: **Repository → Settings → Secrets and variables → Actions**

| Secret | مقدار |
|--------|--------|
| `ANDROID_KEYSTORE_BASE64` | محتوای فایل `keystore.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | رمز keystore |
| `ANDROID_KEY_ALIAS` | مثلاً `upload` |
| `ANDROID_KEY_PASSWORD` | رمز کلید |

اگر Secrets تنظیم نشوند، یک keystore موقت ساخته می‌شود (فقط برای تست، **نه** برای آپلود در پلی).

### ۴. دانلود خروجی

بعد از اتمام workflow در **Actions**:

- `MediReminder-AAB-1.0.1` → فایل `.aab` برای آپلود در Google Play Console
- `MediReminder-APK-1.0.1` → فایل `.apk` برای نصب مستقیم روی دستگاه

### ۵. آپلود در Google Play

1. [Google Play Console](https://play.google.com/console) → ایجاد اپ (اگر هنوز نیست)
2. Production / Testing → Create new release
3. آپلود فایل **AAB**
4. versionName: `1.0.1` — versionCode: `2`

---

## نصب به‌عنوان اپ (بدون بازار)

**اندروید (Chrome)**  
منو ← افزودن به صفحه اصلی

**iOS (Safari)**  
اشتراک‌گذاری ← افزودن به صفحه اصلی

---

## فناوری

- React 19 + TypeScript + Vite
- Tailwind CSS 4
- IndexedDB
- Service Worker (اعلان PWA)
- Capacitor 8 (اعلان و ویبره نیتیو)

## حریم خصوصی

همه داده‌ها روی دستگاه می‌ماند. بدون حساب کاربری، بدون همگام‌سازی ابری، بدون ردیابی.

## نسخه

| فیلد | مقدار |
|------|--------|
| versionName | `1.0.1` |
| versionCode | `2` |

## مجوز

جزئیات مجوز در مخزن موجود است.
