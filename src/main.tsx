import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import './index.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initializeDiagnostics } from './services/diagnostics';

// Run diagnostics in try/catch: a failure here must not prevent the app
// from mounting (a blank screen is worse than losing diagnostics).
try {
  initializeDiagnostics();
} catch (error) {
  console.warn('[MediReminder] diagnostics failed to initialize:', error);
}

async function registerServiceWorker() {
  if (Capacitor.isNativePlatform()) {
    console.info('[MediReminder] Native platform — SW disabled');
    return;
  }
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.register) {
    console.info('[MediReminder] SW not supported');
    return;
  }

  // In development, unregister any leftover SW so hot reload is never cached.
  if (import.meta.env.DEV) {
    console.info('[MediReminder] SW disabled in development');
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        await reg.unregister();
      }
      if (regs.length) console.info('[MediReminder] Unregistered SW in dev');
    } catch (error) {
      console.warn('[MediReminder] failed to unregister SWs in dev:', error);
    }
    return;
  }

  // Capture whether a controller already exists. On the very first visit the
  // controller is null; `controllerchange` then fires when the brand-new SW
  // activates (e.g. via clients.claim()). Reloading in that case would show a
  // flash on first load for no reason.
  const hadController = !!navigator.serviceWorker.controller;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    console.info('[MediReminder] SW registered', registration.scope);

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        // Only prompt/apply when an update is ready AND an existing controller
        // exists (i.e. this is genuinely an update, not the first activation).
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          newWorker.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      // First-install activation: nothing to reload for, the page is already
      // running the current build. Only reload on genuine updates.
      if (!hadController) return;

      refreshing = true;

      // Reloading while the user is mid-form (dose entry, purchase) silently
      // discards their input. Ask before reloading so the update is not
      // destructive. If you prefer a non-blocking UX, swap this for a
      // "New version available — reload?" toast.
      const shouldReload = window.confirm(
        'نسخه جدیدی از برنامه آماده است. برای به‌روزرسانی، صفحه دوباره بارگذاری می‌شود. آیا ادامه می‌دهید؟'
      );
      if (shouldReload) {
        console.info('[MediReminder] SW controller changed — reloading');
        window.location.reload();
      } else {
        // User declined: reset the guard so a future controllerchange can retry.
        refreshing = false;
      }
    });

    if (navigator.serviceWorker.controller) {
      console.info('[MediReminder] SW controlling the page');
    }
  } catch (error) {
    console.warn('[MediReminder] SW registration failed:', error);
  }
}

function mountApp() {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error('[MediReminder] #root not found');
    return;
  }
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );
}

// Mount first so the user sees UI as fast as possible; the SW is registered
// in parallel (register() is non-blocking anyway).
mountApp();
void registerServiceWorker();
