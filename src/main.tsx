import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import './index.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initializeDiagnostics } from './services/diagnostics';

// Start app-side diagnostics before React and payment flows initialize.
initializeDiagnostics();

// Fix 100vh on mobile — set --vh custom property
function setViewportHeight() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
  document.documentElement.style.setProperty('--dvh', `${window.innerHeight * 0.01}px`);
}
setViewportHeight();
window.addEventListener('resize', setViewportHeight, { passive: true });
window.addEventListener('orientationchange', () => {
  setTimeout(setViewportHeight, 100);
}, { passive: true });

async function registerServiceWorker() {
  if (Capacitor.isNativePlatform()) {
    console.info('[MediReminder] Native platform — SW disabled');
    return;
  }
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.register) {
    console.info('[MediReminder] SW not supported');
    return;
  }
  if (import.meta.env.DEV) {
    console.info('[MediReminder] SW disabled in development');
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        await reg.unregister();
        console.info('[MediReminder] Unregistered SW in dev');
      }
    } catch {}
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    console.info('[MediReminder] SW registered', registration.scope);
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          console.info('[MediReminder] New SW available — updating');
          newWorker.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      console.info('[MediReminder] SW controller changed — reloading');
      window.location.reload();
    });
    if (navigator.serviceWorker.controller) console.info('[MediReminder] SW active');
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

let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) {
    const target = e.target as HTMLElement;
    if (target && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) e.preventDefault();
  }
  lastTouchEnd = now;
}, { passive: false });

document.addEventListener('contextmenu', (e) => {
  const target = e.target as HTMLElement;
  if (target && !['INPUT', 'TEXTAREA'].includes(target.tagName)) {
    // Keep context menus enabled for accessibility.
  }
});

registerServiceWorker();
mountApp();
