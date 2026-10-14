# MediReminder — Final Release v3.4.1 — آماده انتشار

**تاریخ:** 2026-10-14
**وضعیت:** آماده برای انتشار مشروط به آزمون روی دستگاه واقعی؛ موفقیت CI به‌تنهایی تضمین‌کنندهٔ رفتار اعلان‌ها روی همهٔ گوشی‌ها نیست.

## اصلاحات قابلیت اطمینان نسخه 3.4.1

- بازآماده‌سازی صف اعلان‌های بومی هنگام فعال بودن برنامه و هنگام بازگشت به آن؛ صف Android محدود است و با بسته‌شدن اجباری برنامه نمی‌تواند توسط JavaScript دوباره پر شود.
- جلوگیری از اجرای عملیات «مصرف کردم/تعویق» برای چرخهٔ اعلان قدیمی.
- ذخیره‌سازی موفق داده پیش از تغییر وضعیت نمایشی؛ در صورت خطای ذخیره‌سازی امکان تلاش مجدد حفظ می‌شود.
- اگر بررسی مجوز آلارم دقیق در اندروید در دسترس نباشد یا خطا دهد، برنامه دیگر مجوز را به‌اشتباه تأییدشده فرض نمی‌کند.
- اضافه‌شدن آزمون‌های واحد برای حالت‌های مجوز آلارم دقیق.
- در GitHub Actions، فایل APK/AAB از فایل کلید امضا و اطلاعات محرمانه جداگانه منتشر می‌شود. کلید تولیدشده فقط در اجرای غیر PR به‌عنوان artifact جداگانه با مهلت ۹۰ روزه ذخیره می‌شود؛ آن را فوراً دانلود و در محل امن پشتیبان‌گیری کنید.

> **محدودیت مهم:** قبل از انتشار عمومی، هشدار زمان‌بندی‌شده، تکرار هشدار، تعویق، ثبت مصرف، خاموش/روشن شدن گوشی و تنظیمات باتری باید روی یک دستگاه واقعی Android آزمایش شوند. توقف اجباری برنامه توسط Android ممکن است اعلان‌ها را متوقف کند تا برنامه دوباره اجرا شود.

---

## مشکل گزارش‌شده

> «این برنامه خوبی است اما وقتی روی موبایل نصب می‌کنیم، رفتار درست و دقیق ندارد»

### ریشه‌یابی

1. **زمان‌بندی نادقیق در پس‌زمینه:** `setInterval` در WebView موبایل وقتی برنامه در پس‌زمینه است تا 1 دقیقه throttle می‌شود؛ وابستگی به tick برای دقت اشتباه بود.
2. **مجوزها:** درخواست خودکار مجوز اعلان در بوت، در iOS/Android WebView بلاک می‌شد؛ همچنین مجوز `SCHEDULE_EXACT_ALARM` و `USE_EXACT_ALARM` ناقص بود.
3. **PWA Manifest:** سایز آیکون‌ها `any` بود، `purpose` maskable اشتباه، `display_override` و `id` نداشت — نصب ناقص.
4. **Safe Area:** ناچ‌ها (notch) و gesture bar در موبایل‌های جدید محتوا را می‌پوشاند.
5. **Touch Targets:** دکمه‌ها کوچک‌تر از 44px، tap-highlight، double-tap zoom.
6. **Input Zoom:** در iOS، فوکوس روی input با فونت کمتر از 16px باعث زوم ناخواسته.
7. **Service Worker:** کش قدیمی v8، عدم مدیریت `controllerchange`، عدم بازگردانی follow-up پس از ریستارت SW.
8. **Android Permissions:** فقط 5 مجوز، بدون `FOREGROUND_SERVICE`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, `USE_FULL_SCREEN_INTENT`.
9. **Capacitor Config:** مینیمال، بدون `androidScheme`, `plugins` config, `StatusBar`.
10. **Back Button:** در اندروید، دکمه بازگشت مودال‌ها را نمی‌بست و برنامه را می‌بست.

---

## تغییرات اعمال‌شده برای انتشار نهایی

### 1. Core — دقت زمان‌بندی (مهم‌ترین)

- **Source of truth:** همچنان `nextDoseAt` (absolute ms) — هیچ وابستگی به tick.
- **Tick:** فقط نمایش‌دهنده، اما حالا در `visibilitychange` و `resume` فوراً overdue را چک می‌کند.
- **Capacitor App Listeners:** `appStateChange` و `resume` اضافه شد — در بازگشت به برنامه، `syncAllAlarms` + چک overdue.
- **Debounced Sync:** حداقل فاصله 1s بین syncها برای جلوگیری از spam، اما flush در resume.
- **SW v10:** `CACHE_NAME` به `v10-final`، لاگ‌ها، `claim()` فوری، بازگردانی follow-up با `startedAt`.

