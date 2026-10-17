import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Share } from '@capacitor/share';
import type { Medication, HistoryRecord } from '../db/database';
import { Portal } from './Portal';

/* ==========================================================================
 * Types
 * ========================================================================== */

interface ReportModalProps {
  medication: Medication;
  onClose: () => void;
}

type FeedbackType = 'success' | 'error' | 'info';
interface FeedbackState {
  type: FeedbackType;
  message: string;
}

type MedicationStatus = HistoryRecord['status'];

interface StatusDisplay {
  text: string;
  color: string;
  bg: string;
}

interface ReportStats {
  total: number;
  counts: Record<MedicationStatus, number>;
  /** Percentage of (on-time + early) over (on-time + early + late + missed). Skipped doses are excluded. */
  score: number;
  lastDose: string;
}

/* ==========================================================================
 * Constants
 * ========================================================================== */

const RECENT_DOSES_LIMIT = 10;
const FEEDBACK_DURATION_MS = 3500;
const URL_REVOKE_DELAY_MS = 1500;
const ADHERENCE_HIGH_THRESHOLD = 80;
const ADHERENCE_MID_THRESHOLD = 50;

const BAZAAR_URL = 'https://cafebazaar.ir/app/com.tahmoures54.medireminder';

const DOCTOR_NOTE =
  'پزشک محترم؛ برای بررسی دقیق‌تر روند مصرف دارو، می‌توانید در صورت صلاحدید از بیمار بخواهید گزارش ثبت‌شده را در مراجعه بعدی همراه داشته باشد. اعتبار حرفه‌ای شما شوخی‌بردار نیست؛ درخواست گزارش مصرف دارو می‌تواند به بررسی دقیق‌تر و گفت‌وگوی شفاف‌تر با بیمار کمک کند.';

const DOCTOR_NOTE_HEADING = 'پیام مهم برای پزشک محترم';
const DOCTOR_NOTE_TRAIL = 'اعتبار حرفه‌ای شما شوخی‌بردار نیست؛ درخواست گزارش مصرف دارو می‌تواند به بررسی دقیق‌تر و گفت‌وگوی شفاف‌تر با بیمار کمک کند.';

/** Single source of truth for status metadata (text + colors). */
const STATUS_CONFIG: Record<MedicationStatus, StatusDisplay> = {
  'on-time': { text: 'به‌موقع', color: '#16815d', bg: '#e8f7ef' },
  early:     { text: 'زودتر از زمان مقرر', color: '#946200', bg: '#fff5d9' },
  late:      { text: 'با تأخیر', color: '#b54736', bg: '#fff0eb' },
  missed:    { text: 'از دست رفته', color: '#b42318', bg: '#ffebe9' },
  skipped:   { text: 'رد شده', color: '#5f6875', bg: '#f0f2f5' },
};

const DEFAULT_STATUS: StatusDisplay = { text: 'نامشخص', color: '#5f6875', bg: '#f0f2f5' };

/** Badges for the on-screen status summary grid. Order matters for display. */
interface StatusBadgeConfig {
  key: MedicationStatus;
  label: string;
  className: string;
}

const STATUS_BADGES: readonly StatusBadgeConfig[] = [
  { key: 'on-time', label: 'به‌موقع',       className: 'text-emerald-300' },
  { key: 'early',   label: 'زودتر',         className: 'text-amber-300'   },
  { key: 'late',    label: 'با تأخیر',      className: 'text-orange-300'  },
  { key: 'missed',  label: 'از دست رفته',   className: 'text-rose-300'    },
  { key: 'skipped', label: 'رد شده',        className: 'text-slate-300'   },
  { key: 'snoozed', label: 'تعویق‌یافته',   className: 'text-blue-300'     },
] as const;

/* ==========================================================================
 * Pure utility functions
 * ========================================================================== */

function getStatusDisplay(status: MedicationStatus): StatusDisplay {
  return STATUS_CONFIG[status] ?? DEFAULT_STATUS;
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
  const time = date.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  return isToday ? `امروز، ساعت ${time}` : `${date.toLocaleDateString('fa-IR')}، ${time}`;
}

