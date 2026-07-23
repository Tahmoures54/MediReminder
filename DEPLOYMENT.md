# 🚀 Deployment Guide

## راهنمای استقرار - Persian Deployment Guide

This guide explains how to deploy your AI Medi Reminder app to various hosting platforms.

این راهنما نحوه استقرار برنامه یادآور هوشمند دارو را در پلتفرم‌های مختلف میزبانی توضیح می‌دهد.

---

## Prerequisites / پیش‌نیازها

- Node.js 18+ installed / Node.js نسخه 18+ نصب شده
- Git installed (for some platforms) / Git نصب شده (برای برخی پلتفرم‌ها)
- Built project files (`npm run build`) / فایل‌های پروژه ساخته شده

---

## Option 1: Netlify (Recommended) / نتلیفای (توصیه می‌شود)

### Method A: Drag & Drop / روش الف: کشیدن و رها کردن

1. Build the project / پروژه را بسازید:
   ```bash
   npm run build
   ```

2. Visit https://app.netlify.com/drop / به آدرس بروید

3. Drag the `dist` folder to the upload area / پوشه `dist` را به ناحیه آپلود بکشید

4. Done! Your app is live / تمام! برنامه شما زنده است

### Method B: Git Integration / روش ب: یکپارچگی Git

1. Push your code to GitHub/GitLab / کد خود را به GitHub/GitLab بفرستید

2. Go to https://app.netlify.com / به آدرس بروید

3. Click "Add new site" → "Import an existing project" / کلیک کنید "Add new site" → "Import an existing project"

4. Connect your repository / مخزن خود را متصل کنید

5. Build settings / تنظیمات ساخت:
   - Build command: `npm run build`
   - Publish directory: `dist`

6. Deploy! / استقرار!

### Custom Domain / دامنه سفارشی

- Go to Domain settings / به تنظیمات دامنه بروید
- Add custom domain / دامنه سفارشی اضافه کنید
- Update DNS records as instructed / رکوردهای DNS را طبق دستورالعمل به‌روزرسانی کنید

---

## Option 2: Vercel

### Quick Deploy / استقرار سریع

1. Install Vercel CLI / نصب Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Build project / ساخت پروژه:
   ```bash
   npm run build
   ```

3. Deploy / استقرار:
   ```bash
   vercel --prod
   ```

4. Follow prompts / دستورات را دنبال کنید

### Git Integration / یکپارچگی Git

1. Push to GitHub / به GitHub بفرستید

2. Visit https://vercel.com / به آدرس بروید

3. Click "Add New Project" / کلیک کنید "Add New Project"

4. Import your repository / مخزن خود را وارد کنید

5. Vercel auto-detects Vite / Vercel به طور خودکار Vite را تشخیص می‌دهد

6. Deploy! / استقرار!

---

## Option 3: GitHub Pages

### Setup / راه‌اندازی

1. Install gh-pages package / نصب بسته gh-pages:
   ```bash
   npm install --save-dev gh-pages
   ```

2. Update `package.json` / به‌روزرسانی:
   ```json
   {
     "scripts": {
       "deploy": "npm run build && gh-pages -d dist"
     },
     "homepage": "https://yourusername.github.io/repo-name"
   }
   ```

3. Deploy / استقرار:
   ```bash
   npm run deploy
   ```

4. Enable GitHub Pages:
   - Go to repository Settings / به تنظیمات مخزن بروید
   - Pages → Source: `gh-pages` branch / منبع: شاخه `gh-pages`

### Base Path / مسیر پایه

If deploying to subdirectory, update `vite.config.ts`:

```typescript
export default defineConfig({
  base: '/repo-name/',
  // ...
});
```

---

## Option 4: Firebase Hosting

### Setup / راه‌اندازی

