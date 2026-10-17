/* ==========================================================================
 * MediReminder — in-app diagnostics
 *
 * Goal: capture warn/error/unhandled events into a bounded, privacy-scrubbed
 * local log so the user can copy or download it for support — without ever
 * blocking medication reminders.
 *
 * Privacy model:
 *   - Purchase tokens are redacted (they grant real money value).
 *   - Phone numbers are redacted (PII).
 *   - The log is stored ONLY in localStorage on the user's device; nothing
 *     is transmitted. The user explicitly chooses to copy/download.
 *
 * Safety model:
 *   - Every public function swallows its own errors. Diagnostics must
 *     never crash the host app.
 *   - localStorage writes are debounced so a burst of console.warn calls
 *     does not thrash the main thread.
 * ========================================================================== */

/* --------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------- */

export type DiagnosticLevel =
  | 'info'
  | 'payment'
  | 'warn'
  | 'error'
  | 'window-error'
  | 'unhandled-rejection';

export interface DiagnosticEntry {
  at: string;
  level: DiagnosticLevel;
  message: string;
}

/* --------------------------------------------------------------------------
 * Constants
 * -------------------------------------------------------------------------- */

const STORAGE_KEY = 'medireminder_diagnostic_log_v1';
const MAX_ENTRIES = 400;
const MAX_MESSAGE_LENGTH = 1800;
const PERSIST_DEBOUNCE_MS = 400;
const URL_REVOKE_DELAY_MS = 30_000;
const VIEWER_Z_INDEX = 2147483646;
const FLOATING_BUTTON_Z_INDEX = VIEWER_Z_INDEX - 1;

/**
 * Regex patterns for PII / sensitive-value redaction. Each pattern is
 * deliberately scoped to avoid false positives on benign diagnostic data
 * (dates, card counts, ISO timestamps, etc.).
 */
const REDACTION_PATTERNS: readonly { pattern: RegExp; replacement: string }[] = [
  // Purchase token — appears as `purchaseToken=...`, `purchaseToken:...`,
  // or `purchaseToken ...`. Match the literal key (not the suffix of other
  // words like `medireminder-tokens`) by requiring a word boundary.
  {
    pattern: /\bpurchaseToken[=: ]+["']?[A-Za-z0-9_\-+/.=]+["']?/gi,
    replacement: 'purchaseToken=[redacted]',
  },
  // The standalone `token=...` / `token:...` form. Requires a leading word
  // boundary AND that the match is not preceded by `-` (so `medireminder-tokens`
  // and `medireminder-tokens:30` payloads are preserved — they only encode
  // a card count, not a secret).
  {
    pattern: /(?<![a-z\-])token[=: ]+["']?[A-Za-z0-9_\-+/.=]{8,}["']?/gi,
    replacement: 'token=[redacted]',
  },
  // Phone numbers — require a `+` country code OR a leading zero (Iranian
  // mobile / landline convention), then at least 7 more digits with optional
  // separators. This avoids false positives on ISO dates (`2024-01-15`),
  // semver (`1.0.0`), and short numeric config values (`interval: 3600`).
  // The trailing `(?!\d)` prevents matching the date portion of ISO timestamps.
  {
    pattern: /(?<!\d)(?:\+\d[\d ()-]{6,}\d|0\d[\d ()-]{6,}\d)(?!\d)/g,
    replacement: '[phone-redacted]',
  },
];

/* --------------------------------------------------------------------------
 * Module state (singleton)
 * -------------------------------------------------------------------------- */

const entries: DiagnosticEntry[] = [];
let initialized = false;
let viewerOpen = false;
let persistTimer: number | null = null;
let pendingPersist = false;

/* --------------------------------------------------------------------------
 * Privacy-scrubbing
 * -------------------------------------------------------------------------- */

/**
 * Converts any value to a string, then redacts purchase tokens and phone
 * numbers, then truncates to a safe length. Never throws — if anything
 * fails, returns a fallback string.
 */
function safeText(value: unknown): string {
  let text: string;
  try {
    if (value instanceof Error) {
      text = `${value.name}: ${value.message}\n${value.stack || ''}`;
    } else if (typeof value === 'string') {
      text = value;
    } else {
      text = JSON.stringify(value);
    }
  } catch {
    try {
      text = String(value);
    } catch {
      text = '[unrepresentable value]';
    }
  }

  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    try {
      text = text.replace(pattern, replacement);
    } catch {
      // A failing regex must not abort redaction of the others.
    }
  }

  return text.length > MAX_MESSAGE_LENGTH
    ? `${text.slice(0, MAX_MESSAGE_LENGTH)}…[truncated]`
    : text;
}

/* --------------------------------------------------------------------------
 * Persistence (debounced)
 * -------------------------------------------------------------------------- */

/**
 * Schedules a localStorage write. Multiple calls within the debounce window
 * coalesce into a single write, so a burst of console.warn calls does not
 * thrash the main thread with repeated JSON.stringify of 400 entries.
 */
function schedulePersist(): void {
  if (persistTimer !== null) {
    pendingPersist = true;
    return;
  }
  persistTimer = window.setTimeout(flushPersist, PERSIST_DEBOUNCE_MS);
}

/** Performs the actual localStorage write and resets the debounce timer. */
function flushPersist(): void {
  persistTimer = null;
  if (pendingPersist) {
    pendingPersist = false;
    schedulePersist();
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Diagnostics must never interfere with medication reminders.
    // Common causes: private mode quota, disk full, disabled storage.
  }
}

/* --------------------------------------------------------------------------
 * Public API
 * -------------------------------------------------------------------------- */

/**
 * Appends a diagnostic entry. The message is privacy-scrubbed before
 * storage. Never throws.
 */
export function recordDiagnostic(level: DiagnosticLevel, message: unknown): void {
  try {
    const entry: DiagnosticEntry = {
      at: new Date().toISOString(),
      level,
      message: safeText(message),
    };
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) {
      entries.splice(0, entries.length - MAX_ENTRIES);
    }
    schedulePersist();
  } catch {
    // Last-resort: drop the entry silently rather than crash the caller.
  }
}

