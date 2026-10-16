type DiagnosticEntry = { at: string; level: string; message: string };

const STORAGE_KEY = 'medireminder_diagnostic_log_v1';
const MAX_ENTRIES = 400;
const entries: DiagnosticEntry[] = [];
let initialized = false;

function safeText(value: unknown): string {
  let text: string;
  try {
    text = value instanceof Error
      ? `${value.name}: ${value.message}\n${value.stack || ''}`
      : typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  return text
    .replace(/purchaseToken[=: ]+[^,\s}]+/gi, 'purchaseToken=[redacted]')
    .replace(/token[=: ]+[^,\s}]+/gi, 'token=[redacted]')
    .replace(/(?:\+?\d[\d ()-]{8,}\d)/g, '[phone-redacted]')
    .slice(0, 1800);
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // Diagnostics must never interfere with medication reminders.
  }
}

export function recordDiagnostic(level: string, message: unknown): void {
  const entry = { at: new Date().toISOString(), level, message: safeText(message) };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  persist();
}

function restore(): void {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(saved)) {
      for (const item of saved.slice(-MAX_ENTRIES)) {
        if (item && typeof item.message === 'string') entries.push(item as DiagnosticEntry);
      }
    }
  } catch {
    // Ignore damaged or unavailable local diagnostics.
  }
}

function exportLog(): void {
  recordDiagnostic('info', 'User requested diagnostic export.');
  const report = [
    'MediReminder diagnostic report',
    `Created: ${new Date().toISOString()}`,
    `App version: ${import.meta.env.VITE_APP_VERSION || 'not exposed'}`,
    `Platform: ${navigator.userAgent}`,
    `Online: ${navigator.onLine}`,
    'Note: this report is limited to app-side logs; it is not full Android system logcat.',
    '',
    ...entries.map((item) => `[${item.at}] [${item.level}] ${item.message}`),
    '',
  ].join('\n');

  const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `medireminder-log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  window.alert('گزارش خطا آماده شد. اگر فایل به‌صورت خودکار ذخیره نشد، از منوی اشتراک‌گذاری یا مرورگر گزینه ذخیره/دانلود را انتخاب کنید. فایل را برای بررسی ارسال کنید.');
}

export function initializeDiagnostics(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  restore();

  for (const level of ['warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      recordDiagnostic(level, args.map(safeText).join(' '));
      original(...args);
    };
  }

  window.addEventListener('error', (event) => {
    recordDiagnostic('window-error', event.error || event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    recordDiagnostic('unhandled-rejection', event.reason);
  });

  recordDiagnostic('info', 'Diagnostic logging initialized.');
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'ذخیره گزارش خطا';
  button.setAttribute('aria-label', 'ذخیره گزارش خطای MediReminder');
  button.style.cssText = [
    'position:fixed',
    'right:12px',
    'bottom:calc(14px + env(safe-area-inset-bottom))',
    'z-index:2147483647',
    'border:1px solid rgba(103,232,249,.55)',
    'border-radius:12px',
    'padding:10px 12px',
    'background:#0e7490',
    'color:#fff',
    'font:700 12px sans-serif',
    'box-shadow:0 4px 16px rgba(0,0,0,.28)',
  ].join(';');
  button.addEventListener('click', exportLog);
  document.body.appendChild(button);
}