1. Install Firebase CLI / نصب Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```

2. Login / ورود:
   ```bash
   firebase login
   ```

3. Initialize / مقداردهی اولیه:
   ```bash
   firebase init hosting
   ```

4. Configure / پیکربندی:
   - Public directory: `dist`
   - Single-page app: Yes
   - Automatic builds: No

5. Build and deploy / ساخت و استقرار:
   ```bash
   npm run build
   firebase deploy
   ```

---

## Option 5: Cloudflare Pages

### Quick Deploy / استقرار سریع

1. Build project / ساخت پروژه:
   ```bash
   npm run build
   ```

2. Visit https://pages.cloudflare.com / به آدرس بروید

3. Click "Create a project" / کلیک کنید "Create a project"

4. Connect Git or upload `dist` folder / Git متصل کنید یا پوشه `dist` آپلود کنید

5. Build settings / تنظیمات ساخت:
   - Build command: `npm run build`
   - Build output: `dist`

6. Deploy! / استقرار!

---

## Option 6: Custom Server / سرور سفارشی

### Using Nginx

1. Build project / ساخت پروژه:
   ```bash
   npm run build
   ```

2. Copy `dist` folder to server / کپی پوشه `dist` به سرور:
   ```bash
   scp -r dist/* user@server:/var/www/html/
   ```

3. Nginx config / پیکربندی Nginx:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       root /var/www/html;
       index index.html;

       location / {
           try_files $uri $uri/ /index.html;
       }

       # Cache static assets
       location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
           expires 1y;
           add_header Cache-Control "public, immutable";
       }
   }
   ```

4. Restart Nginx / راه‌اندازی مجدد:
   ```bash
   sudo systemctl restart nginx
   ```

### Using Apache

1. `.htaccess` in `dist` folder:
   ```apache
   <IfModule mod_rewrite.c>
     RewriteEngine On
     RewriteBase /
     RewriteRule ^index\.html$ - [L]
     RewriteCond %{REQUEST_FILENAME} !-f
     RewriteCond %{REQUEST_FILENAME} !-d
     RewriteRule . /index.html [L]
   </IfModule>
   ```

---

## Environment Configuration / پیکربندی محیط

### Update Support Website URL / به‌روزرسانی آدرس وب‌سایت

In `src/App.tsx`, update:

```typescript
const SUPPORT_WEBSITE = "https://www.aimedireminder.com";
```

### Update Manifest / به‌روزرسانی Manifest

In `public/manifest.json`, update:

```json
{
  "start_url": "/",
  "scope": "/"
}
```

---

## Testing Deployment / تست استقرار

### Checklist / چک‌لیست

✅ App loads correctly / برنامه به درستی بارگذاری می‌شود
✅ Database creates on first visit / دیتابیس در اولین بازدید ایجاد می‌شود
✅ Can add medications / می‌توان دارو اضافه کرد
✅ Timers count down / تایمرها شمارش معکوس می‌کنند
✅ Notifications work / اعلان‌ها کار می‌کنند
✅ PWA installable / PWA قابل نصب است
✅ Works offline / آفلاین کار می‌کند
✅ Data persists after refresh / داده‌ها پس از تازه‌سازی باقی می‌مانند

### Test on Mobile / تست روی موبایل

1. Open DevTools / DevTools را باز کنید
2. Toggle device toolbar (Ctrl+Shift+M) / نوار ابزار دستگاه را تغییر دهید
3. Test different screen sizes / اندازه‌های مختلف صفحه را تست کنید
4. Test touch interactions / تعاملات لمسی را تست کنید

---

## SSL/HTTPS Setup / راه‌اندازی SSL/HTTPS

### Why HTTPS? / چرا HTTPS؟

- Required for Service Workers / برای Service Workers لازم است
- Required for Notifications API / برای Notification API لازم است
- Better security / امنیت بهتر
- Better SEO / SEO بهتر

### Free SSL Options / گزینه‌های SSL رایگان

1. **Let's Encrypt** (for custom servers) / (برای سرورهای سفارشی)
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

2. **Cloudflare** (automatic) / (خودکار)
   - Add domain to Cloudflare
   - Enable SSL in dashboard

3. **Platform SSL** (automatic on Netlify/Vercel/etc.) / (خودکار روی Netlify/Vercel/و غیره)
   - Automatically provided

---

## Performance Optimization / بهینه‌سازی عملکرد

### Build Optimization / بهینه‌سازی ساخت

Already included in Vite build:
- Minification / فشرده‌سازی
- Tree shaking / حذف کد غیرضروری
- Code splitting / تقسیم کد
- Asset optimization / بهینه‌سازی دارایی‌ها

### CDN Setup / راه‌اندازی CDN

For global performance, use CDN:

1. **Cloudflare** (free) / (رایگان)
   - Add domain to Cloudflare
   - Enable automatic caching

2. **Platform CDN** (included on most platforms) / (در اکثر پلتفرم‌ها شامل است)
   - Netlify: Automatic CDN
   - Vercel: Automatic Edge Network
   - Firebase: Automatic CDN

---

## Monitoring / نظارت

### Analytics / تجزیه و تحلیل

Add Google Analytics or similar:

```html
<!-- In index.html -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_ID');
</script>
```

### Error Tracking / ردیابی خطا

Consider adding Sentry or similar:

```bash
npm install @sentry/react
```

---

## Backup & Maintenance / پشتیبان‌گیری و نگهداری

### Regular Backups / پشتیبان‌گیری منظم

1. Keep Git history / تاریخچه Git را نگه دارید
2. Tag releases / نسخه‌ها را برچسب‌گذاری کنید
3. Document changes / تغییرات را مستند کنید

### Updates / به‌روزرسانی‌ها

```bash
# Check for outdated packages
npm outdated

# Update packages
npm update

# Rebuild and redeploy
npm run build
```

---

## Troubleshooting / عیب‌یابی

### Common Issues / مشکلات رایج

1. **404 errors on refresh** / خطاهای 404 در تازه‌سازی
   - Solution: Configure server for SPA routing
   - راه‌حل: سرور را برای مسیریابی SPA پیکربندی کنید

2. **Assets not loading** / دارایی‌ها بارگذاری نمی‌شوند
   - Solution: Check `base` path in Vite config
   - راه‌حل: مسیر `base` را در پیکربندی Vite بررسی کنید

3. **Service Worker not updating** / Service Worker به‌روزرسانی نمی‌شود
   - Solution: Clear cache or update cache version
   - راه‌حل: کش را پاک کنید یا نسخه کش را به‌روزرسانی کنید

4. **IndexedDB errors** / خطاهای IndexedDB
   - Solution: Check browser compatibility
   - راه‌حل: سازگاری مرورگر را بررسی کنید

---

## Cost Considerations / ملاحظات هزینه

### Free Tier Options / گزینه‌های رایگان

- **Netlify**: 100 GB bandwidth/month / پهنای باند در ماه
- **Vercel**: Unlimited projects, 100 GB bandwidth / پروژه نامحدود
- **GitHub Pages**: Unlimited, public repos only / نامحدود، فقط مخازن عمومی
- **Firebase**: 10 GB storage, 360 MB/day transfer / ذخیره‌سازی، انتقال در روز
- **Cloudflare Pages**: Unlimited requests / درخواست نامحدود

All free tiers are sufficient for personal use!

همه سطوح رایگان برای استفاده شخصی کافی هستند!

---

## Security Checklist / چک‌لیست امنیتی

✅ HTTPS enabled / HTTPS فعال شده
✅ No API keys exposed / کلیدهای API فاش نشده
✅ No sensitive data in client code / داده‌های حساس در کد کلاینت نیست
✅ Content Security Policy configured (optional) / سیاست امنیت محتوا پیکربندی شده (اختیاری)
✅ Regular dependency updates / به‌روزرسانی منظم وابستگی‌ها

---

## Success! / موفقیت!

Your AI Medi Reminder is now live and accessible worldwide!

یادآور هوشمند دارو شما اکنون زنده و در سراسر جهان قابل دسترسی است!

Share with friends and family to help them never miss a medication dose.

با دوستان و خانواده به اشتراک بگذارید تا به آنها کمک کنید هرگز یک دوز دارو را از دست ندهند.