### 2. مجوزها — دقیق و کاربرمحور

- `initAllPermissions` دیگر درخواست خودکار نمی‌کند — فقط چک.
- `requestNotificationPermission` باید با gesture فراخوانی شود (کلیک کاربر) — در `PermissionsBanner`.
- `checkExactAlarmPermission` و `requestExactAlarmPermission` با guard برای عدم وجود API.
- `setupAndroidChannel` با importance 5، sound `medication_alarm.wav`, vibration, lights.
- بنر مجوز: توضیحات دقیق برای شیائومی/سامسونگ (قفل در Recent Apps + Autostart).

### 3. Android — انتشار نهایی

**`capacitor.config.ts`:**
- `server.androidScheme = https`, `allowNavigation` برای واتساپ
- `android.backgroundColor`, `ios.contentInset`
- `plugins.LocalNotifications`: smallIcon, iconColor, sound
- `plugins.SplashScreen` و `StatusBar`

**`src/main/AndroidManifest.xml` (merge):**
```xml
POST_NOTIFICATIONS, VIBRATE,
SCHEDULE_EXACT_ALARM, USE_EXACT_ALARM,
RECEIVE_BOOT_COMPLETED, WAKE_LOCK,
FOREGROUND_SERVICE, FOREGROUND_SERVICE_SPECIAL_USE,
REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
INTERNET, ACCESS_NETWORK_STATE,
USE_FULL_SCREEN_INTENT
```

**Workflow:**
- مجوزهای بیشتر، `hardwareAccelerated=true`
- `minifyEnabled true`, `shrinkResources true`
- نسخه نهایی: `MediReminder-3.4.1-final.apk/aab`
- `retention-days: 30`

### 4. PWA — نصب دقیق

**`index.html`:**
- viewport: `viewport-fit=cover, interactive-widget=resizes-content, maximum-scale=5.0`
- `color-scheme: dark`, `format-detection`, `HandheldFriendly`
- آیکون‌ها با سایز درست، `crossorigin`, preload
- theme-color، apple-mobile-web-app-*, `application-name`
- CSS inline برای safe area و dvh، جلوگیری از FOUC
- noscript fallback

**`manifest.json`:**
- `id: /`, `scope: /`, `start_url: /?source=pwa`
- `display_override: ["window-controls-overlay", "standalone", "browser"]`
- `orientation: any` (قبلاً portrait-primary که در تبلت مشکل داشت)
- آیکون‌ها: سایزهای واقعی 192/512/180، purpose any و maskable جدا
- `screenshots`, `shortcuts` (افزودن دارو)، `launch_handler`, `categories`

**`sw.js` v10:**
- کش: شامل icon-192/512
- fetch: network-first برای navigation، cache-first برای asset
- offline fallback با پیام فارسی
- follow-up با `startedAt`، لاگ، `periodicsync` listener

### 5. Mobile UX — نهایی

**`src/index.css`:**
- `--sat/sar/sab/sal` از `env(safe-area-inset-*)`
- `100dvh` و `100svh` fallback
- `-webkit-tap-highlight-color: transparent`, `touch-action: manipulation`
- `overscroll-behavior-y: none/contain` — جلوگیری از pull-to-refresh
- input: `font-size: 16px !important` — جلوگیری از زوم iOS
- button: `min-height: 44px`، `user-select: none`
- scrollbar نازک، custom-scrollbar با `-webkit-overflow-scrolling: touch`
- utilities: `pt-safe`, `pb-safe`, `min-h-screen-dvh`, `tap-target`, `gpu-accelerated`
- reduced-motion، high-contrast، print

**`src/main.tsx`:**
- `--vh` و `--dvh` محاسبه داینامیک، resize و orientationchange listener
- SW: unregister در dev، `controllerchange` reload، لاگ
- جلوگیری از double-tap zoom (به جز input)

**`src/App.tsx`:**
- Safe area spacer `h-[var(--sat)]`
- `min-h-[100dvh]` همه‌جا
- Capacitor App: `backButton` handling — اول مودال‌ها را می‌بندد، بعد exit
- `appStateChange` و `resume` با delay 300ms
- `clearNagTimer` با useCallback
- `resumeSyncTimeout` برای جلوگیری از race
- دکمه‌ها: `tap-target`, `touch-manipulation`, `active:scale`
- فرم: scroll to top در ویرایش، `animate-slide-in-from-top`
- فوتر: `pb-[calc(1rem+var(--sab))]`

