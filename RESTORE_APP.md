# بازگردانی App.tsx و آماده‌سازی تست

## ۱. بازگردانی فایل App.tsx

در کلون محلی مخزن:

```bash
git fetch origin
git show 3883ec85b24a418989dc4efd19033b172ccd9aa6:src/App.tsx > src/App.tsx
git add src/App.tsx
git commit -m "fix(ui): restore App.tsx from last good revision"
git push origin main
```

## ۲. وضعیت کد پرداخت (آماده تست)

- شناسه‌ها: `medireminder_cards_3` / `10` / `25` (همان پنل شما)
- بدون `consume` → قابل بازیابی با حساب کافه‌بازار
- منبع حقیقت: مالکیت در بازار
- فایل‌های آماده: `bazaarBilling.ts`, `medicationAccess.ts`, `BAZAAR_BILLING.md`

## ۳. بیلد و نصب روی گوشی

```bash
npm ci
npm run check
npx cap sync android
```

سپس از Android Studio یا GitHub Actions فایل APK بسازید و روی گوشی نصب کنید.
