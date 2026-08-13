import { useEffect, useMemo, useState } from 'react';
import { Share } from '@capacitor/share';
import { Medication, HistoryRecord } from '../db/database';

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

  const timeString = date.toLocaleTimeString('fa-IR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isToday) {
    return `امروز ساعت ${timeString}`;
  }

  return `${date.toLocaleDateString('fa-IR')} - ${timeString}`;
}

function getStatusDisplay(status: HistoryRecord['status']) {
  switch (status) {
    case 'on-time':
      return {
        icon: '🟢',
        text: 'به‌موقع',
        color: 'text-green-400',
        bg: 'bg-green-400/10',
      };
    case 'early':
      return {
        icon: '🟡',
        text: 'زودتر',
        color: 'text-yellow-400',
        bg: 'bg-yellow-400/10',
      };
    case 'late':
      return {
        icon: '🔴',
        text: 'دیرتر',
        color: 'text-red-400',
        bg: 'bg-red-400/10',
      };
    default:
      return {
        icon: '⚪',
        text: 'نامشخص',
        color: 'text-gray-400',
        bg: 'bg-gray-400/10',
      };
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
    .replace(/\s+/g, '-');
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
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
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
  const recentLines =
    recentHistory.length > 0
      ? recentHistory
          .map(record => {
            const status = getStatusDisplay(record.status);
            return `- ${formatDateTime(record.takenAt)} — ${status.text}`;
          })
          .join('\n')
      : '- هنوز دوزی ثبت نشده';

  const adherenceText = stats.total > 0 ? `${stats.score}٪` : 'بدون داده';

  return `📊 گزارش مصرف دارو

💊 نام: ${medication.name}
⚖️ دوز: ${medication.dosage}
⭐ پایبندی: ${adherenceText}
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

function isUserCancelledShare(error: unknown) {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    error.name === 'AbortError' ||
    message.includes('abort') ||
    message.includes('cancel') ||
    message.includes('canceled')
  );
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
    const score = total > 0 ? Math.round((onTimeCount / total) * 100) : 0;
    const lastDose = total > 0 ? formatDateTime(sortedHistory[0].takenAt) : '—';

    return {
      total,
      onTimeCount,
      earlyCount,
      lateCount,
      score,
      lastDose,
    };
  }, [sortedHistory]);

  const reportText = useMemo(() => {
    return buildReportText(medication, stats, recentHistory);
  }, [medication, stats, recentHistory]);

  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => {
      setFeedback(null);
    }, 2800);

    return () => window.clearTimeout(timer);
  }, [feedback]);

  const showFeedback = (type: 'success' | 'error' | 'info', message: string) => {
    setFeedback({ type, message });
  };

  const handleCopyReport = async () => {
    setIsCopying(true);
    try {
      const copied = await copyTextToClipboard(reportText);
      if (copied) {
        showFeedback('success', '📋 گزارش در حافظه کپی شد.');
      } else {
        showFeedback('error', '⚠️ امکان کپی گزارش وجود نداشت.');
      }
    } catch (error) {
      console.error('خطای کپی:', error);
      showFeedback('error', '⚠️ امکان کپی گزارش وجود نداشت.');
    } finally {
      setIsCopying(false);
    }
  };

  const handleDownloadReport = async () => {
    setIsDownloading(true);
    try {
      const filename = `${sanitizeFileName(medication.name || 'دارو')}-گزارش.txt`;
      downloadTextFile(filename, reportText);
      showFeedback('success', '⬇️ گزارش با موفقیت دانلود شد.');
    } catch (error) {
      console.error('خطای دانلود:', error);
      showFeedback('error', '⚠️ امکان دانلود گزارش وجود نداشت.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleShareReport = async () => {
    setIsSharing(true);

    try {
      try {
        const canShare = await Share.canShare();

        if (canShare.value) {
          await Share.share({
            title: `گزارش مصرف ${medication.name}`,
            text: reportText,
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
          text: reportText,
          url: window.location.origin,
        });

        showFeedback('success', '📤 منوی اشتراک باز شد.');
        return;
      }

      const copied = await copyTextToClipboard(reportText);
      if (copied) {
        showFeedback('info', '📋 اشتراک در دسترس نیست. گزارش کپی شد.');
        return;
      }

      const filename = `${sanitizeFileName(medication.name || 'دارو')}-گزارش.txt`;
      downloadTextFile(filename, reportText);
      showFeedback('info', '⬇️ اشتراک در دسترس نیست. گزارش دانلود شد.');
    } catch (error) {
      if (isUserCancelledShare(error)) {
        setIsSharing(false);
        return;
      }

      console.error('خطای اشتراک:', error);

      try {
        const copied = await copyTextToClipboard(reportText);
        if (copied) {
          showFeedback('info', '📋 اشتراک ناموفق. گزارش کپی شد.');
          return;
        }

        const filename = `${sanitizeFileName(medication.name || 'دارو')}-گزارش.txt`;
        downloadTextFile(filename, reportText);
        showFeedback('info', '⬇️ اشتراک ناموفق. گزارش دانلود شد.');
      } catch (fallbackError) {
        console.error('خطای جایگزین اشتراک:', fallbackError);
        showFeedback('error', '⚠️ امکان اشتراک گزارش وجود نداشت.');
      }
    } finally {
      setIsSharing(false);
    }
  };

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
            onClick={onClose}
            className="flex items-center justify-center rounded-lg bg-gray-700/50 p-2.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
            title="بستن"
            aria-label="بستن پنجره"
          >
            ✕
          </button>
        </div>

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

        <div className="mb-4 flex items-center justify-between rounded-xl border border-gray-700 bg-gray-900 p-4">
          <div>
            <p className="mb-1 text-sm text-gray-400">پایبندی کلی</p>
            <p className="text-sm text-gray-200">
              {getAdherenceLabel(stats.score, stats.total)}
            </p>
          </div>

          <div
            className={`text-3xl font-bold ${
              stats.total === 0
                ? 'text-gray-400'
                : stats.score >= 80
                ? 'text-green-400'
                : stats.score >= 50
                ? 'text-yellow-400'
                : 'text-red-400'
            }`}
          >
            {stats.total > 0 ? `${stats.score}٪` : '-'}
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-gray-700 bg-gray-900 p-4">
            <p className="mb-1 text-xs text-gray-400">دوز</p>
            <p className="text-sm font-semibold text-white">{medication.dosage}</p>
          </div>

          <div className="rounded-xl border border-gray-700 bg-gray-900 p-4">
            <p className="mb-1 text-xs text-gray-400">دوزهای ثبت‌شده</p>
            <p className="text-sm font-semibold text-white">{stats.total}</p>
          </div>

          <div className="col-span-2 rounded-xl border border-gray-700 bg-gray-900 p-4">
            <p className="mb-1 text-xs text-gray-400">آخرین دوز</p>
            <p className="text-sm font-semibold text-white">{stats.lastDose}</p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-center">
            <div className="text-lg">🟢</div>
            <div className="text-sm font-bold text-green-300">{stats.onTimeCount}</div>
            <div className="text-xs text-green-200/70">به‌موقع</div>
          </div>

          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-center">
            <div className="text-lg">🟡</div>
            <div className="text-sm font-bold text-yellow-300">{stats.earlyCount}</div>
            <div className="text-xs text-yellow-200/70">زودتر</div>
          </div>

          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-center">
            <div className="text-lg">🔴</div>
            <div className="text-sm font-bold text-red-300">{stats.lateCount}</div>
            <div className="text-xs text-red-200/70">دیرتر</div>
          </div>
        </div>

        <div className="mb-6 space-y-3 pr-1">
          <h3 className="mb-2 text-sm font-semibold text-gray-400">
            آخرین {RECENT_DOSES_LIMIT} دوز:
          </h3>

          {recentHistory.length === 0 ? (
            <div className="rounded-xl border border-gray-700 bg-gray-900 py-6 text-center text-sm text-gray-500">
              هنوز دوزی ثبت نشده.
              <br />
              تایمر را شروع کنید تا تاریخچه ساخته شود.
            </div>
          ) : (
            recentHistory.map((record, index) => {
              const display = getStatusDisplay(record.status);

              return (
                <div
                  key={`${record.takenAt}-${index}`}
                  className={`flex items-center justify-between rounded-lg border border-gray-700/50 p-3 ${display.bg}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl" aria-hidden="true">
                      {display.icon}
                    </span>
                    <span className="text-sm font-medium text-gray-200">
                      {formatDateTime(record.takenAt)}
                    </span>
                  </div>

                  <span className={`text-sm font-bold ${display.color}`}>
                    {display.text}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            onClick={handleShareReport}
            disabled={isSharing}
            className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white transition-colors duration-200 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSharing ? 'در حال اشتراک...' : '📤 اشتراک'}
          </button>

          <button
            onClick={handleCopyReport}
            disabled={isCopying}
            className="rounded-xl bg-cyan-600 px-4 py-3 font-bold text-white transition-colors duration-200 hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCopying ? 'در حال کپی...' : '📋 کپی'}
          </button>

          <button
            onClick={handleDownloadReport}
            disabled={isDownloading}
            className="rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white transition-colors duration-200 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDownloading ? 'در حال آماده‌سازی...' : '⬇️ دانلود'}
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full rounded-lg bg-gray-700 px-4 py-3 font-bold text-white transition-colors duration-300 hover:bg-gray-600"
        >
          بستن گزارش
        </button>
      </div>
    </div>
  );
}
