import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import "./index.css";
import App from "./App";

// =============================================================================
// Service Worker
// فقط در حالت وب / PWA ثبت می‌شود
// در Native (APK) نیازی به Service Worker نیست
// =============================================================================
function registerServiceWorker() {
  if (Capacitor.isNativePlatform()) {
    // در APK به Service Worker نیازی نداریم
    return;
  }

  if (!('serviceWorker' in navigator)) {
    console.info('Service Worker not supported in this browser.');
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(registration => {
        console.info('Service Worker registered:', registration.scope);

        // بررسی آپدیت
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (
              newWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              console.info('New Service Worker available.');
            }
          });
        });
      })
      .catch(error => {
        console.warn('Service Worker registration failed:', error);
      });
  });
}

// =============================================================================
// Render App
// =============================================================================
function mountApp() {
  const rootElement = document.getElementById('root');

  if (!rootElement) {
    console.error(
      '[MediReminder] Root element #root not found. Cannot mount app.'
    );
    return;
  }

  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

// =============================================================================
// Bootstrap
// =============================================================================
registerServiceWorker();
mountApp();
