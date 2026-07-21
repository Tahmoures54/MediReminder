# ✨ Features Overview - مرور ویژگی‌ها

## Complete Feature List / لیست کامل ویژگی‌ها

---

## 💊 Medication Management / مدیریت دارو

### ➕ Add Medications / افزودن دارو

**What you can do / کارهایی که می‌توانید انجام دهید:**
- Add unlimited medications / داروهای نامحدود اضافه کنید
- Set custom names / نام‌های سفارشی تنظیم کنید
- Define dosage amounts / مقادیر دوز تعریف کنید
- Track pill quantities / تعداد قرص‌ها را پیگیری کنید
- Set reminder intervals / بازه‌های یادآوری تنظیم کنید

**Supported Intervals / بازه‌های پشتیبانی شده:**
- ⏰ 4 hours / 4 ساعت
- ⏰ 6 hours / 6 ساعت  
- ⏰ 8 hours / 8 ساعت
- ⏰ 12 hours / 12 ساعت
- ⏰ 24 hours (daily) / 24 ساعت (روزانه)
- ⏰ 48 hours / 48 ساعت
- ⏰ 72 hours / 72 ساعت
- ⏰ 168 hours (weekly) / 168 ساعت (هفتگی)
- ⏰ Custom hours / ساعات سفارشی

---

## ⏱️ Smart Timers / تایمرهای هوشمند

### Countdown System / سیستم شمارش معکوس

**Features / ویژگی‌ها:**
- ⏳ Real-time countdown / شمارش معکوس لحظه‌ای
- ⏸️ Pause/Resume capability / قابلیت توقف/ادامه
- ↺ Reset to full interval / ریست به بازه کامل
- 📊 Visual progress bar / نوار پیشرفت بصری
- 🔵 Color-coded status / وضعیت کدگذاری شده با رنگ
  - Cyan: Running / در حال اجرا
  - Gray: Paused / متوقف شده

**Display Format / فرمت نمایش:**
```
HH:MM:SS
23:45:12 → 23 hours, 45 minutes, 12 seconds
```

---

## 🔔 Alert System / سیستم هشدار

### Multi-Channel Notifications / اعلان‌های چند کاناله

**1. Audio Alerts / هشدارهای صوتی**
- 🔊 Automatic beeping sound / صدای بوق خودکار
- 🎵 5-beep pattern / الگوی 5 بوقی
- 🔇 Can be muted by clicking OK / با کلیک روی OK می‌توان خاموش کرد

**2. Visual Popups / پاپ‌آپ‌های بصری**
- 🎨 Large, attention-grabbing design / طراحی بزرگ و جلب توجه
- 📝 Shows medication name & dosage / نام دارو و دوز را نشان می‌دهد
- ⚡ Bounce animation / انیمیشن پرش
- 🎯 Clear call-to-action buttons / دکمه‌های فراخوان واضح

**3. Browser Notifications / اعلان‌های مرورگر**
- 📱 Native system notifications / اعلان‌های بومی سیستم
- 🔔 Even when tab is in background / حتی زمانی که تب در پس‌زمینه است
- 🖥️ Desktop & mobile support / پشتیبانی دسکتاپ و موبایل

**Alert Triggers / محرک‌های هشدار:**
- ⏰ When timer reaches 00:00:00 / وقتی تایمر به 00:00:00 برسد
- 💊 Low stock warning (≤5 pills) / هشدار موجودی کم (≤5 قرص)

---

## 📦 Inventory Tracking / پیگیری موجودی

### Quantity Management / مدیریت تعداد

**Automatic Tracking / پیگیری خودکار:**
- ➖ Deduct 1 pill when timer starts / 1 قرص هنگام شروع تایمر کسر می‌شود
- 📊 Display remaining quantity / نمایش تعداد باقیمانده
- ⚠️ Low stock alert at 5 pills / هشدار موجودی کم در 5 قرص
- 📈 Visual quantity display / نمایش بصری تعداد

**Stock Alerts / هشدارهای موجودی:**
```
"Only 3 pills left of Aspirin.
Please refill soon."
```

---

## 💾 Local Database / دیتابیس محلی

### IndexedDB Storage / ذخیره‌سازی IndexedDB

**What Gets Stored / چه چیزی ذخیره می‌شود:**
- 📝 Medication information / اطلاعات دارو
  - Name / نام
  - Dosage / دوز
  - Quantity / تعداد
  - Interval / بازه
  