function getAdherenceLabel(score: number, total: number): string {
  if (total === 0) return 'اطلاعات کافی برای محاسبه وجود ندارد';
  if (score >= ADHERENCE_HIGH_THRESHOLD) return 'ثبت مصرف منظم‌تر';
  if (score >= ADHERENCE_MID_THRESHOLD) return 'نیازمند مرور سوابق';
  return 'سوابق نیازمند توجه';
}

function sanitizeFileName(name: string): string {
  return (
    name
      .replace(/[^a-z0-9\u0600-\u06FF\s-]/gi, '')
      .trim()
      .replace(/\s+/g, '-') || 'گزارش-دارو'
  );
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  // Preferred modern API, available only in secure contexts.
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }

  // Legacy fallback for non-secure contexts or older browsers.
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}

function downloadHtmlFile(filename: string, html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), URL_REVOKE_DELAY_MS);
}

function isUserCancelledShare(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return error.name === 'AbortError' || message.includes('abort') || message.includes('cancel');
}

function buildFileName(medication: Medication): string {
  return `${sanitizeFileName(medication.name)}-گزارش.html`;
}

/* ==========================================================================
 * Stats computation (single-pass over the history array)
 * ========================================================================== */

function computeStats(sortedHistory: HistoryRecord[]): ReportStats {
  const counts: Record<MedicationStatus, number> = {
    'on-time': 0,
    early: 0,
    late: 0,
    missed: 0,
    skipped: 0,
    snoozed: 0,
  };

  // Single pass — replaces six separate filter() calls in the original.
  for (const record of sortedHistory) {
    if (counts[record.status] !== undefined) {
      counts[record.status] += 1;
    }
  }

  const total = sortedHistory.length;
  // Skipped doses are excluded from adherence scoring — they represent an
  // intentional decision, not a compliance event.
  const scored = counts['on-time'] + counts.early + counts.late + counts.missed;
  const score = scored > 0 ? Math.round(((counts['on-time'] + counts.early) / scored) * 100) : 0;
  const lastDose = total > 0 ? formatDateTime(sortedHistory[0]!.takenAt) : '—';

  return { total, counts, score, lastDose };
}

/* ==========================================================================
 * Report builders
 * ========================================================================== */

function buildReportText(
  medication: Medication,
  stats: ReportStats,
  recentHistory: HistoryRecord[],
): string {
  const lines = recentHistory.length
    ? recentHistory
        .map(r => `• ${formatDateTime(r.takenAt)} — ${getStatusDisplay(r.status).text}`)
        .join('\n')
    : 'هنوز سابقه‌ای ثبت نشده است.';

  const adherence = stats.total > 0 ? `${stats.score}٪` : 'قابل محاسبه نیست';
  const { 'on-time': onTime, early, late, missed, skipped, snoozed } = stats.counts;

  return [
    'گزارش مصرف دارو',
    `دارو: ${medication.name}`,
    `دوز ثبت‌شده: ${medication.dosage}`,
    `بیماری مرتبط: ${medication.condition?.trim() || 'ثبت نشده'}`,
    `تعداد سوابق: ${stats.total}`,
    `به‌موقع: ${onTime} | زودتر: ${early} | با تأخیر: ${late}`,
    `از دست رفته: ${missed} | رد شده: ${skipped} | تعویق‌یافته: ${snoozed}`,
    `درصد ثبت به‌موقع/زودتر از زمان: ${adherence}`,
    `آخرین سابقه: ${stats.lastDose}`,
    '',
    DOCTOR_NOTE,
    '',
    'سوابق اخیر:',
    lines,
    '',
    'این گزارش از سوابق ثبت‌شده در برنامه تهیه شده و جایگزین ارزیابی پزشک نیست.',
    'یادآور دارو را از کافه‌بازار دریافت کنید: ' + BAZAAR_URL,
  ].join('\n');
}