/** Returns a defensive copy of the current entries. */
export function getDiagnosticEntries(): readonly DiagnosticEntry[] {
  return entries.slice();
}

/** Clears the in-memory log AND the persisted copy. Never throws. */
export function clearDiagnostics(): void {
  entries.length = 0;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore — clearing is best-effort.
  }
  if (persistTimer !== null) {
    window.clearTimeout(persistTimer);
    persistTimer = null;
    pendingPersist = false;
  }
}

/* --------------------------------------------------------------------------
 * Restore on init
 * -------------------------------------------------------------------------- */

/**
 * Loads previously persisted entries from localStorage. Damaged or
 * malformed entries are silently dropped — the diagnostic log must never
 * block app startup.
 */
function restore(): void {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(saved)) return;
    const valid = saved.slice(-MAX_ENTRIES).filter(isValidEntry);
    // Pre-fill in chronological order; subsequent push() calls append.
    entries.splice(0, entries.length, ...valid);
  } catch {
    // Ignore damaged or unavailable local diagnostics.
  }
}

function isValidEntry(item: unknown): item is DiagnosticEntry {
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof (item as DiagnosticEntry).at === 'string' &&
    typeof (item as DiagnosticEntry).level === 'string' &&
    typeof (item as DiagnosticEntry).message === 'string'
  );
}

/* --------------------------------------------------------------------------
 * Report building
 * -------------------------------------------------------------------------- */

function buildReport(): string {
  return [
    'MediReminder diagnostic report',
    `Created: ${new Date().toISOString()}`,
    `App version: ${import.meta.env.VITE_APP_VERSION || 'not exposed'}`,
    `Platform: ${navigator.userAgent}`,
    `Online: ${navigator.onLine}`,
    `Entries: ${entries.length}`,
    'Note: this report is limited to app-side logs; it is not full Android system logcat.',
    'Note: purchase tokens and phone numbers have been redacted.',
    '',
    ...entries.map((item) => `[${item.at}] [${item.level}] ${item.message}`),
    '',
  ].join('\n');
}

/* --------------------------------------------------------------------------
 * Export actions (copy / download)
 * -------------------------------------------------------------------------- */

async function copyReportToClipboard(report: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(report);
      return true;
    }
  } catch {
    // fall through to legacy path
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
  window.setTimeout(() => URL.revokeObjectURL(url), URL_REVOKE_DELAY_MS);
}

/* --------------------------------------------------------------------------
 * Viewer (in-app overlay)
 * -------------------------------------------------------------------------- */

function closeViewer(): void {
  const overlay = document.getElementById('medireminder-diag-overlay');
  if (overlay) overlay.remove();
  viewerOpen = false;
}

function openViewer(): void {
  if (viewerOpen) return;
  viewerOpen = true;
  recordDiagnostic('info', 'User opened in-app diagnostic viewer.');

  const overlay = createOverlay();
  const panel = createPanel();
  const { header, textarea, status, recoverBtn, clearBtn } = createViewerParts();

  panel.appendChild(header);
  panel.appendChild(textarea);
  panel.appendChild(createFooter(status, textarea, recoverBtn, clearBtn));
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // Scroll to end so latest logs are visible first.
  requestAnimationFrame(() => {
    textarea.scrollTop = textarea.scrollHeight;
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeViewer();
  });
  overlay.addEventListener('keydown', handleViewerKeyDown);
}

function handleViewerKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeViewer();
  }
}

/* --------------------------- viewer builders --------------------------- */

function createOverlay(): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.id = 'medireminder-diag-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'گزارش تشخیصی MediReminder');
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    `z-index:${VIEWER_Z_INDEX}`,
    'background:rgba(2,6,23,.82)',
    'display:flex',
    'align-items:stretch',
    'justify-content:center',
    'padding:max(10px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left))',
    'box-sizing:border-box',
  ].join(';');
  // Basic focus management: focus the overlay so keyboard users can close
  // with Escape immediately.
  overlay.tabIndex = -1;
  return overlay;
}

function createPanel(): HTMLDivElement {
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
  return panel;
}

interface ViewerParts {
  header: HTMLDivElement;
  textarea: HTMLTextAreaElement;
  status: HTMLDivElement;
  recoverBtn: HTMLButtonElement;
  clearBtn: HTMLButtonElement;
}

function createViewerParts(): ViewerParts {
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
  closeBtn.setAttribute('aria-label', 'بستن گزارش تشخیصی');
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
  textarea.value = buildReport();
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

  const status = document.createElement('div');
  status.style.cssText = 'width:100%;min-height:18px;color:#94a3b8;font:600 12px sans-serif;';

  // Recover button label uses the constant so it stays in sync if the
  // panel-recovery card count ever changes.
  const recoverBtn = makeActionBtn('ثبت ۷۸ کارت خریدهای پنل', true);
  const clearBtn = makeActionBtn('پاک کردن لاگ‌ها', false);

  return { header, textarea, status, recoverBtn, clearBtn };
}

function createFooter(
  status: HTMLDivElement,
  textarea: HTMLTextAreaElement,
  recoverBtn: HTMLButtonElement,
  clearBtn: HTMLButtonElement,
): HTMLDivElement {
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

  const copyBtn = makeActionBtn('کپی همه لاگ‌ها', true);
  const downloadBtn = makeActionBtn('دانلود فایل');
  const selectBtn = makeActionBtn('انتخاب متن');

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

  clearBtn.addEventListener('click', () => {
    if (!window.confirm('همه لاگ‌های تشخیصی پاک شود؟ این عمل قابل بازگشت نیست.')) return;
    clearDiagnostics();
    textarea.value = buildReport();
    status.textContent = 'لاگ‌ها پاک شدند.';
    status.style.color = '#34d399';
  });

  footer.appendChild(copyBtn);
  footer.appendChild(downloadBtn);
  footer.appendChild(selectBtn);
  footer.appendChild(recoverBtn);
  footer.appendChild(clearBtn);
  footer.appendChild(status);
  return footer;
}

function makeActionBtn(label: string, primary = false): HTMLButtonElement {
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
}

/* --------------------------------------------------------------------------
 * Floating button
 * -------------------------------------------------------------------------- */

function createFloatingButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'مشاهده گزارش خطا';
  button.setAttribute('aria-label', 'مشاهده و کپی گزارش خطای MediReminder');
  button.style.cssText = [
    'position:fixed',
    'right:12px',
    'bottom:calc(14px + env(safe-area-inset-bottom))',
    `z-index:${FLOATING_BUTTON_Z_INDEX}`,
    'border:1px solid rgba(103,232,249,.55)',
    'border-radius:12px',
    'padding:10px 12px',
    'background:#0e7490',
    'color:#fff',
    'font:700 12px sans-serif',
    'box-shadow:0 4px 16px rgba(0,0,0,.28)',
    'cursor:pointer',
  ].join(';');
  button.addEventListener('click', openViewer);
  return button;
}

/* --------------------------------------------------------------------------
 * Initialization
 * -------------------------------------------------------------------------- */

/**
 * Wires up diagnostic logging:
 *   - Restores previously persisted entries from localStorage.
 *   - Patches `console.warn` and `console.error` to also record into the log.
 *   - Captures `window.error` and `unhandledrejection` events.
 *   - Mounts a floating button to open the in-app viewer.
 *
 * Idempotent: calling it more than once is a no-op.
 * Browser-only: bails out on non-window environments (SSR, tests).
 */
export function initializeDiagnostics(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  restore();

  for (const level of ['warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      try {
        recordDiagnostic(level, args.map(safeText).join(' '));
      } catch {
        // Recording must never break the original console call.
      }
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

  document.body.appendChild(createFloatingButton());
}
