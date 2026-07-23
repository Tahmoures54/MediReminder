# 💊 AI Medi Reminder

A smart medication reminder and tracker web application that works on mobile and desktop devices.

## Features

✅ **Add Multiple Medications** - Track all your medications in one place
📅 **Custom Intervals** - Set reminder intervals from 4 hours to 1 week or custom periods
⏱️ **Countdown Timers** - Visual countdown for each medication
🔔 **Alerts & Notifications** - Audio and browser notifications when it's time to take medicine
📦 **Stock Tracking** - Monitor remaining pills and get low stock alerts
💾 **Local Database** - All data stored locally on your device using IndexedDB
📱 **Mobile Friendly** - Responsive design optimized for mobile devices
🌙 **Dark Theme** - Easy on the eyes with modern dark UI
🔄 **Pause/Resume** - Control timers with pause and resume functionality
📊 **Progress Bars** - Visual progress indicators for each medication

## Database Storage

The application uses **IndexedDB**, a browser-based database that stores all data locally on the user's device:

- ✅ Data persists even after closing the browser
- ✅ Works offline - no internet connection required
- ✅ Data stays on your device - privacy-first approach
- ✅ Automatic sync when you return to the app
- ✅ Tracks elapsed time even when app is closed

### How It Works

1. **First Visit**: Creates a new IndexedDB database on your device
2. **Adding Medications**: All medication data is saved locally
3. **Timer Tracking**: Tracks elapsed time even when you close the browser
4. **Returning**: Automatically calculates time passed and updates timers
5. **Offline Support**: Works completely offline after first load

## Installation as Mobile App

This is a Progressive Web App (PWA) that can be installed on your mobile device:

### Android
1. Open the app in Chrome
2. Tap the menu (⋮) 
3. Select "Add to Home screen"
4. The app will appear as a native app icon

### iOS
1. Open the app in Safari
2. Tap the Share button
3. Select "Add to Home Screen"
4. The app will appear on your home screen

## How to Use

1. **Add Medication**: Click "Add Medication" button
2. **Fill Details**: Enter medication name, dosage, quantity, and interval
3. **Start Timer**: After taking a dose, tap the "▶ Start" button
4. **Get Alerts**: The app will alert you when it's time for the next dose
5. **Manage**: Pause, reset, or delete medications as needed

---

# 💊 یادآور هوشمند دارو

یک برنامه وب برای یادآوری و پیگیری مصرف دارو که روی موبایل و دسکتاپ کار می‌کند.

## امکانات

✅ **افزودن چند دارو** - همه داروهای خود را در یک جا پیگیری کنید
📅 **بازه‌های سفارشی** - تنظیم یادآوری از 4 ساعت تا 1 هفته یا دوره‌های سفارشی
⏱️ **تایمرهای معکوس** - شمارش معکوس بصری برای هر دارو
🔔 **هشدار و اعلان** - صدا و اعلان مرورگر زمان مصرف دارو
📦 **پیگیری موجودی** - مانیتورینگ قرص‌های باقیمانده و هشدار موجودی کم
💾 **دیتابیس محلی** - تمام داده‌ها به صورت محلی روی دستگاه شما ذخیره می‌شود
📱 **موبایل‌پسند** - طراحی واکنش‌گرا بهینه شده برای موبایل
🌙 **تم تیره** - رابط کاربری مدرن و آرامش‌بخش
🔄 **توقف/ادامه** - کنترل تایمرها با قابلیت توقف و ادامه
📊 **نوار پیشرفت** - نشانگرهای بصری پیشرفت برای هر دارو

## ذخیره‌سازی دیتابیس

این برنامه از **IndexedDB** استفاده می‌کند، یک دیتابیس مبتنی بر مرورگر که تمام داده‌ها را به صورت محلی روی دستگاه کاربر ذخیره می‌کند:

- ✅ داده‌ها حتی پس از بستن مرورگر باقی می‌مانند
- ✅ آفلاین کار می‌کند - نیاز به اینترنت ندارد
- ✅ داده‌ها روی دستگاه شما می‌ماند - حریم خصوصی اولویت است
- ✅ همگام‌سازی خودکار هنگام بازگشت به برنامه
- ✅ پیگیری زمان سپری شده حتی زمانی که برنامه بسته است

### نحوه کار

1. **اولین بازدید**: یک دیتابیس IndexedDB جدید روی دستگاه شما ایجاد می‌شود
2. **افزودن دارو**: تمام اطلاعات دارو به صورت محلی ذخیره می‌شود
3. **پیگیری تایمر**: زمان سپری شده را حتی هنگام بستن مرورگر پیگیری می‌کند
4. **بازگشت**: به طور خودکار زمان گذشته را محاسبه و تایمرها را به‌روزرسانی می‌کند
5. **پشتیبانی آفلاین**: پس از بارگذاری اول کاملاً آفلاین کار می‌کند

## نصب به عنوان اپلیکیشن موبایل

این یک Progressive Web App (PWA) است که می‌توان آن را روی دستگاه موبایل نصب کرد:

### اندروید
1. برنامه را در Chrome باز کنید
2. روی منو (⋮) ضربه بزنید
3. "Add to Home screen" را انتخاب کنید
4. برنامه به عنوان یک آیکون اپلیکیشن نیتیو ظاهر می‌شود

### iOS
1. برنامه را در Safari باز کنید
2. روی دکمه Share ضربه بزنید
3. "Add to Home Screen" را انتخاب کنید
4. برنامه روی صفحه اصلی شما ظاهر می‌شود

## نحوه استفاده

1. **افزودن دارو**: روی دکمه "Add Medication" کلیک کنید
2. **پر کردن جزئیات**: نام دارو، دوز، تعداد و بازه زمانی را وارد کنید
3. **شروع تایمر**: پس از مصرف دوز، روی دکمه "▶ Start" ضربه بزنید
4. **دریافت هشدار**: برنامه زمان دوز بعدی به شما هشدار می‌دهد
5. **مدیریت**: داروها را متوقف، ریست یا حذف کنید
