import { useEffect, useMemo, useState } from 'react';
import { Share } from '@capacitor/share';
import type { Medication, HistoryRecord } from '../db/database';
import { Portal } from './Portal';

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
    case 'missed':
      return { icon: '⚫', text: 'از دست رفته', color: 'text-rose-300', bg: 'bg-rose-400/10' };
    case 'skipped':
      return { icon: '⚪', text: 'رد شده', color: 'text-gray-400', bg: 'bg-gray-400/10' };
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
  } catch {}

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

type ReportStats = {
  total: number;
  onTimeCount: number;
  earlyCount: number;
  lateCount: number;
  missedCount: number;
  skippedCount: number;
  score: number;
  lastDose: string;
};

function buildReportText(
  medication: Medication,
  stats: ReportStats,
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
⚫ از دست رفته: ${stats.missedCount}
⚪ رد شده: ${stats.skippedCount}
🕒 آخرین دوز: ${stats.lastDose}

📝 دوزهای اخیر:
${recentLines}

🔗 ساخته‌شده با یادآور دارو
${window.location.origin}`;
}

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
    console.warn('SHA-256 fallback', error);
  }

  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

async function buildSignedReport(
  medication: Medication,
  stats: ReportStats,
  recentHistory: HistoryRecord[]
): Promise<{ text: string; hash: string }> {
  const baseText = buildReportText(medication, stats, recentHistory);
  const hash = await computeHash(baseText);
  const signedText = `${baseText}\n\n🔐 اثر انگشت متن (SHA-256):\n${hash}`;
  return { text: signedText, hash };
}

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
    const missedCount = sortedHistory.filter(h => h.status === 'missed').length;
    const skippedCount = sortedHistory.filter(h => h.status === 'skipped').length;
    const scored = onTimeCount + earlyCount + lateCount + missedCount;
    const score = scored > 0 ? Math.round(((onTimeCount + earlyCount) / scored) * 100) : 0;
    const lastDose = total > 0 ? formatDateTime(sortedHistory[0].takenAt) : '—';

    return { total, onTimeCount, earlyCount, lateCount, missedCount, skippedCount, score, lastDose };
  }, [sortedHistory]);

  const baseReportText = useMemo(() => {
    return buildReportText(medication, stats, recentHistory);
  }, [medication, stats, recentHistory]);

  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isHashing, setIsHashing] = useState(false);
  const [reportHash, setReportHash] = useState<string>('');

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

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const prevPadRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = prevPadRight;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 2800);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const showFeedback = (type: 'success' | 'error' | 'info', message: string) => {
    setFeedback({ type, message });
  };

  const handleCopyReport = async () => {
    setIsCopying(true);
    setIsHashing(true);
    try {
      const { text } = await buildSignedReport(medication, stats, recentHistory);
      const copied = await copyTextToClipboard(text);
      if (copied) {
        showFeedback('success', '📋 گزارش با اثر انگشت کپی شد.');
      } else {
        showFeedback('error', '⚠️ امکان کپی گزارش وجود نداشت.');
      }
    } catch (error) {
      console.error('copy error:', error);
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
      showFeedback('success', '⬇️ گزارش با اثر انگشت دانلود شد.');
    } catch (error) {
      console.error('download error:', error);
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
        console.warn('native share unavailable:', pluginError);
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
        showFeedback('info', '📋 اشتراک در دسترس نیست. گزارش کپی شد.');
        return;
      }

      const filename = `${sanitizeFileName(medication.name || 'دارو')}-گزارش.txt`;
      downloadTextFile(filename, text);
      showFeedback('info', '⬇️ اشتراک در دسترس نیست. گزارش دانلود شد.');
    } catch (error) {
      if (isUserCancelledShare(error)) {
        return;
      }
      console.error('share error:', error);
      try {
        const { text } = await buildSignedReport(medication, stats, recentHistory);
        const copied = await copyTextToClipboard(text);
        if (copied) {
          showFeedback('info', '📋 اشتراک ناموفق. گزارش کپی شد.');
          return;
        }
        const filename = `${sanitizeFileName(medication.name || 'دارو')}-گزارش.txt`;
        downloadTextFile(filename, text);
        showFeedback('info', '⬇️ اشتراک ناموفق. گزارش دانلود شد.');
      } catch (fallbackError) {
        console.error('share fallback error:', fallbackError);
        showFeedback('error', '⚠️ امکان اشتراک گزارش وجود نداشت.');
      }
    } finally {
      setIsSharing(false);
      setIsHashing(false);
    }
  };

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-950/80 p-4 pb-[calc(1rem+var(--sab))] pt-[calc(1rem+var(--sat))] backdrop-blur-sm animate-fade-in touch-manipulation"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        style={{ paddingLeft: 'max(1rem, var(--sal))', paddingRight: 'max(1rem, var(--sar))' }}
      >
        <div
          className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl animate-zoom-in custom-scrollbar sm:p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-5 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 id="modal-title" className="flex items-center gap-2 text-xl font-bold text-white">
                📊 گزارش {medication.name}
              </h2>
              <p className="mt-1 text-xs text-gray-400">خلاصه قابل اشتراک برای پزشک یا مراقب</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="tap-target flex shrink-0 items-center justify-center rounded-xl bg-gray-700/50 p-2.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white active:scale-95 touch-manipulation"
              title="بستن"
              aria-label="بستن پنجره"
            >
              ✕
            </button>
          </div>

          {feedback && (
            <div
              aria-live="polite"
              className={`mb-4 rounded-xl border px-4 py-3 text-sm leading-relaxed ${
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

          <div className="mb-4 rounded-xl border border-gray-700 bg-gray-900 p-4">
            <p className="mb-1 text-xs text-gray-400">🔐 اثر انگشت متن (SHA-256)</p>
            <p className="break-all font-mono text-sm text-cyan-300">
              {isHashing ? 'در حال محاسبه...' : reportHash}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-gray-500">
              این هش از روی محتوای گزارش محاسبه شده است. هرگونه تغییر در متن گزارش باعث عدم تطابق هش می‌شود.
            </p>
          </div>

          <div className="mb-4 flex items-center justify-between rounded-xl border border-gray-700 bg-gray-900 p-4">
            <div>
              <p className="mb-1 text-sm text-gray-400">پایبندی کلی</p>
              <p className="text-sm text-gray-200">{getAdherenceLabel(stats.score, stats.total)}</p>
            </div>
            <div
              className={`text-3xl font-bold ${stats.total === 0 ? 'text-gray-400' : stats.score >= 80 ? 'text-green-400' : stats.score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}
            >
              {stats.total > 0 ? `${stats.score}٪` : '-'}
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-3">
            {[
              ['به‌موقع', stats.onTimeCount, 'text-green-300'],
              ['زودتر', stats.earlyCount, 'text-yellow-300'],
              ['دیرتر', stats.lateCount, 'text-red-300'],
              ['از دست رفته', stats.missedCount, 'text-rose-300'],
              ['رد شده', stats.skippedCount, 'text-gray-300'],
            ].map(([label, count, color]) => (
              <div key={label as string} className="rounded-xl border border-gray-700 bg-gray-900 p-3">
                <p className="text-gray-400">{label as string}</p>
                <p className={`mt-1 text-xl font-bold ${color as string}`}>{count as number}</p>
              </div>
            ))}
          </div>

          <div className="mb-4 rounded-xl border border-gray-700 bg-gray-900 p-4">
            <p className="mb-3 text-sm font-semibold text-gray-300">دوزهای اخیر</p>
            {recentHistory.length > 0 ? (
              <div className="space-y-2">
                {recentHistory.map((record) => {
                  const status = getStatusDisplay(record.status);
                  return (
                    <div
                      key={record.id ?? `${record.takenAt}-${record.status}`}
                      className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${status.bg}`}
                    >
                      <span className="text-xs text-gray-300">{formatDateTime(record.takenAt)}</span>
                      <span className={`text-xs font-medium ${status.color}`}>
                        {status.icon} {status.text}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500">هنوز دوزی ثبت نشده است.</p>
            )}
          </div>

          <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <button
              type="button"
              onClick={handleShareReport}
              disabled={isSharing || isHashing}
              className="tap-target rounded-xl bg-blue-600 px-4 py-3.5 text-[14px] font-bold text-white transition-colors duration-200 hover:bg-blue-500 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 touch-manipulation"
            >
              {isSharing ? 'در حال اشتراک...' : '📤 اشتراک'}
            </button>
            <button
              type="button"
              onClick={handleCopyReport}
              disabled={isCopying || isHashing}
              className="tap-target rounded-xl bg-cyan-600 px-4 py-3.5 text-[14px] font-bold text-white transition-colors duration-200 hover:bg-cyan-500 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 touch-manipulation"
            >
              {isCopying ? 'در حال کپی...' : '📋 کپی'}
            </button>
            <button
              type="button"
              onClick={handleDownloadReport}
              disabled={isDownloading || isHashing}
              className="tap-target rounded-xl bg-emerald-600 px-4 py-3.5 text-[14px] font-bold text-white transition-colors duration-200 hover:bg-emerald-500 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 touch-manipulation"
            >
              {isDownloading ? 'در حال آماده‌سازی...' : '⬇️ دانلود'}
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="tap-target w-full rounded-xl bg-gray-700 px-4 py-3.5 text-[15px] font-bold text-white transition-colors duration-300 hover:bg-gray-600 active:scale-[0.97] touch-manipulation"
          >
            بستن گزارش
          </button>
        </div>
      </div>
    </Portal>
  );
}
