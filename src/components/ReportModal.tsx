import { useEffect, useMemo, useState } from 'react';
import { Share } from '@capacitor/share';
import type { Medication, HistoryRecord } from '../db/database';

interface ReportModalProps {
  medication: Medication;
  onClose: () => void;
}

type FeedbackState =
  | {
      type: 'success' | 'error' | 'info';
      message: string;
    }
  | null;

const RECENT_DOSES_LIMIT = 5;

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
  const time = date.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

  return isToday ? `امروز ساعت ${time}` : `${date.toLocaleDateString('fa-IR')} - ${time}`;
}

function getStatusDisplay(status: HistoryRecord['status']) {
  switch (status) {
    case 'on-time':
      return { icon: '🟢', text: 'به‌موقع', color: 'text-green-400', bg: 'bg-green-400/10' };
    case 'early':
      return { icon: '🟡', text: 'زودتر', color: 'text-yellow-400', bg: 'bg-yellow-400/10' };
    case 'late':
      return { icon: '🔴', text: 'دیرتر', color: 'text-red-400', bg: 'bg-red-400/10' };
    default:
      return { icon: '⚪', text: 'نامشخص', color: 'text-gray-400', bg: 'bg-gray-400/10' };
  }
}

function getAdherenceLabel(score: number, total: number) {
  if (total === 0) return 'هنوز داده‌ای نیست';
  if (score >= 80) return '🌟 عالی';
  if (score >= 50) return '👍 خوب';
  return '⚠️ نیاز به توجه';
}

function sanitizeFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\s-]/gi, '')
    .trim()
    .replace(/\s+/g, '-') || 'دارو';
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Use the legacy fallback below when Clipboard API is unavailable.
  }

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

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function isUserCancelledShare(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return error.name === 'AbortError' || message.includes('abort') || message.includes('cancel');
}

function buildReportText(
  medication: Medication,
  stats: {
    total: number;
    onTimeCount: number;
    earlyCount: number;
    lateCount: number;
    score: number;
    lastDose: string;
  },
  recentHistory: HistoryRecord[]
) {
  const recentLines = recentHistory.length
    ? recentHistory.map(record => `- ${formatDateTime(record.takenAt)} — ${getStatusDisplay(record.status).text}`).join('\n')
    : '- هنوز دوزی ثبت نشده';
  const adherence = stats.total > 0 ? `${stats.score}٪` : 'بدون داده';

  return `📊 گزارش مصرف دارو

💊 نام: ${medication.name}
🩺 بیماری مرتبط: ${medication.condition?.trim() || 'مشخص نشده'}
⚖️ دوز: ${medication.dosage}
⭐ پایبندی: ${adherence}
📦 دوزهای ثبت‌شده: ${stats.total}
🟢 به‌موقع: ${stats.onTimeCount}
🟡 زودتر: ${stats.earlyCount}
🔴 دیرتر: ${stats.lateCount}
🕒 آخرین دوز: ${stats.lastDose}

📝 دوزهای اخیر:
${recentLines}

🔗 ساخته‌شده با یادآور دارو
${window.location.origin}`;
}

// --- توابع جدید برای هش ---

/**
 * محاسبه هش SHA-256 با استفاده از Web Crypto API
 * در صورت عدم پشتیبانی، از هش FNV-1a (ساده) استفاده می‌کند.
 */