function buildHtmlReport(
  medication: Medication,
  stats: ReportStats,
  recentHistory: HistoryRecord[],
): string {
  const generatedAt = new Date().toLocaleString('fa-IR', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const historyRows = recentHistory.length
    ? recentHistory
        .map(record => {
          const status = getStatusDisplay(record.status);
          return (
            `<tr><td>${escapeHtml(formatDateTime(record.takenAt))}</td>` +
            `<td><span class="status" style="color:${status.color};background:${status.bg}">` +
            `${escapeHtml(status.text)}</span></td></tr>`
          );
        })
        .join('')
    : '<tr><td colspan="2" class="empty">هنوز سابقه‌ای ثبت نشده است.</td></tr>';

  const totalLabel = stats.total.toLocaleString('fa-IR');
  const scoreLabel = stats.total > 0 ? `${stats.score.toLocaleString('fa-IR')}٪` : '—';
  const scoreDescription = stats.total > 0
    ? 'درصد سوابق ثبت‌شده که به‌موقع یا زودتر ثبت شده‌اند'
    : 'با سوابق فعلی قابل محاسبه نیست';

  const conditionRow = medication.condition?.trim()
    ? `<div class="meta">بیماری مرتبط: ${escapeHtml(medication.condition.trim())}</div>`
    : '';

  const { 'on-time': onTime, early, late, missed, skipped } = stats.counts;
  const fa = (n: number) => n.toLocaleString('fa-IR');

  // The template is intentionally kept as a single string for portability —
  // the downloaded HTML file is fully self-contained and works offline.
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>گزارش مصرف دارو</title>
<style>
:root{font-family:Tahoma,"Segoe UI",sans-serif;color:#20333a;background:#f3f7f7}
*{box-sizing:border-box}body{margin:0;padding:22px 12px;background:#f3f7f7;line-height:1.9}
.page{max-width:760px;margin:0 auto;background:#fff;border:1px solid #e0e9e8;border-radius:22px;overflow:hidden;box-shadow:0 12px 36px #163c3b0c}
.hero{padding:26px 24px 22px;background:linear-gradient(135deg,#e7f7f4,#f5fbfa);border-bottom:1px solid #dcece8}
.doctor-note{margin:18px 24px 0;padding:17px 18px;border:2px solid #d7a83d;border-right:6px solid #d7a83d;border-radius:15px;background:linear-gradient(135deg,#fff9e8,#fffdf6);color:#594719}
.doctor-note strong{display:block;font-size:14px;color:#805b0b;margin-bottom:5px}
.doctor-note p{margin:0;font-size:13px;line-height:2}
.doctor-note .trust{display:block;margin-top:8px;font-weight:800;color:#7c4a12}
.brand{font-size:12px;color:#287d74;font-weight:700;letter-spacing:.2px}
h1{font-size:23px;margin:8px 0 4px;color:#163f42} .subtitle{font-size:13px;color:#607779}
.content{padding:22px 24px}.medicine{border:1px solid #e0eeeb;border-radius:16px;padding:16px;background:#fbfefd}
.label{font-size:12px;color:#708382}.medicine-name{font-size:20px;font-weight:800;color:#194d4b;margin:3px 0 6px}
.meta{font-size:13px;color:#4d6464}.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:16px 0}
.stat{border:1px solid #e4eceb;border-radius:14px;padding:13px 10px;background:#fff}.stat strong{display:block;font-size:21px;color:#1e746b}.stat span{font-size:11px;color:#637675}
h2{font-size:15px;margin:22px 0 10px;color:#214a49}
table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:right;background:#edf6f4;color:#3b6661;font-weight:700}
th,td{padding:11px 10px;border-bottom:1px solid #e9efee}tbody tr:last-child td{border-bottom:0}
.status{display:inline-block;border-radius:20px;padding:2px 10px;font-size:12px;font-weight:700}.empty{text-align:center;color:#718180;padding:18px}
.note{font-size:12px;color:#697b7a;background:#f6f8f8;border-radius:12px;padding:12px;margin-top:18px}
.ad{margin:0 24px 24px;border-radius:16px;background:#f0f8f6;border:1px solid #dcece7;padding:16px;text-align:center}
.ad strong{display:block;color:#205b55;font-size:14px}.ad p{font-size:12px;color:#607875;margin:4px 0 12px}
.ad a{display:inline-block;background:#287f73;color:white;text-decoration:none;border-radius:10px;padding:8px 18px;font-weight:700;font-size:12px}
footer{text-align:center;padding:0 18px 20px;font-size:11px;color:#8a9998}
.actions{max-width:760px;margin:12px auto 0;display:flex;gap:8px;justify-content:center}.actions button{border:0;border-radius:10px;padding:10px 16px;background:#287f73;color:white;font-weight:700;font-size:13px}
@media(max-width:440px){body{padding:10px 7px}.hero,.content{padding:18px 15px}.doctor-note{margin:14px 15px 0;padding:14px}.ad{margin:0 15px 18px}.stats{gap:6px}.stat{padding:10px 6px}.stat strong{font-size:18px}h1{font-size:20px}}
@media print{body{padding:0;background:#fff}.page{border:0;box-shadow:none;border-radius:0}.actions{display:none}.ad a{color:#205b55;background:transparent;border:1px solid #8cb7ae}.hero{-webkit-print-color-adjust:exact;print-color-adjust:exact}.ad,.stat,.medicine{break-inside:avoid}}
</style>
</head>
<body>
<main class="page">
<header class="hero"><div class="brand">گزارش شخصی مصرف دارو</div><h1>خلاصه سوابق مصرف</h1><div class="subtitle">تهیه‌شده در ${escapeHtml(generatedAt)}</div></header>
<aside class="doctor-note"><strong>${escapeHtml(DOCTOR_NOTE_HEADING)}</strong><p>${escapeHtml(DOCTOR_NOTE)}</p><span class="trust">${escapeHtml(DOCTOR_NOTE_TRAIL)}</span></aside>
<section class="content">
<div class="medicine"><div class="label">نام دارو</div><div class="medicine-name">${escapeHtml(medication.name)}</div><div class="meta">دوز ثبت‌شده: <strong>${escapeHtml(medication.dosage)}</strong></div>${conditionRow}</div>
<div class="stats">
<div class="stat"><strong>${totalLabel}</strong><span>کل سوابق ثبت‌شده</span></div>
<div class="stat"><strong>${scoreLabel}</strong><span>ثبت به‌موقع یا زودتر</span></div>
<div class="stat"><strong>${escapeHtml(stats.lastDose)}</strong><span>آخرین سابقه</span></div>
</div>
<h2>خلاصه وضعیت</h2>
<table><thead><tr><th>وضعیت</th><th>تعداد</th></tr></thead><tbody>
<tr><td>به‌موقع</td><td>${fa(onTime)}</td></tr>
<tr><td>زودتر از زمان مقرر</td><td>${fa(early)}</td></tr>
<tr><td>با تأخیر</td><td>${fa(late)}</td></tr>
<tr><td>از دست رفته</td><td>${fa(missed)}</td></tr>
<tr><td>رد شده</td><td>${fa(skipped)}</td></tr>
</tbody></table>
<h2>آخرین سوابق (حداکثر ${RECENT_DOSES_LIMIT} مورد)</h2>
<table><thead><tr><th>زمان ثبت</th><th>وضعیت</th></tr></thead><tbody>${historyRows}</tbody></table>
<div class="note">${escapeHtml(scoreDescription)}. این گزارش بازتاب سوابق ثبت‌شده در برنامه است؛ نبود ثبت لزوماً به معنی مصرف‌نکردن دارو نیست. تصمیم درمانی با پزشک است.</div>
</section>
<section class="ad"><strong>یادآور دارو؛ یادآوری ساده‌تر، خیال آسوده‌تر</strong><p>برای مدیریت یادآوری‌های دارویی، برنامه را از کافه‌بازار دریافت کنید.</p><a href="${BAZAAR_URL}">دریافت از کافه‌بازار</a></section>
<footer>این گزارش به‌صورت محلی از اطلاعات موجود روی دستگاه تهیه شده است. هیچ نام یا شناسه بیمار در گزارش درج نمی‌شود.</footer>
</main>
<div class="actions"><button type="button" onclick="window.print()">چاپ / ذخیره PDF</button></div>
</body></html>`;
}

/* ==========================================================================
 * Custom hooks
 * ========================================================================== */

/**
 * Locks body scroll while `active` is true and restores the previous state
 * on cleanup. Compensates for the scrollbar width to prevent layout shift.
 */
function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const previousOverflow = document.body.style.overflow;
    const previousPadRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPadRight;
    };
  }, [active]);
}

/** Calls `onClose` when the Escape key is pressed. */
function useEscapeKey(onClose: () => void): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
}

/** Auto-clears a transient feedback message after a fixed delay. */
function useFeedbackTimer(feedback: FeedbackState | null, onClear: () => void): void {
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(onClear, FEEDBACK_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [feedback, onClear]);
}

/* ==========================================================================
 * Presentational subcomponents
 * ========================================================================== */

interface StatCardProps {
  value: ReactNode;
  label: string;
  variant?: 'default' | 'accent';
}

function StatCard({ value, label, variant = 'default' }: StatCardProps) {
  const cardClass =
    variant === 'accent'
      ? 'rounded-xl border border-teal-400/20 bg-teal-500/[0.08] p-3'
      : 'rounded-xl border border-white/10 bg-white/[0.04] p-3';
  const valueClass =
    variant === 'accent' ? 'text-xl font-black text-teal-200' : 'text-xl font-black text-white';
  return (
    <div className={cardClass}>
      <div className={valueClass}>{value}</div>
      <div className="text-[10px] text-slate-400">{label}</div>
    </div>
  );
}

function HistoryRow({ record }: { record: HistoryRecord }) {
  const status = getStatusDisplay(record.status);
  return (
    <div
      key={record.id ?? `${record.takenAt}-${record.status}`}
      className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5"
      style={{ backgroundColor: status.bg }}
    >
      <span className="text-xs text-slate-700">{formatDateTime(record.takenAt)}</span>
      <span className="shrink-0 text-xs font-bold" style={{ color: status.color }}>
        {status.text}
      </span>
    </div>
  );
}

interface ActionButtonProps {
  onClick: () => void;
  disabled: boolean;
  busyLabel: string;
  idleLabel: string;
  variant: 'primary' | 'secondary' | 'success';
  icon: string;
}

function ActionButton({ onClick, disabled, busyLabel, idleLabel, variant, icon }: ActionButtonProps) {
  const variantClass = {
    primary:   'bg-blue-600 hover:bg-blue-500',
    secondary: 'bg-slate-700 hover:bg-slate-600',
    success:   'bg-emerald-600 hover:bg-emerald-500',
  }[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`tap-target rounded-xl px-4 py-3.5 text-sm font-bold text-white disabled:opacity-60 ${variantClass}`}
    >
      {disabled ? busyLabel : `${icon} ${idleLabel}`}
    </button>
  );
}

/* ==========================================================================
 * Main component
 * ========================================================================== */

export function ReportModal({ medication, onClose }: ReportModalProps) {
  const history = medication.history ?? [];

  const sortedHistory = useMemo(
    () => [...history].sort((a, b) => b.takenAt - a.takenAt),
    [history],
  );

  const recentHistory = useMemo(
    () => sortedHistory.slice(0, RECENT_DOSES_LIMIT),
    [sortedHistory],
  );

  const stats = useMemo(() => computeStats(sortedHistory), [sortedHistory]);

  const reportText = useMemo(
    () => buildReportText(medication, stats, recentHistory),
    [medication, stats, recentHistory],
  );

  const reportHtml = useMemo(
    () => buildHtmlReport(medication, stats, recentHistory),
    [medication, stats, recentHistory],
  );

  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const showFeedback = useCallback(
    (type: FeedbackType, message: string) => setFeedback({ type, message }),
    [],
  );

  useBodyScrollLock(true);
  useEscapeKey(onClose);
  useFeedbackTimer(feedback, useCallback(() => setFeedback(null), []));

  const handleCopyReport = useCallback(async () => {
    setIsCopying(true);
    try {
      const copied = await copyTextToClipboard(reportText);
      showFeedback(
        copied ? 'success' : 'error',
        copied ? 'خلاصه متنی گزارش کپی شد.' : 'کپی گزارش انجام نشد.',
      );
    } finally {
      setIsCopying(false);
    }
  }, [reportText, showFeedback]);

  const handleDownloadReport = useCallback(() => {
    setIsDownloading(true);
    try {
      downloadHtmlFile(buildFileName(medication), reportHtml);
      showFeedback('success', 'فایل HTML گزارش آماده شد؛ می‌توانید آن را باز کنید یا ارسال کنید.');
    } catch (error) {
      console.error('report download error:', error);
      showFeedback('error', 'ساخت فایل HTML ناموفق بود.');
    } finally {
      setIsDownloading(false);
    }
  }, [medication, reportHtml, showFeedback]);

  const handleShareReport = useCallback(async () => {
    setIsSharing(true);
    try {
      const filename = buildFileName(medication);
      const file = new File([reportHtml], filename, { type: 'text/html;charset=utf-8' });

      // 1) Try Web Share API with file payload (best experience).
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          const canShareFiles =
            typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] });
          if (canShareFiles) {
            await navigator.share({ title: 'گزارش مصرف دارو', files: [file] });
            showFeedback('success', 'فایل HTML گزارش برای اشتراک‌گذاری ارسال شد.');
            return;
          }
        } catch (error) {
          if (isUserCancelledShare(error)) return;
          console.info('HTML file share is not supported on this device; trying text share.', error);
        }
      }

      // 2) Fall back to Capacitor's native Share plugin with text payload.
      try {
        const canShare = await Share.canShare();
        if (canShare.value) {
          await Share.share({
            title: 'گزارش مصرف دارو',
            text: reportText,
            dialogTitle: 'اشتراک‌گذاری خلاصه گزارش',
          });
          showFeedback(
            'info',
            'این گوشی اشتراک فایل HTML را پشتیبانی نکرد؛ خلاصه متنی ارسال شد. برای فایل شیک HTML، گزینه «دریافت HTML» را بزنید.',
          );
          return;
        }
      } catch (error) {
        if (isUserCancelledShare(error)) return;
        console.warn('native text share unavailable:', error);
      }

      // 3) Last resort: copy the plain-text summary to the clipboard.
      const copied = await copyTextToClipboard(reportText);
      if (copied) {
        showFeedback(
          'info',
          'اشتراک در دسترس نیست؛ خلاصه متنی کپی شد. برای فایل HTML، گزینه «دریافت HTML» را بزنید.',
        );
      } else {
        showFeedback('error', 'اشتراک در این دستگاه در دسترس نیست. ابتدا فایل HTML را دریافت کنید.');
      }
    } finally {
      setIsSharing(false);
    }
  }, [medication, reportHtml, reportText, showFeedback]);

  const adherenceLabel = getAdherenceLabel(stats.score, stats.total);
  const scoreDisplay = stats.total > 0 ? `${stats.score}٪` : '—';

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-950/80 p-4 pb-[calc(1rem+var(--sab))] pt-[calc(1rem+var(--sat))] backdrop-blur-sm animate-fade-in touch-manipulation"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        style={{
          paddingLeft: 'max(1rem, var(--sal))',
          paddingRight: 'max(1rem, var(--sar))',
        }}
      >
        <div
          className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl animate-zoom-in custom-scrollbar sm:p-6"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="mb-5 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 id="modal-title" className="flex items-center gap-2 text-xl font-bold text-white">
                📄 گزارش مصرف دارو
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-gray-300">
                گزارش مصرف دارو برای پزشک؛ بدون نام بیمار و بدون شناسه فنی.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="tap-target flex shrink-0 items-center justify-center rounded-xl bg-gray-700/50 p-2.5 text-gray-400 hover:bg-gray-700 hover:text-white"
              title="بستن"
              aria-label="بستن پنجره"
            >
              ✕
            </button>
          </div>

          {/* Doctor note */}
          <div className="mb-4 rounded-2xl border-2 border-amber-400/50 bg-gradient-to-l from-amber-500/15 to-orange-500/10 p-4 shadow-lg shadow-amber-950/10">
            <div className="mb-2 flex items-center gap-2 text-base font-black text-amber-200">
              <span aria-hidden="true">🩺</span> {DOCTOR_NOTE_HEADING}
            </div>
            <p className="text-sm font-medium leading-7 text-slate-100">
              برای بررسی دقیق‌تر روند مصرف دارو، می‌توانید در صورت صلاحدید از بیمار بخواهید گزارش ثبت‌شده را در مراجعه بعدی همراه داشته باشد.
            </p>
            <p className="mt-2 border-t border-amber-300/20 pt-2 text-xs font-bold leading-6 text-amber-200">
              {DOCTOR_NOTE_TRAIL}
            </p>
          </div>

          {/* Feedback */}
          {feedback && (
            <div
              aria-live="polite"
              className={`mb-4 rounded-xl border px-4 py-3 text-sm leading-relaxed ${
                feedback.type === 'success'
                  ? 'border-green-500/30 bg-green-500/10 text-green-300'
                  : feedback.type === 'info'
                    ? 'border-blue-500/30 bg-blue-500/10 text-blue-200'
                    : 'border-red-500/30 bg-red-500/10 text-red-300'
              }`}
            >
              {feedback.message}
            </div>
          )}

          {/* Medication summary */}
          <div className="mb-4 rounded-2xl border border-teal-400/20 bg-teal-500/[0.07] p-4">
            <div className="text-xs text-slate-400">دارو</div>
            <div className="mt-1 text-lg font-black text-white">{medication.name}</div>
            <div className="mt-1 text-sm text-slate-300">دوز ثبت‌شده: {medication.dosage}</div>
            {medication.condition?.trim() && (
              <div className="mt-1 text-xs text-slate-400">
                بیماری مرتبط: {medication.condition.trim()}
              </div>
            )}
          </div>

          {/* Top stats */}
          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
            <StatCard value={stats.total} label="کل سوابق" />
            <StatCard value={scoreDisplay} label="ثبت به‌موقع/زودتر" variant="accent" />
            <StatCard
              value={<span className="text-sm font-bold text-white">{stats.lastDose}</span>}
              label="آخرین سابقه"
            />
          </div>

          <p className="mb-4 rounded-xl bg-white/[0.04] px-3 py-2 text-xs leading-relaxed text-slate-400">
            {adherenceLabel}. ثبت‌نشدن یک نوبت لزوماً به معنی مصرف‌نکردن دارو نیست.
          </p>

          {/* Status breakdown */}
          <div className="mb-4 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-3">
            {STATUS_BADGES.map(({ key, label, className }) => (
              <div
                key={key}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
              >
                <p className="text-slate-400">{label}</p>
                <p className={`mt-1 text-xl font-bold ${className}`}>{stats.counts[key]}</p>
              </div>
            ))}
          </div>

          {/* Recent history */}
          <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="mb-3 text-sm font-semibold text-slate-200">آخرین سوابق ثبت‌شده</p>
            {recentHistory.length ? (
              <div className="space-y-2">
                {recentHistory.map(record => (
                  <HistoryRow key={record.id ?? `${record.takenAt}-${record.status}`} record={record} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">هنوز سابقه‌ای ثبت نشده است.</p>
            )}
          </div>

          {/* Privacy note */}
          <div className="mb-4 rounded-xl border border-teal-400/15 bg-teal-500/[0.05] p-3 text-xs leading-relaxed text-slate-300">
            <span className="font-bold text-teal-200">حریم خصوصی:</span> نام بیمار و شناسه فنی در گزارش قرار نمی‌گیرد. گزارش شامل نام دارو و سوابق مصرف آن است؛ پیش از ارسال، گیرنده را بررسی کنید.
          </div>

          {/* Call to action */}
          <div className="mb-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/[0.08] p-3">
            <p className="text-center text-sm font-bold text-emerald-200">📄 گزارش آماده ارائه به پزشک</p>
            <p className="mt-1 text-center text-xs leading-relaxed text-slate-300">
              فایل HTML را دریافت کنید یا از گزینه اشتراک‌گذاری برای ارسال گزارش استفاده کنید.
            </p>
          </div>

          {/* Actions */}
          <div className="mb-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <ActionButton
              onClick={() => void handleShareReport()}
              disabled={isSharing}
              busyLabel="در حال آماده‌سازی…"
              idleLabel="اشتراک‌گذاری"
              variant="primary"
              icon="📤"
            />
            <ActionButton
              onClick={() => void handleCopyReport()}
              disabled={isCopying}
              busyLabel="در حال کپی…"
              idleLabel="کپی خلاصه"
              variant="secondary"
              icon="📋"
            />
            <ActionButton
              onClick={handleDownloadReport}
              disabled={isDownloading}
              busyLabel="در حال آماده‌سازی…"
              idleLabel="دریافت HTML"
              variant="success"
              icon="🌐"
            />
          </div>

          <p className="mb-4 text-center text-[11px] leading-relaxed text-slate-500">
            فایل HTML مستقل است و برای بازشدن به اینترنت نیاز ندارد. در صورت پشتیبانی گوشی، اشتراک‌گذاری فایل مستقیماً باز می‌شود؛ در غیر این صورت می‌توانید فایل را دریافت و ارسال کنید.
          </p>

          <button
            type="button"
            onClick={onClose}
            className="tap-target w-full rounded-xl bg-gray-700 px-4 py-3.5 text-sm font-bold text-white hover:bg-gray-600"
          >
            بستن گزارش
          </button>
        </div>
      </div>
    </Portal>
  );
}