- ⏱️ Timer states / حالت‌های تایمر
  - Remaining time / زمان باقیمانده
  - Running status / وضعیت اجرا
  
- 🕐 Time tracking / پیگیری زمان
  - Last saved timestamp / آخرین زمان ذخیره شده
  - Elapsed time calculation / محاسبه زمان سپری شده

**Privacy Features / ویژگی‌های حریم خصوصی:**
- ✅ 100% local storage / 100% ذخیره‌سازی محلی
- ✅ No cloud upload / آپلود ابری نمی‌شود
- ✅ No server communication / ارتباط سروری ندارد
- ✅ No tracking / ردیابی ندارد
- ✅ Works completely offline / کاملاً آفلاین کار می‌کند

---

## 🔄 Persistent Timers / تایمرهای پایدار

### Time Tracking Across Sessions / پیگیری زمان در جلسات

**Smart Time Management / مدیریت هوشمند زمان:**

1. **When You Close the App / وقتی برنامه را می‌بندید:**
   - Saves current timestamp / زمان فعلی را ذخیره می‌کند
   - Stores all timer states / تمام حالت‌های تایمر را ذخیره می‌کند
   - Preserves running timers / تایمرهای در حال اجرا را حفظ می‌کند

2. **When You Return / وقتی برمی‌گردید:**
   - Calculates elapsed time / زمان سپری شده را محاسبه می‌کند
   - Updates all running timers / تمام تایمرهای در حال اجرا را به‌روزرسانی می‌کند
   - Triggers missed alerts / هشدارهای از دست رفته را فعال می‌کند

**Example / مثال:**
```
Left at:  18:00 (timer showing 2:30:00)
Return at: 20:00
Result:   Timer now shows 0:30:00 (2 hours deducted)
```

---

## 📱 Progressive Web App (PWA) / برنامه وب پیشرونده

### Install as Native App / نصب به عنوان برنامه بومی

**Installation Benefits / مزایای نصب:**
- 📲 Home screen icon / آیکون صفحه اصلی
- 🖥️ Full-screen experience / تجربه تمام صفحه
- ⚡ Faster loading / بارگذاری سریع‌تر
- 📡 Offline capability / قابلیت آفلاین
- 🔔 Better notifications / اعلان‌های بهتر

**Platforms Supported / پلتفرم‌های پشتیبانی شده:**
- 📱 Android (Chrome, Firefox, Edge) / اندروید
- 🍎 iOS (Safari) / آی‌او‌اس
- 💻 Desktop (Chrome, Edge) / دسکتاپ

**How to Install / نحوه نصب:**

Android:
1. Open in Chrome / در کروم باز کنید
2. Menu → "Add to Home screen" / منو → "Add to Home screen"
3. Confirm / تأیید کنید

iOS:
1. Open in Safari / در سافاری باز کنید
2. Share → "Add to Home Screen" / اشتراک‌گذاری → "Add to Home Screen"
3. Confirm / تأیید کنید

---

## 🎨 User Interface / رابط کاربری

### Modern Dark Design / طراحی مدرن تیره

**Visual Elements / عناصر بصری:**

