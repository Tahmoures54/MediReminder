type DiagnosticEntry = { at: string; level: string; message: string };

const STORAGE_KEY = 'medireminder_diagnostic_log_v1';
const MAX_ENTRIES = 400;
const entries: DiagnosticEntry[] = [];
let initialized = false;
let viewerOpen = false;

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

function buildReport(): string {
  return [
    'MediReminder diagnostic report',
    `Created: ${new Date().toISOString()}`,
    `App version: ${import.meta.env.VITE_APP_VERSION || 'not exposed'}`,
    `Platform: ${navigator.userAgent}`,
    `Online: ${navigator.onLine}`,
    `Entries: ${entries.length}`,
    'Note: this report is limited to app-side logs; it is not full Android system logcat.',
    '',
    ...entries.map((item) => `[${item.at}] [${item.level}] ${item.message}`),
    '',
  ].join('\n');
}

async function copyReportToClipboard(report: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(report);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = report;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, report.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function downloadReport(report: string): void {
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
}

function closeViewer(): void {
  const overlay = document.getElementById('medireminder-diag-overlay');
  if (overlay) overlay.remove();
  viewerOpen = false;
}

function openViewer(): void {
  if (viewerOpen) return;
  viewerOpen = true;
  recordDiagnostic('info', 'User opened in-app diagnostic viewer.');

  const report = buildReport();

  const overlay = document.createElement('div');
  overlay.id = 'medireminder-diag-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'گزارش تشخیصی MediReminder');
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483646',
    'background:rgba(2,6,23,.82)',
    'display:flex',
    'align-items:stretch',
    'justify-content:center',
    'padding:max(10px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left))',
    'box-sizing:border-box',
  ].join(';');

  const panel = document.createElement('div');
  panel.style.cssText = [
    'width:100%',
    'max-width:720px',
    'max-height:100%',
    'display:flex',
    'flex-direction:column',
    'background:#0f172a',
    'border:1px solid rgba(103,232,249,.35)',
    'border-radius:16px',
    'overflow:hidden',
    'box-shadow:0 12px 40px rgba(0,0,0,.45)',
  ].join(';');

  const header = document.createElement('div');
  header.style.cssText = [
    'flex:0 0 auto',
    'display:flex',
    'align-items:center',
    'justify-content:space-between',
    'gap:8px',
    'padding:12px 14px',
    'border-bottom:1px solid rgba(148,163,184,.25)',
    'background:#0b1220',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = `گزارش تشخیصی (${entries.length} مورد)`;
  title.style.cssText = 'color:#e2e8f0;font:700 14px sans-serif;';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'بستن';
  closeBtn.style.cssText = [
    'border:1px solid rgba(148,163,184,.4)',
    'border-radius:10px',
    'padding:8px 12px',
    'background:#1e293b',
    'color:#e2e8f0',
    'font:700 12px sans-serif',
    'cursor:pointer',
  ].join(';');
  closeBtn.addEventListener('click', closeViewer);

  header.appendChild(title);
  header.appendChild(closeBtn);

  const textarea = document.createElement('textarea');
  textarea.readOnly = true;
  textarea.value = report;
  textarea.setAttribute('aria-label', 'متن گزارش تشخیصی');
  textarea.style.cssText = [
    'flex:1 1 auto',
    'min-height:180px',
    'width:100%',
    'box-sizing:border-box',
    'margin:0',
    'padding:12px',
    'border:none',
    'outline:none',
    'resize:none',
    'background:#020617',
    'color:#cbd5e1',
    'font:12px/1.55 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    'direction:ltr',
    'text-align:left',
    'white-space:pre',
    'overflow:auto',
  ].join(';');

  const footer = document.createElement('div');
  footer.style.cssText = [
    'flex:0 0 auto',
    'display:flex',
    'flex-wrap:wrap',
    'gap:8px',
    'padding:12px 14px',
    'border-top:1px solid rgba(148,163,184,.25)',
    'background:#0b1220',
  ].join(';');

  const status = document.createElement('div');
  status.style.cssText = 'width:100%;min-height:18px;color:#94a3b8;font:600 12px sans-serif;';

  const makeActionBtn = (label: string, primary = false): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.style.cssText = [
      'flex:1 1 auto',
      'min-width:110px',
      'border:1px solid ' + (primary ? 'rgba(103,232,249,.55)' : 'rgba(148,163,184,.35)'),
      'border-radius:12px',
      'padding:11px 12px',
      'background:' + (primary ? '#0e7490' : '#1e293b'),
      'color:#fff',
      'font:700 13px sans-serif',
      'cursor:pointer',
    ].join(';');
    return btn;
  };

  const copyBtn = makeActionBtn('کپی همه لاگ‌ها', true);
  const downloadBtn = makeActionBtn('دانلود فایل');
  const selectBtn = makeActionBtn('انتخاب متن');
  const recoverBtn = makeActionBtn('ثبت ۷۸ کارت خریدهای پنل');

  copyBtn.addEventListener('click', async () => {
    const current = textarea.value || buildReport();
    const ok = await copyReportToClipboard(current);
    status.textContent = ok
      ? '✓ لاگ‌ها کپی شدند. می‌توانید در پیام یا ایمیل پیست کنید.'
      : 'کپی خودکار نشد. دکمه «انتخاب متن» را بزنید و دستی کپی کنید.';
    status.style.color = ok ? '#34d399' : '#fbbf24';
  });

  downloadBtn.addEventListener('click', () => {
    downloadReport(textarea.value || buildReport());
    status.textContent = 'فایل گزارش آماده شد. اگر دانلود نشد، از منوی اشتراک‌گذاری دستگاه استفاده کنید.';
    status.style.color = '#94a3b8';
  });

  selectBtn.addEventListener('click', () => {
    textarea.focus();
    textarea.select();
    status.textContent = 'متن انتخاب شد. با نگه داشتن انگشت گزینه Copy را بزنید.';
    status.style.color = '#94a3b8';
  });

  recoverBtn.addEventListener('click', async () => {
    recoverBtn.disabled = true;
    status.textContent = 'در حال ثبت اعتبار خریدهای تأییدشده پنل…';
    status.style.color = '#94a3b8';
    try {
      const { applyPanelConfirmedRecoveryGrant } = await import('./bazaarBilling');
      const result = await applyPanelConfirmedRecoveryGrant();
      textarea.value = buildReport();
      textarea.scrollTop = textarea.scrollHeight;
      if (result.granted) {
        status.textContent = `✓ ۷۸ کارت ثبت شد. اعتبار کل: ${result.totalCredits}. برنامه را یک‌بار ببندید و دوباره باز کنید.`;
        status.style.color = '#34d399';
      } else {
        status.textContent = `این بازیابی قبلاً اعمال شده. اعتبار فعلی: ${result.totalCredits}`;
        status.style.color = '#fbbf24';
      }
    } catch (error) {
      status.textContent = `ثبت اعتبار ناموفق: ${error instanceof Error ? error.message : String(error)}`;
      status.style.color = '#f87171';
    } finally {
      recoverBtn.disabled = false;
    }
  });

  footer.appendChild(copyBtn);
  footer.appendChild(downloadBtn);
  footer.appendChild(selectBtn);
  footer.appendChild(recoverBtn);
  footer.appendChild(status);

  panel.appendChild(header);
  panel.appendChild(textarea);
  panel.appendChild(footer);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // Scroll to end so latest payment logs are visible first.
  requestAnimationFrame(() => {
    textarea.scrollTop = textarea.scrollHeight;
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeViewer();
  });
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
  button.textContent = 'مشاهده گزارش خطا';
  button.setAttribute('aria-label', 'مشاهده و کپی گزارش خطای MediReminder');
  button.style.cssText = [
    'position:fixed',
    'right:12px',
    'bottom:calc(14px + env(safe-area-inset-bottom))',
    'z-index:2147483645',
    'border:1px solid rgba(103,232,249,.55)',
    'border-radius:12px',
    'padding:10px 12px',
    'background:#0e7490',
    'color:#fff',
    'font:700 12px sans-serif',
    'box-shadow:0 4px 16px rgba(0,0,0,.28)',
  ].join(';');
  button.addEventListener('click', openViewer);
  document.body.appendChild(button);
}
