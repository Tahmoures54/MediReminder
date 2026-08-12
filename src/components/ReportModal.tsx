import { useEffect, useMemo, useState } from 'react';
import { Share } from '@capacitor/share';
import { Medication, HistoryRecord } from '../db/database';

interface ReportModalProps {
  medication: Medication;
  onClose: () => void;
}

type FeedbackState =
  | { type: 'success' | 'error' | 'info'; message: string }
  | null;

const RECENT_DOSES_LIMIT = 8;

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

function toPersianDigits(value: string | number): string {
  return String(value).replace(/\d/g, d => PERSIAN_DIGITS[Number(d)]);
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const timeString = date.toLocaleTimeString('fa-IR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const isSameDay = (a: Date, b: Date) =>
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear();

  if (isSameDay(date, today)) return `امروز ساعت ${timeString}`;
  if (isSameDay(date, yesterday)) return `دیروز ساعت ${timeString}`;

  const dateString = date.toLocaleDateString('fa-IR');
  return `${dateString} — ${timeString}`;
}

function getStatusDisplay(status: HistoryRecord['status']) {
  switch (status) {
    case 'on-time':
      return { icon: '🟢', text: 'به‌موقع', color: 'text-green-400', bg: 'bg-green-400/10' };
    case 'early':
      return { icon: '🟡', text: 'زودتر', color: 'text-yellow-400', bg: 'bg-yellow-400/10' };
    case 'late':
      return { icon: '🔴', text: 'با تأخیر', color: 'text-red-400', bg: 'bg-red-400/10' };
    default:
      return { icon: '⚪', text: 'نامشخص', color: 'text-gray-400', bg: 'bg-gray-400/10' };
  }
}

function getAdherenceInfo(score: number, total: number) {
  if (total === 0) {
    return {
      label: 'هنوز داده‌ای ثبت نشده',
      tip: 'با زدن «شروع» بعد از هر دوز، تاریخچه و امتیاز پایبندی ساخته می‌شود.',
      emoji: '📭',
    };
  }
  if (score >= 90) {
    return {
      label: 'عالی — الگوی منظم',
      tip: 'عالی است! همین نظم را حفظ کنید. مصرف منظم دارو اثر درمان را بیشتر می‌کند.',
      emoji: '🌟',
    };
  }
  if (score >= 70) {
    return {
      label: 'خوب — قابل بهبود',
      tip: 'روند خوبی دارید. برای دوزهای نزدیک به زمان، یادآور را فعال نگه دارید.',
      emoji: '👍',
    };
  }
  if (score >= 40) {
    return {
      label: 'نیاز به توجه',
      tip: 'تأخیر زیاد می‌تواند اثر دارو را کم کند. زمان‌های ثابت روزانه انتخاب کنید.',
      emoji: '⚠️',
    };
  }
  return {
    label: 'نیاز به مراقبت جدی',
    tip: 'لطفاً با پزشک یا داروساز خود مشورت کنید و برنامه مصرف را ساده‌تر کنید.',
    emoji: '🩺',
  };
}

/** تعداد مصرف‌های به‌موقع پشت‌سرهم از جدیدترین */
function computeStreak(history: HistoryRecord[]): number {
  let streak = 0;
  for (const record of history) {
    if (record.status === 'on-time') streak += 1;
    else break;
  }
  return streak;
}

function sanitizeFileName(name: string) {
  return name
    .replace(/[^\u0600-\u06FFa-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-') || 'گزارش-دارو';
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
    streak: number;
  },
  recentHistory: HistoryRecord[]
) {
  const recentLines =
    recentHistory.length > 0
      ? recentHistory
          .map(record => {
            const status = getStatusDisplay(record.status);
            return `• ${formatDateTime(record.takenAt)} — ${status.text}`;
          })
          .join('\n')
      : '• هنوز دوزی ثبت نشده';

  const adherenceText = stats.total > 0 ? `${toPersianDigits(stats.score)}٪` : 'بدون داده';

  return `📊 گزارش مصرف دارو — یادآور هوشمند دارو

💊 نام: ${medication.name}
⚖️ دوز: ${medication.dosage}
⭐ پایبندی به‌موقع: ${adherenceText}
🔥 زنجیره به‌موقع اخیر: ${toPersianDigits(stats.streak)}
📦 تعداد ثبت‌شده: ${toPersianDigits(stats.total)}
🟢 به‌موقع: ${toPersianDigits(stats.onTimeCount)}
🟡 زودتر: ${toPersianDigits(stats.earlyCount)}
🔴 با تأخیر: ${toPersianDigits(stats.lateCount)}
🕒 آخرین مصرف: ${stats.lastDose}

📝 مصرف‌های اخیر:
${recentLines}

— تولیدشده با «یادآور هوشمند دارو»`;
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

  const sortedHistory = useMemo(
    () => [...history].sort((a, b) => b.takenAt - a.takenAt),
    [history]
  );

  const recentHistory = useMemo(
    () => sortedHistory.slice(0, RECENT_DOSES_LIMIT),
    [sortedHistory]
  );

  const stats = useMemo(() => {
    const total = sortedHistory.length;
    const onTimeCount = sortedHistory.filter(h => h.status === 'on-time').length;
    const earlyCount = sortedHistory.filter(h => h.status === 'early').length;
    const lateCount = sortedHistory.filter(h => h.status === 'late').length;
    const score = total > 0 ? Math.round((onTimeCount / total) * 100) : 0;
    const lastDose = total > 0 ? formatDateTime(sortedHistory[0].takenAt) : 'ثبت نشده';
    const streak = computeStreak(sortedHistory);

    return { total, onTimeCount, earlyCount, lateCount, score, lastDose, streak };
  }, [sortedHistory]);

  const adherence = useMemo(
    () => getAdherenceInfo(stats.score, stats.total),
    [stats.score, stats.total]
  );

  const reportText = useMemo(
    () => buildReportText(medication, stats, recentHistory),
    [medication, stats, recentHistory]
  );

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
    const timer = window.setTimeout(() => setFeedback(null), 2800);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const showFeedback = (type: 'success' | 'error' | 'info', message: string) => {
    setFeedback({ type, message });
  };

  const handleCopyReport = async () => {
    setIsCopying(true);
    try {
      const copied = await copyTextToClipboard(reportText);
      showFeedback(
        copied ? 'success' : 'error',
        copied ? '📋 گزارش در حافظه کپی شد.' : '⚠️ کپی گزارش ممکن نشد.'
      );
    } catch {
      showFeedback('error', '⚠️ کپی گزارش ممکن نشد.');
    } finally {
      setIsCopying(false);
    }
  };

  const handleDownloadReport = async () => {
    setIsDownloading(true);
    try {
      const filename = `گزارش-${sanitizeFileName(medication.name)}.txt`;
      downloadTextFile(filename, reportText);
      showFeedback('success', '⬇️ گزارش با موفقیت ذخیره شد.');
    } catch {
      showFeedback('error', '⚠️ ذخیره گزارش ممکن نشد.');
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
            dialogTitle: 'اشتراک‌گذاری گزارش دارو',
          });
          showFeedback('success', '📤 منوی اشتراک باز شد.');
          return;
        }
      } catch {}

      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({
          title: `گزارش مصرف ${medication.name}`,
          text: reportText,
        });
        showFeedback('success', '📤 منوی اشتراک باز شد.');
        return;
      }

      const copied = await copyTextToClipboard(reportText);
      if (copied) {
        showFeedback('info', '📋 اشتراک در دسترس نبود؛ گزارش کپی شد.');
        return;
      }

      downloadTextFile(`گزارش-${sanitizeFileName(medication.name)}.txt`, reportText);
      showFeedback('info', '⬇️ اشتراک ممکن نشد؛ گزارش ذخیره شد.');
    } catch (error) {
      if (isUserCancelledShare(error)) {
        setIsSharing(false);
        return;
      }
      try {
        const copied = await copyTextToClipboard(reportText);
        showFeedback(
          copied ? 'info' : 'error',
          copied ? '📋 اشتراک ناموفق بود؛ گزارش کپی شد.' : '⚠️ اشتراک گزارش ممکن نشد.'
        );
      } catch {
        showFeedback('error', '⚠️ اشتراک گزارش ممکن نشد.');
      }
    } finally {
      setIsSharing(false);
    }
  };

  const scoreColor =
    stats.total === 0
      ? 'text-gray-400'
      : stats.score >= 80
      ? 'text-green-400'
      : stats.score >= 50
      ? 'text-yellow-400'
      : 'text-red-400';

  const barColor =
    stats.total === 0
      ? 'bg-gray-600'
      : stats.score >= 80
      ? 'bg-gradient-to-l from-green-400 to-emerald-500'
      : stats.score >= 50
      ? 'bg-gradient-to-l from-yellow-400 to-amber-500'
      : 'bg-gradient-to-l from-red-400 to-orange-500';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      dir="rtl"
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-700 bg-gray-800 p-6 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* سربرگ */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 id="modal-title" className="flex items-center gap-2 text-xl font-bold text-white">
              📊 گزارش «{medication.name}»
            </h2>
            <p className="mt-1 text-xs text-gray-400">
              خلاصه قابل ارسال برای پزشک یا مراقب
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-lg bg-gray-700/50 p-2.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
            aria-label="بستن"
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

        {/* کارت پایبندی */}
        <div className="mb-4 rounded-xl border border-gray-700 bg-gray-900 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="mb-1 text-sm text-gray-400">پایبندی به‌موقع</p>
              <p className="text-sm text-gray-200">
                {adherence.emoji} {adherence.label}
              </p>
            </div>
            <div className={`text-3xl font-bold ${scoreColor}`}>
              {stats.total > 0 ? `${toPersianDigits(stats.score)}٪` : '—'}
            </div>
          </div>

          {/* نوار پیشرفت بصری */}
          <div className="mb-3 h-2.5 w-full overflow-hidden rounded-full bg-gray-700">
            <div
              className={`h-full transition-all duration-700 ${barColor}`}
              style={{ width: `${stats.total > 0 ? stats.score : 0}%` }}
            />
          </div>

          {/* نکته سلامتی */}
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2.5 text-xs leading-relaxed text-cyan-100/90">
            💡 {adherence.tip}
          </div>
        </div>

        {/* زنجیره موفقیت */}
        {stats.streak > 0 && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-orange-500/25 bg-orange-500/10 px-4 py-3">
            <span className="text-2xl">🔥</span>
            <div>
              <p className="text-sm font-bold text-orange-200">
                {toPersianDigits(stats.streak)} مصرف به‌موقع پشت‌سرهم
              </p>
              <p className="text-xs text-orange-200/70">ادامه دهید؛ نظم یعنی اثر بهتر درمان</p>
            </div>
          </div>
        )}

        {/* آمار سریع */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-gray-700 bg-gray-900 p-4">
            <p className="mb-1 text-xs text-gray-400">دوز</p>
            <p className="text-sm font-semibold text-white">{medication.dosage}</p>
          </div>
          <div className="rounded-xl border border-gray-700 bg-gray-900 p-4">
            <p className="mb-1 text-xs text-gray-400">تعداد ثبت‌شده</p>
            <p className="text-sm font-semibold text-white">{toPersianDigits(stats.total)}</p>
          </div>
          <div className="col-span-2 rounded-xl border border-gray-700 bg-gray-900 p-4">
            <p className="mb-1 text-xs text-gray-400">آخرین مصرف</p>
            <p className="text-sm font-semibold text-white">{stats.lastDose}</p>
          </div>
        </div>

        {/* شمارنده‌ها */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-center">
            <div className="text-lg">🟢</div>
            <div className="text-sm font-bold text-green-300">{toPersianDigits(stats.onTimeCount)}</div>
            <div className="text-xs text-green-200/70">به‌موقع</div>
          </div>
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-center">
            <div className="text-lg">🟡</div>
            <div className="text-sm font-bold text-yellow-300">{toPersianDigits(stats.earlyCount)}</div>
            <div className="text-xs text-yellow-200/70">زودتر</div>
          </div>
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-center">
            <div className="text-lg">🔴</div>
            <div className="text-sm font-bold text-red-300">{toPersianDigits(stats.lateCount)}</div>
            <div className="text-xs text-red-200/70">با تأخیر</div>
          </div>
        </div>

        {/* تاریخچه */}
        <div className="mb-6 space-y-3">
          <h3 className="mb-2 text-sm font-semibold text-gray-400">
            {toPersianDigits(RECENT_DOSES_LIMIT)} مصرف اخیر:
          </h3>

          {recentHistory.length === 0 ? (
            <div className="rounded-xl border border-gray-700 bg-gray-900 py-6 text-center text-sm text-gray-500">
              هنوز دوزی ثبت نشده.
              <br />
              بعد از مصرف، «شروع» را بزنید تا تاریخچه ساخته شود.
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
                    <span className="text-xl" aria-hidden="true">{display.icon}</span>
                    <span className="text-sm font-medium text-gray-200">
                      {formatDateTime(record.takenAt)}
                    </span>
                  </div>
                  <span className={`text-sm font-bold ${display.color}`}>{display.text}</span>
                </div>
              );
            })
          )}
        </div>

        {/* اقدامات */}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            onClick={handleShareReport}
            disabled={isSharing}
            className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
          >
            {isSharing ? 'در حال اشتراک...' : '📤 اشتراک'}
          </button>
          <button
            onClick={handleCopyReport}
            disabled={isCopying}
            className="rounded-xl bg-cyan-600 px-4 py-3 font-bold text-white transition-colors hover:bg-cyan-500 disabled:opacity-60"
          >
            {isCopying ? 'در حال کپی...' : '📋 کپی'}
          </button>
          <button
            onClick={handleDownloadReport}
            disabled={isDownloading}
            className="rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white transition-colors hover:bg-emerald-500 disabled:opacity-60"
          >
            {isDownloading ? 'در حال آماده‌سازی...' : '⬇️ ذخیره'}
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full rounded-lg bg-gray-700 px-4 py-3 font-bold text-white transition-colors hover:bg-gray-600"
        >
          بستن گزارش
        </button>
      </div>
    </div>
  );
}