**کامپوننت‌ها:**
- `AddMedicationForm`: inputMode numeric، pattern `[0-9]*`, `enterKeyHint`, `scrollIntoView` در focus، فونت 16px، tap-target، grid برای دوز و تعداد
- `MedicationCard`: tap-target برای آیکون‌ها، badge برای موجودی کم/تمام، `active:scale`, `touch-manipulation`, `aria-live`
- `NotificationPopup`: safe area padding با `var(--sal/sar)`, `max-h-[90dvh]`, scrollbar width handling، `tap-target` برای همه دکمه‌ها، متن "بعداً — یادآوری کن"
- `PermissionsBanner`: توضیحات شیائومی/سامسونگ، tap-target، بنر با `backdrop-blur`
- `BootScreen`: dvh، safe area، انیمیشن ping، متن "نسخه نهایی — بهینه برای موبایل"
- `ConfirmDialog` و `ReportModal`: safe area، scrollbar handling، tap-target، `max-h-[90dvh]`, `custom-scrollbar`
- `ErrorBoundary`: dvh، safe area، tap-target

### 6. صدا و ویبره — موبایل

**`audio.ts`:**
- `userGestureUnlocked` با listener روی touchstart/click
- silent buffer برای unlock
- `clearAudioResources` با try/catch، عدم بستن context اگر suspended
- `playAlarm`: resume با guard، fallback به haptics اگر AudioContext نباشد
- `triggerHaptics`: fallback به `navigator.vibrate` اگر native fail
- لاگ‌ها برای دیباگ

### 7. اعلان‌ها — دقیق

**`alarms.ts`:**
- `notifIdsFor`: stable range per med
- `cancelMedNotifications`: chunk 64 برای جلوگیری از ANR
- `syncWeb`: pending و overdue را با `now-1000` فوری trigger
- `syncNative`: smallIcon, iconColor, autoCancel, ongoing، body دقیق‌تر
- `createDebouncedSync`: minInterval 1s، reschedule اگر خیلی زود
- لاگ‌ها

### 8. Build — نهایی

**`vite.config.ts`:**
- server.host `0.0.0.0`, hmr clientPort 443 برای Arena
- build: `esbuild` minify، `cssMinify`, manualChunks (vendor, capacitor)
- fileNames با hash برای SW caching
- chunkSizeWarningLimit 600

**`package.json`:**
- version `3.4.1`
- اضافه: `@capacitor/app`, `@capacitor/status-bar`
- description: "Final release optimized for mobile"

**`constants.ts`:**
- `APP_VERSION 3.4.1`, `BUILD_DATE`, `IS_FINAL_RELEASE`

---

## تست‌های انجام‌شده

- `npm run typecheck` ✅
- `npm test` (12 تست) ✅
- `npm run build` ✅ — dist با chunks بهینه

---

## چک‌لیست انتشار نهایی

- [x] مجوزها: دقیق، با راهنمای باتری و آلارم دقیق
- [x] زمان‌بندی: absolute time، resume sync، SW follow-up
- [x] PWA: manifest درست، آیکون‌ها، SW v10
- [x] Mobile UX: safe area، 44px touch، 16px input، dvh، overscroll
- [x] Android: 12 مجوز، hardwareAccelerated، minify
- [x] صدا/ویبره: gesture unlock، fallback
- [x] Back button: بستن مودال‌ها اول
- [x] Build: chunk splitting، hash، production
- [x] تست: typecheck + unit

---

## نصب و انتشار

### PWA (موبایل مرورگر)
1. باز کردن سایت، Allow اعلان
2. منو → Add to Home Screen
3. مجوز آلارم دقیق (اندروید)

### Android APK/AAB
1. GitHub Actions → Build MediReminder Android APK — Final Release → Run workflow
2. دانلود `MediReminder-3.4.1-final.apk` (برای بازار/مایکت) و `aab` (برای Google Play)
3. نصب، مجوزها: اعلان، آلارم دقیق، باتری بدون محدودیت

---

## نکات برای کاربر نهایی

- برای دقت 100% در اندروید: تنظیمات → باتری → بدون محدودیت + قفل برنامه در Recent Apps
- در شیائومی: Security → Autostart → فعال
- صدای کانال "هشدار مصرف دارو" را قطع نکنید
- داده‌ها فقط روی دستگاه — پشتیبان JSON بگیرید

---

**آماده انتشار نهایی ✅**