**Colors / رنگ‌ها:**
- 🌑 Dark background (gray-900) / پس‌زمینه تیره
- 🔵 Cyan accents (#00BCD4) / تأکیدهای فیروزه‌ای
- 🟢 Green for success actions / سبز برای اقدامات موفق
- 🟠 Orange for pause actions / نارنجی برای اقدامات توقف
- 🔴 Red for delete actions / قرمز برای اقدامات حذف

**Animations / انیمیشن‌ها:**
- ✨ Smooth transitions / انتقال‌های روان
- 💫 Scale-in for dialogs / بزرگ شدن برای دیالوگ‌ها
- 🎈 Bounce-in for alerts / پرش برای هشدارها
- 💓 Pulse effect on add button / افکت پالس روی دکمه افزودن
- ⚡ Animated progress bars / نوارهای پیشرفت متحرک

**Typography / تایپوگرافی:**
- 📝 Large, readable fonts / فونت‌های بزرگ و خوانا
- 🔤 Clear hierarchy / سلسله مراتب واضح
- 💬 High contrast text / متن با کنتراست بالا

---

## 📐 Responsive Design / طراحی واکنش‌گرا

### Mobile-First Approach / رویکرد موبایل اول

**Screen Adaptations / تطبیق‌های صفحه:**

**📱 Mobile (< 640px)**
- Single column layout / چیدمان تک ستونی
- Full-width cards / کارت‌های تمام عرض
- Large touch targets (44px+) / اهداف لمسی بزرگ
- Optimized spacing / فاصله‌گذاری بهینه

**💻 Tablet (640px - 1024px)**
- Centered content / محتوای مرکزی
- Max-width container / کانتینر حداکثر عرض
- Comfortable margins / حاشیه‌های راحت

**🖥️ Desktop (> 1024px)**
- Max-width 2xl (672px) / حداکثر عرض
- Centered layout / چیدمان مرکزی
- Hover effects / افکت‌های هاور

---

## 🔧 User Actions / اقدامات کاربر

### Available Operations / عملیات موجود

**For Each Medication / برای هر دارو:**

**▶️ Start Timer / شروع تایمر**
- Confirms dose taken / تأیید مصرف دوز
- Starts countdown / شروع شمارش معکوس
- Deducts 1 pill / 1 قرص کسر می‌کند
- Shows running indicator / نشانگر اجرا را نشان می‌دهد

**⏸️ Pause Timer / توقف تایمر**
- Stops countdown / شمارش معکوس را متوقف می‌کند
- Preserves remaining time / زمان باقیمانده را حفظ می‌کند
- Changes to gray color / به رنگ خاکستری تغییر می‌کند

**↺ Reset Timer / ریست تایمر**
- Resets to full interval / به بازه کامل ریست می‌کند
- Requires confirmation / نیاز به تأیید دارد
- Keeps medication in list / دارو را در لیست نگه می‌دارد

**🗑️ Delete Medication / حذف دارو**
- Removes from database / از دیتابیس حذف می‌کند
- Requires confirmation / نیاز به تأیید دارد
- Permanent action / عمل دائمی

---

## 🔐 Security Features / ویژگی‌های امنیتی

### Privacy & Data Protection / حریم خصوصی و حفاظت از داده‌ها

**No External Communication / ارتباط خارجی ندارد:**
- ❌ No API calls / فراخوانی API ندارد
- ❌ No server uploads / آپلود سرور ندارد
- ❌ No user tracking / ردیابی کاربر ندارد
- ❌ No analytics / تجزیه و تحلیل ندارد
- ❌ No cookies / کوکی ندارد
- ❌ No third-party scripts / اسکریپت‌های شخص ثالث ندارد

**Local-Only Storage / فقط ذخیره‌سازی محلی:**
- ✅ IndexedDB on device / IndexedDB روی دستگاه
- ✅ No cloud sync / همگام‌سازی ابری ندارد
- ✅ User controls data / کاربر داده‌ها را کنترل می‌کند
- ✅ Can clear anytime / هر زمان می‌توان پاک کرد

---

## 🌐 Offline Support / پشتیبانی آفلاین

### Service Worker Caching / کش Service Worker

**What Works Offline / چه چیزی آفلاین کار می‌کند:**
- ✅ View medications / مشاهده داروها
- ✅ Add new medications / افزودن داروهای جدید
- ✅ Start/pause/reset timers / شروع/توقف/ریست تایمرها
- ✅ Delete medications / حذف داروها
- ✅ Receive alerts / دریافت هشدارها
- ✅ All core functionality / تمام عملکردهای اصلی

**Requires Internet / نیاز به اینترنت:**
- First-time load / بارگذاری اولین بار
- App updates / به‌روزرسانی‌های برنامه
- Health Tips link / لینک نکات سلامت

---

## ⚙️ Customization Options / گزینه‌های سفارشی‌سازی

### What You Can Customize / چه چیزی می‌توانید سفارشی کنید

**Per Medication / برای هر دارو:**
- 📝 Name (any text) / نام (هر متنی)
- 💊 Dosage (any text) / دوز (هر متنی)
- 🔢 Quantity (any number) / تعداد (هر عددی)
- ⏰ Interval (preset or custom) / بازه (از پیش تعریف شده یا سفارشی)

**App-Wide / در کل برنامه:**
- Currently: Dark theme only / در حال حاضر: فقط تم تیره
- Future: Light theme option / آینده: گزینه تم روشن
- Future: Language selection / آینده: انتخاب زبان

---

## 📊 Dashboard Overview / مرور داشبورد

### What You See / چه چیزی می‌بینید

**Header Section / بخش سرصفحه:**
- 💊 App title with icon / عنوان برنامه با آیکون
- Clean, minimal design / طراحی تمیز و مینیمال

**Action Buttons / دکمه‌های اقدام:**
- ➕ Add Medication (pulsing) / افزودن دارو (پالس)
- 💡 Health Tips (opens website) / نکات سلامت (وب‌سایت را باز می‌کند)

**Medication List / لیست داروها:**
- 🔢 Numbered cards (1, 2, 3...) / کارت‌های شماره‌گذاری شده
- 📊 Each card shows:
  - Medication name / نام دارو
  - Dosage information / اطلاعات دوز
  - Remaining quantity / تعداد باقیمانده
  - Timer countdown / شمارش معکوس تایمر
  - Progress bar / نوار پیشرفت
  - Action buttons / دکمه‌های اقدام

**Empty State / حالت خالی:**
- 💊 Large pill icon / آیکون قرص بزرگ
- 📝 Helpful message / پیام کمکی
- 👆 Call-to-action / فراخوان به اقدام

---

## 🎯 Key Differentiators / تمایزدهنده‌های کلیدی

### Why This App is Special / چرا این برنامه ویژه است

**vs. Native Apps / در مقابل برنامه‌های بومی:**
- ✅ No installation required (works in browser) / نیازی به نصب ندارد
- ✅ Cross-platform (iOS + Android + Desktop) / چند پلتفرمی
- ✅ Always up-to-date / همیشه به‌روز
- ✅ No app store approval needed / نیازی به تأیید فروشگاه برنامه ندارد
- ✅ Smaller file size / اندازه فایل کوچک‌تر

**vs. Cloud Apps / در مقابل برنامه‌های ابری:**
- ✅ Complete privacy (no server) / حریم خصوصی کامل
- ✅ Works offline / آفلاین کار می‌کند
- ✅ Faster (no network latency) / سریع‌تر (بدون تأخیر شبکه)
- ✅ No account needed / نیازی به حساب ندارد
- ✅ Free forever / برای همیشه رایگان

**vs. Simple Reminders / در مقابل یادآورهای ساده:**
- ✅ Medication-specific features / ویژگی‌های خاص دارو
- ✅ Stock tracking / پیگیری موجودی
- ✅ Persistent timers / تایمرهای پایدار
- ✅ Visual progress / پیشرفت بصری
- ✅ Professional design / طراحی حرفه‌ای

---

## 🚀 Performance Features / ویژگی‌های عملکرد

### Speed & Efficiency / سرعت و کارایی

**Load Time / زمان بارگذاری:**
- ⚡ < 1 second on fast connection / کمتر از 1 ثانیه در اتصال سریع
- 📦 Small bundle (230 KB) / بسته کوچک

**Runtime Performance / عملکرد زمان اجرا:**
- 🔄 1-second timer updates / به‌روزرسانی تایمر 1 ثانیه‌ای
- 💨 Smooth 60fps animations / انیمیشن‌های روان 60fps
- 🎯 Efficient re-renders / رندرهای مجدد کارآمد

**Battery Impact / تأثیر باتری:**
- 🔋 Low battery usage / استفاده کم از باتری
- ⏱️ Efficient timer loops / حلقه‌های تایمر کارآمد
- 💤 Minimal background processing / پردازش پس‌زمینه حداقل

---

## 📈 Scalability / مقیاس‌پذیری

### How Many Medications? / چند دارو؟

**Theoretical Limit / محدودیت نظری:**
- No hard limit / محدودیت سختی ندارد
- IndexedDB can store thousands / IndexedDB می‌تواند هزاران را ذخیره کند

**Practical Limit / محدودیت عملی:**
- Tested up to 50+ medications / تست شده تا 50+ دارو
- Performance remains excellent / عملکرد عالی باقی می‌ماند
- UI scrollable for any number / رابط کاربری برای هر تعدادی قابل پیمایش

---

## 🎓 User Experience / تجربه کاربر

### Ease of Use / سهولت استفاده

**Simple Workflow / گردش کار ساده:**
```
1. Add medication → 2. Take pill → 3. Start timer → 4. Get reminded
```

**Clear Feedback / بازخورد واضح:**
- ✅ Success messages / پیام‌های موفقیت
- ⚠️ Warning alerts / هشدارهای اخطار
- 🔔 Notification sounds / صداهای اعلان
- 🎨 Visual state changes / تغییرات حالت بصری

**Error Prevention / جلوگیری از خطا:**
- 📝 Form validation / اعتبارسنجی فرم
- ⚠️ Confirmation dialogs / دیالوگ‌های تأیید
- 💬 Helpful error messages / پیام‌های خطای کمکی

---

## 🌟 Unique Features / ویژگی‌های منحصر به فرد

### What Sets This Apart / چه چیزی این را متمایز می‌کند

**1. Time Persistence / پایداری زمان**
- Continues counting even when app is closed / حتی زمانی که برنامه بسته است، ادامه می‌دهد
- Calculates elapsed time accurately / زمان سپری شده را با دقت محاسبه می‌کند
- No missed reminders / یادآوری از دست رفته ندارد

**2. Visual Progress / پیشرفت بصری**
- See time remaining at a glance / زمان باقیمانده را در یک نگاه ببینید
- Color-coded status / وضعیت کدگذاری شده با رنگ
- Animated progress bars / نوارهای پیشرفت متحرک

**3. Stock Management / مدیریت موجودی**
- Automatic pill counting / شمارش خودکار قرص
- Low stock warnings / هشدارهای موجودی کم
- Know when to refill / بدانید کی باید دوباره پر کنید

**4. Multi-Channel Alerts / هشدارهای چند کاناله**
- Sound + Visual + Browser notifications / صدا + بصری + اعلان‌های مرورگر
- Impossible to miss / غیرممکن است از دست بروند

---

## 💡 Pro Tips / نکات حرفه‌ای

### Get the Most Out of the App / بیشترین استفاده را از برنامه ببرید

**1. Enable All Notifications / همه اعلان‌ها را فعال کنید**
- Browser notifications / اعلان‌های مرورگر
- Sound alerts / هشدارهای صوتی
- Multiple reminders / یادآورهای متعدد

**2. Install as PWA / به عنوان PWA نصب کنید**
- Better performance / عملکرد بهتر
- Home screen access / دسترسی صفحه اصلی
- Full-screen mode / حالت تمام صفحه

**3. Keep App Open / برنامه را باز نگه دارید**
- For most reliable alerts / برای قابل اعتمادترین هشدارها
- Or install as PWA for background / یا به عنوان PWA برای پس‌زمینه نصب کنید

**4. Regular Stock Updates / به‌روزرسانی‌های منظم موجودی**
- Update quantity when refilling / تعداد را هنگام پر کردن مجدد به‌روزرسانی کنید
- Get accurate low-stock alerts / هشدارهای دقیق موجودی کم دریافت کنید

**5. Backup Your List / از لیست خود پشتیبان‌گیری کنید**
- Take screenshots / اسکرین‌شات بگیرید
- Or write down medications / یا داروها را یادداشت کنید
- In case you clear browser data / در صورتی که داده‌های مرورگر را پاک کنید

---

## 📱 Mobile Optimizations / بهینه‌سازی‌های موبایل

### Touch-Friendly Design / طراحی لمسی‌پسند

**Large Touch Targets / اهداف لمسی بزرگ:**
- ✅ All buttons ≥ 44px / همه دکمه‌ها
- ✅ Easy to tap / آسان برای ضربه زدن
- ✅ Good spacing / فاصله‌گذاری خوب

**Swipe-Friendly / لمسی‌پسند:**
- ✅ Smooth scrolling / پیمایش روان
- ✅ No horizontal scroll / پیمایش افقی ندارد
- ✅ Native-like feel / احساس بومی‌مانند

**Screen Keyboard / صفحه کلید صفحه:**
- ✅ Proper input types / انواع ورودی مناسب
- ✅ Autocomplete disabled where needed / تکمیل خودکار در جای لازم غیرفعال شده
- ✅ Clear labels / برچسب‌های واضح

---

## 🎉 Success Stories / داستان‌های موفقیت

### Perfect For / مناسب برای

**✅ Elderly Care / مراقبت از سالمندان**
- Simple interface / رابط ساده
- Large text / متن بزرگ
- Clear reminders / یادآورهای واضح

**✅ Chronic Conditions / شرایط مزمن**
- Daily medications / داروهای روزانه
- Multiple drugs / داروهای متعدد
- Long-term tracking / پیگیری طولانی مدت

**✅ Post-Surgery / پس از جراحی**
- Timed doses / دوزهای زمان‌بندی شده
- Stock monitoring / نظارت بر موجودی
- Temporary schedules / برنامه‌های موقت

**✅ Antibiotic Courses / دوره‌های آنتی‌بیوتیک**
- Strict timing / زمان‌بندی دقیق
- Complete course tracking / پیگیری دوره کامل
- No missed doses / دوزهای از دست رفته ندارد

---

**🌟 Experience the future of medication management! / آینده مدیریت دارو را تجربه کنید!**

*Simple, Smart, Secure* / *ساده، هوشمند، امن*