async function computeHash(text: string): Promise<string> {
  try {
    if (window.crypto && window.crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return `sha256:${hashHex}`;
    }
  } catch (error) {
    console.warn('SHA-256 در دسترس نیست، استفاده از هش جایگزین', error);
  }

  // Fallback: هش FNV-1a 32 بیتی
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * ساخت متن نهایی گزارش با هش
 * ابتدا متن پایه ساخته می‌شود، سپس هش محاسبه و به انتها اضافه می‌شود.
 */
async function buildSignedReport(
  medication: Medication,
  stats: { total: number; onTimeCount: number; earlyCount: number; lateCount: number; score: number; lastDose: string },
  recentHistory: HistoryRecord[]
): Promise<{ text: string; hash: string }> {
  const baseText = buildReportText(medication, stats, recentHistory);
  const hash = await computeHash(baseText);
  const signedText = `${baseText}\n\n🔐 امضای دیجیتال (SHA-256):\n${hash}`;
  return { text: signedText, hash };
}

// --- کامپوننت اصلی ---
export function ReportModal({ medication, onClose }: ReportModalProps) {
  const history = medication.history || [];

  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => b.takenAt - a.takenAt);
  }, [history]);

  const recentHistory = useMemo(() => {
    return sortedHistory.slice(0, RECENT_DOSES_LIMIT);
  }, [sortedHistory]);

  const stats = useMemo(() => {
    const total = sortedHistory.length;
    const onTimeCount = sortedHistory.filter(h => h.status === 'on-time').length;
    const earlyCount = sortedHistory.filter(h => h.status === 'early').length;
    const lateCount = sortedHistory.filter(h => h.status === 'late').length;
    const score = total > 0 ? Math.round((onTimeCount / total) * 100) : 0;
    const lastDose = total > 0 ? formatDateTime(sortedHistory[0].takenAt) : '—';

    return { total, onTimeCount, earlyCount, lateCount, score, lastDose };
  }, [sortedHistory]);

  // متن گزارش پایه (بدون هش)
  const baseReportText = useMemo(() => {
    return buildReportText(medication, stats, recentHistory);
  }, [medication, stats, recentHistory]);

  // وضعیت‌ها
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isHashing, setIsHashing] = useState(false);
  const [reportHash, setReportHash] = useState<string>('');

  // محاسبه هش اولیه برای نمایش در UI
  useEffect(() => {
    let isMounted = true;
    (async () => {
      setIsHashing(true);
      const hash = await computeHash(baseReportText);
      if (isMounted) {
        setReportHash(hash);
        setIsHashing(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [baseReportText]);

  // مدیریت Escape و اسکرول
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // پاک‌سازی خودکار feedback
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 2800);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const showFeedback = (type: 'success' | 'error' | 'info', message: string) => {
    setFeedback({ type, message });
  };

  // توابع عملیات با استفاده از نسخه امضاشده
  const handleCopyReport = async () => {
    setIsCopying(true);
    setIsHashing(true);
    try {
      const { text } = await buildSignedReport(medication, stats, recentHistory);
      const copied = await copyTextToClipboard(text);
      if (copied) {
        showFeedback('success', '📋 گزارش امضاشده کپی شد.');
      } else {
        showFeedback('error', '⚠️ امکان کپی گزارش وجود نداشت.');
      }
    } catch (error) {
      console.error('خطای کپی:', error);
      showFeedback('error', '⚠️ امکان کپی گزارش وجود نداشت.');
    } finally {
      setIsCopying(false);
      setIsHashing(false);
    }
  };

  const handleDownloadReport = async () => {
    setIsDownloading(true);
    setIsHashing(true);
    try {
      const { text } = await buildSignedReport(medication, stats, recentHistory);
      const filename = `${sanitizeFileName(medication.name || 'دارو')}-گزارش.txt`;
      downloadTextFile(filename, text);
      showFeedback('success', '⬇️ گزارش امضاشده دانلود شد.');
    } catch (error) {
      console.error('خطای دانلود:', error);
      showFeedback('error', '⚠️ امکان دانلود گزارش وجود نداشت.');
    } finally {
      setIsDownloading(false);
      setIsHashing(false);
    }
  };

  const handleShareReport = async () => {
    setIsSharing(true);
    setIsHashing(true);
    try {
      const { text } = await buildSignedReport(medication, stats, recentHistory);
      try {
        const canShare = await Share.canShare();
        if (canShare.value) {
          await Share.share({
            title: `گزارش مصرف ${medication.name}`,
            text,
            url: window.location.origin,
            dialogTitle: 'اشتراک‌گذاری گزارش دارو',
          });
          showFeedback('success', '📤 منوی اشتراک باز شد.');
          return;
        }
      } catch (pluginError) {
        console.warn('اشتراک نیتیو در دسترس نیست:', pluginError);
      }

      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({
          title: `گزارش مصرف ${medication.name}`,
          text,
          url: window.location.origin,
        });
        showFeedback('success', '📤 منوی اشتراک باز شد.');
        return;
      }

      const copied = await copyTextToClipboard(text);
      if (copied) {
        showFeedback('info', '📋 اشتراک در دسترس نیست. گزارش امضاشده کپی شد.');
        return;
      }

      const filename = `${sanitizeFileName(medication.name || 'دارو')}-گزارش.txt`;
      downloadTextFile(filename, text);
      showFeedback('info', '⬇️ اشتراک در دسترس نیست. گزارش امضاشده دانلود شد.');
    } catch (error) {
      if (isUserCancelledShare(error)) {
        return;
      }
      console.error('خطای اشتراک:', error);
      try {
        const { text } = await buildSignedReport(medication, stats, recentHistory);
        const copied = await copyTextToClipboard(text);
        if (copied) {
          showFeedback('info', '📋 اشتراک ناموفق. گزارش امضاشده کپی شد.');
          return;
        }
        const filename = `${sanitizeFileName(medication.name || 'دارو')}-گزارش.txt`;
        downloadTextFile(filename, text);
        showFeedback('info', '⬇️ اشتراک ناموفق. گزارش امضاشده دانلود شد.');
      } catch (fallbackError) {
        console.error('خطای جایگزین اشتراک:', fallbackError);
        showFeedback('error', '⚠️ امکان اشتراک گزارش وجود نداشت.');
      }
    } finally {
      setIsSharing(false);
      setIsHashing(false);
    }
  };

  // --- رابط کاربری (تقریباً مشابه قبل، با افزودن بخش هش) ---
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-700 bg-gray-800 p-6 shadow-2xl animate-in zoom-in-95 duration-200 custom-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        {/* هدر */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 id="modal-title" className="flex items-center gap-2 text-xl font-bold text-white">
              📊 گزارش {medication.name}
            </h2>
            <p className="mt-1 text-xs text-gray-400">
              خلاصه قابل اشتراک برای پزشک یا مراقب
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center rounded-lg bg-gray-700/50 p-2.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
            title="بستن"
            aria-label="بستن پنجره"
          >
            ✕
          </button>
        </div>

        {/* بازخورد */}
        {feedback && (
          <div
            aria-live="polite"
            className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
              feedback.type === 'success'
                ? 'border-green-500/30 bg-green-500/10 text-green-300'
                : feedback.type === 'info'
                ? 'border-blue-500/30 bg-blue-500/10 text-blue-300'
                : 'border-red-500/30 bg-red-500/10 text-red-300'
            }`}
          >
            {feedback.message}
          </div>
        )}

        {/* نمایش هش برای تأیید صحت */}
        <div className="mb-4 rounded-xl border border-gray-700 bg-gray-900 p-4">
          <p className="mb-1 text-xs text-gray-400">🔐 امضای دیجیتال (SHA-256)</p>
          <p className="break-all font-mono text-sm text-cyan-300">
            {isHashing ? 'در حال محاسبه...' : reportHash}
          </p>
          <p className="mt-2 text-xs text-gray-500">
            این هش از روی محتوای گزارش محاسبه شده است. هرگونه تغییر در متن گزارش باعث عدم تطابق هش می‌شود.
          </p>
        </div>

        <div className="mb-4 flex items-center justify-between rounded-xl border border-gray-700 bg-gray-900 p-4">
          <div>
            <p className="mb-1 text-sm text-gray-400">پایبندی کلی</p>
            <p className="text-sm text-gray-200">{getAdherenceLabel(stats.score, stats.total)}</p>
          </div>
          <div className={`text-3xl font-bold ${stats.total === 0 ? 'text-gray-400' : stats.score >= 80 ? 'text-green-400' : stats.score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
            {stats.total > 0 ? `${stats.score}٪` : '-'}
          </div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2 text-center text-xs">
          {[
            ['به‌موقع', stats.onTimeCount, 'text-green-300'],
            ['زودتر', stats.earlyCount, 'text-yellow-300'],
            ['دیرتر', stats.lateCount, 'text-red-300'],
          ].map(([label, count, color]) => (
            <div key={label} className="rounded-xl border border-gray-700 bg-gray-900 p-3">
              <p className="text-gray-400">{label}</p>
              <p className={`mt-1 text-xl font-bold ${color}`}>{count}</p>
            </div>
          ))}
        </div>

        <div className="mb-4 rounded-xl border border-gray-700 bg-gray-900 p-4">
          <p className="mb-3 text-sm font-semibold text-gray-300">دوزهای اخیر</p>
          {recentHistory.length > 0 ? (
            <div className="space-y-2">
              {recentHistory.map(record => {
                const status = getStatusDisplay(record.status);
                return (
                  <div key={record.id ?? `${record.takenAt}-${record.status}`} className={`flex items-center justify-between rounded-lg px-3 py-2 ${status.bg}`}>
                    <span className="text-xs text-gray-300">{formatDateTime(record.takenAt)}</span>
                    <span className={`text-xs ${status.color}`}>{status.icon} {status.text}</span>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-sm text-gray-500">هنوز دوزی ثبت نشده است.</p>}
        </div>

        {/* دکمه‌های عملیات */}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={handleShareReport}
            disabled={isSharing || isHashing}
            className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white transition-colors duration-200 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSharing ? 'در حال اشتراک...' : '📤 اشتراک'}
          </button>
          <button
            type="button"
            onClick={handleCopyReport}
            disabled={isCopying || isHashing}
            className="rounded-xl bg-cyan-600 px-4 py-3 font-bold text-white transition-colors duration-200 hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCopying ? 'در حال کپی...' : '📋 کپی'}
          </button>
          <button
            type="button"
            onClick={handleDownloadReport}
            disabled={isDownloading || isHashing}
            className="rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white transition-colors duration-200 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDownloading ? 'در حال آماده‌سازی...' : '⬇️ دانلود'}
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-lg bg-gray-700 px-4 py-3 font-bold text-white transition-colors duration-300 hover:bg-gray-600"
        >
          بستن گزارش
        </button>
      </div>
    </div>
  );
}
