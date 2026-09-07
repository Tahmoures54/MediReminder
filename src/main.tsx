import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import './index.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

async function registerServiceWorker() {
  if (Capacitor.isNativePlatform()) return;
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.register) return;
  if (import.meta.env.PROD === false) {
    console.info('[MediReminder] Service Worker disabled in development.');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      // در صورت نیاز به ماژول بودن SW:
      // type: 'module',
    });

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          console.info('[MediReminder] New Service Worker available.');
          // گزینه: به‌روزرسانی خودکار
          newWorker.postMessage({ type: 'SKIP_WAITING' });
          // و در sw.js شنونده message برای skipWaiting و clients.claim
        }
      });
    });

    // اگر Service Worker قبلاً کنترل صفحه را به دست گرفته است
    if (navigator.serviceWorker.controller) {
      console.info('[MediReminder] Service Worker active.');
    }
  } catch (error) {
    console.warn('[MediReminder] SW registration failed:', error);
  }
}

function mountApp() {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error('[MediReminder] #root not found.');
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

// اجرای ثبت Service Worker و سپس mount
registerServiceWorker();
mountApp();
