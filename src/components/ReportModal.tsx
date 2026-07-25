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

  const timeString = date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isToday) {
    return `Today at ${timeString}`;
  }

  return `${date.toLocaleDateString()} - ${timeString}`;
}

function getStatusDisplay(status: HistoryRecord['status']) {
  switch (status) {
    case 'on-time':
      return {
        icon: '🟢',
        text: 'On Time',
        color: 'text-green-400',
        bg: 'bg-green-400/10',
      };
    case 'early':
      return {
        icon: '🟡',
        text: 'Early',
        color: 'text-yellow-400',
        bg: 'bg-yellow-400/10',
      };
    case 'late':
      return {
        icon: '🔴',
        text: 'Late',
        color: 'text-red-400',
        bg: 'bg-red-400/10',
      };
    default:
      return {
        icon: '⚪',
        text: 'Unknown',
        color: 'text-gray-400',
        bg: 'bg-gray-400/10',
      };
  }
}

function getAdherenceLabel(score: number, total: number) {
  if (total === 0) return 'No data yet';
  if (score >= 80) return '🌟 Excellent';
  if (score >= 50) return '👍 Good';
  return '⚠️ Needs Attention';
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
      : '- No doses recorded yet';

  const adherenceText = stats.total > 0 ? `${stats.score}%` : 'No data';

  return `📊 Medication Report

💊 Name: ${medication.name}
⚖️ Dosage: ${medication.dosage}
⭐ Adherence: ${adherenceText}
📦 Recorded Doses: ${stats.total}
🟢 On Time: ${stats.onTimeCount}
🟡 Early: ${stats.earlyCount}
🔴 Late: ${stats.lateCount}
🕒 Last Dose: ${stats.lastDose}

📝 Recent Doses:
${recentLines}

🔗 Generated with MediReminder
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
    const lastDose = total > 0 ? formatDateTime(sortedHistory[0].takenAt) : 'N/A';

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
        showFeedback('success', '📋 Report copied to clipboard.');
      } else {
        showFeedback('error', '⚠️ Unable to copy report.');
      }
    } catch (error) {
      console.error('Copy failed:', error);
      showFeedback('error', '⚠️ Unable to copy report.');
    } finally {
      setIsCopying(false);
    }
  };

  const handleDownloadReport = async () => {
    setIsDownloading(true);
    try {
      const filename = `${sanitizeFileName(medication.name || 'medication')}-report.txt`;
      downloadTextFile(filename, reportText);
      showFeedback('success', '⬇️ Report downloaded successfully.');
    } catch (error) {
      console.error('Download failed:', error);
      showFeedback('error', '⚠️ Unable to download report.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleShareReport = async () => {
    setIsSharing(true);

    try {
      // 1) تلاش برای اشتراک‌گذاری از طریق Capacitor Share
      try {
        const canShare = await Share.canShare();

        if (canShare.value) {
          await Share.share({
            title: `${medication.name} - Medication Report`,
            text: reportText,
            url: window.location.origin,
            dialogTitle: 'Share medication report',
          });

          showFeedback('success', '📤 Share menu opened.');
          return;
        }
      } catch (pluginError) {
        console.warn('Capacitor Share not available, falling back...', pluginError);
      }

      // 2) تلاش برای Web Share API
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({
          title: `${medication.name} - Medication Report`,
          text: reportText,
          url: window.location.origin,
        });

        showFeedback('success', '📤 Share menu opened.');
        return;
      }

      // 3) fallback: کپی
      const copied = await copyTextToClipboard(reportText);
      if (copied) {
        showFeedback('info', '📋 Sharing unavailable. Report copied instead.');
        return;
      }

      // 4) fallback نهایی: دانلود
      const filename = `${sanitizeFileName(medication.name || 'medication')}-report.txt`;
      downloadTextFile(filename, reportText);
      showFeedback('info', '⬇️ Sharing unavailable. Report downloaded instead.');
    } catch (error) {
      if (isUserCancelledShare(error)) {
        setIsSharing(false);
        return;
      }

      console.error('Share failed:', error);

      try {
        const copied = await copyTextToClipboard(reportText);
        if (copied) {
          showFeedback('info', '📋 Share failed. Report copied instead.');
          return;
        }

        const filename = `${sanitizeFileName(medication.name || 'medication')}-report.txt`;
        downloadTextFile(filename, reportText);
        showFeedback('info', '⬇️ Share failed. Report downloaded instead.');
      } catch (fallbackError) {
        console.error('Fallback share failed:', fallbackError);
        showFeedback('error', '⚠️ Unable to share the report.');
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
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 id="modal-title" className="flex items-center gap-2 text-xl font-bold text-white">
              📊 {medication.name} Report
            </h2>
            <p className="mt-1 text-xs text-gray-400">
              Shareable summary for doctor or caregiver
            </p>
          </div>

          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-lg bg-gray-700/50 p-2.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
            title="Close"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Feedback */}
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

        {/* Score Card */}
        <div className="mb-4 flex items-center justify-between rounded-xl border border-gray-700 bg-gray-900 p-4">
          <div>
            <p className="mb-1 text-sm text-gray-400">Overall Adherence</p>
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
            {stats.total > 0 ? `${stats.score}%` : '-'}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-gray-700 bg-gray-900 p-4">
            <p className="mb-1 text-xs text-gray-400">Dosage</p>
            <p className="text-sm font-semibold text-white">{medication.dosage}</p>
          </div>

          <div className="rounded-xl border border-gray-700 bg-gray-900 p-4">
            <p className="mb-1 text-xs text-gray-400">Recorded Doses</p>
            <p className="text-sm font-semibold text-white">{stats.total}</p>
          </div>

          <div className="col-span-2 rounded-xl border border-gray-700 bg-gray-900 p-4">
            <p className="mb-1 text-xs text-gray-400">Last Dose</p>
            <p className="text-sm font-semibold text-white">{stats.lastDose}</p>
          </div>
        </div>

        {/* Counters */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-center">
            <div className="text-lg">🟢</div>
            <div className="text-sm font-bold text-green-300">{stats.onTimeCount}</div>
            <div className="text-xs text-green-200/70">On Time</div>
          </div>

          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-center">
            <div className="text-lg">🟡</div>
            <div className="text-sm font-bold text-yellow-300">{stats.earlyCount}</div>
            <div className="text-xs text-yellow-200/70">Early</div>
          </div>

          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-center">
            <div className="text-lg">🔴</div>
            <div className="text-sm font-bold text-red-300">{stats.lateCount}</div>
            <div className="text-xs text-red-200/70">Late</div>
          </div>
        </div>

        {/* History */}
        <div className="mb-6 space-y-3 pr-1">
          <h3 className="mb-2 text-sm font-semibold text-gray-400">
            Last {RECENT_DOSES_LIMIT} Doses:
          </h3>

          {recentHistory.length === 0 ? (
            <div className="rounded-xl border border-gray-700 bg-gray-900 py-6 text-center text-sm text-gray-500">
              No doses recorded yet.
              <br />
              Start the timer to track your history.
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

        {/* Actions */}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            onClick={handleShareReport}
            disabled={isSharing}
            className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white transition-colors duration-200 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSharing ? 'Sharing...' : '📤 Share'}
          </button>

          <button
            onClick={handleCopyReport}
            disabled={isCopying}
            className="rounded-xl bg-cyan-600 px-4 py-3 font-bold text-white transition-colors duration-200 hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCopying ? 'Copying...' : '📋 Copy'}
          </button>

          <button
            onClick={handleDownloadReport}
            disabled={isDownloading}
            className="rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white transition-colors duration-200 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDownloading ? 'Preparing...' : '⬇️ Download'}
          </button>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="w-full rounded-lg bg-gray-700 px-4 py-3 font-bold text-white transition-colors duration-300 hover:bg-gray-600"
        >
          Close Report
        </button>
      </div>
    </div>
  );
}
