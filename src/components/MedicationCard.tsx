import { Medication } from '../db/database';
import { formatTime } from '../utils/audio';

interface MedicationCardProps {
  medication: Medication;
  index: number;
  onToggle: () => void;
  onReset: () => void;
  onDelete: () => void;
  onShowReport: () => void;
}

const LOW_STOCK_THRESHOLD = 5;

export function MedicationCard({
  medication,
  index,
  onToggle,
  onReset,
  onDelete,
  onShowReport,
}: MedicationCardProps) {
  const safeInterval = Math.max(0, medication.interval || 0);
  const safeRemaining = Math.max(0, medication.remaining || 0);

  const progressPercentage =
    safeInterval > 0
      ? Math.max(0, Math.min((safeRemaining / safeInterval) * 100, 100))
      : 0;

  const isLowStock = medication.quantity <= LOW_STOCK_THRESHOLD;
  const isRunning = medication.running;
  const isFinished = safeRemaining === 0;
  const isResetDisabled = safeRemaining === safeInterval;

  const isTimeCritical = isRunning && progressPercentage <= 15;
  const isTimeWarning = isRunning && progressPercentage > 15 && progressPercentage <= 35;

  const timerColorClass = isRunning
    ? isTimeCritical
      ? 'text-red-400 drop-shadow-[0_0_15px_rgba(248,113,113,0.45)]'
      : isTimeWarning
      ? 'text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.35)]'
      : 'text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]'
    : 'text-gray-500';

  const progressBarClass = isRunning
    ? isTimeCritical
      ? 'bg-gradient-to-r from-red-500 to-orange-500'
      : isTimeWarning
      ? 'bg-gradient-to-r from-yellow-400 to-amber-500'
      : 'bg-gradient-to-r from-cyan-500 to-blue-500'
    : 'bg-gray-600';

  const cardBorderClass = isRunning
    ? isTimeCritical
      ? 'border-red-400'
      : 'border-cyan-400'
    : 'border-gray-600';

  const cardTitleId = `medication-title-${medication.id ?? index}`;
  const timerLabel = `${formatTime(safeRemaining)} باقی‌مانده`;

  const statusText = isRunning
    ? isFinished
      ? 'زمان مصرف فرا رسیده'
      : isTimeCritical
      ? 'زمان تقریباً تمام شده'
      : 'تایمر فعال است'
    : 'تایمر متوقف است';

  return (
    <article
      className={`relative rounded-2xl border-l-4 bg-gray-800 p-5 shadow-xl transition-all duration-300 hover:shadow-2xl ${cardBorderClass}`}
      aria-labelledby={cardTitleId}
      dir="rtl"
    >
      <div className="mb-3 flex justify-between items-start gap-3">
        <div className="flex-1 min-w-0">
          <h3
            id={cardTitleId}
            className="flex items-center gap-2 text-xl font-bold text-white"
          >
            <span className="text-sm text-gray-400 shrink-0">#{index}</span>
            <span className="truncate">{medication.name}</span>
          </h3>

          <p className="mt-1 text-sm text-gray-300">
            💊 دوز: {medication.dosage}
          </p>

          <p className="mt-1 text-sm text-gray-300">
            ⏱ هر {medication.intervalHours} ساعت
          </p>

          <p
            className={`mt-1 text-sm ${
              isLowStock
                ? 'font-bold text-red-400 animate-pulse'
                : 'text-gray-300'
            }`}
          >
            📦 باقی‌مانده: {medication.quantity} {isLowStock ? '⚠️' : ''}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isRunning && (
            <div
              className={`h-3 w-3 rounded-full ${
                isTimeCritical
                  ? 'bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.8)]'
                  : 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]'
              } animate-pulse`}
              title={isTimeCritical ? 'زمان مصرف نزدیک است' : 'تایمر در حال اجرا'}
              aria-hidden="true"
            />
          )}

          <button
            type="button"
            onClick={onShowReport}
            aria-label={`مشاهده گزارش تاریخچه ${medication.name}`}
            title="گزارش تاریخچه"
            className="flex items-center justify-center rounded-lg bg-gray-700 p-2.5 text-lg shadow-lg transition-all duration-200 hover:scale-105 hover:bg-gray-600 focus:outline-none focus:ring-4 focus:ring-cyan-400/30"
          >
            📊
          </button>
        </div>
      </div>

      <div className="my-4 text-center">
        <div
          className={`text-5xl font-bold transition-all duration-300 ${timerColorClass}`}
          role="timer"
          aria-live="off"
          aria-label={timerLabel}
        >
          {formatTime(safeRemaining)}
        </div>

        <p className="mt-2 text-xs text-gray-400">{statusText}</p>
      </div>

      <div
        className="mb-4 h-2 w-full overflow-hidden rounded-full bg-gray-700"
        role="progressbar"
        aria-label={`پیشرفت تایمر ${medication.name}`}
        aria-valuenow={Math.round(progressPercentage)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${Math.round(progressPercentage)} درصد باقی‌مانده`}
      >
        <div
          className={`h-full transition-all duration-1000 ${progressBarClass}`}
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-label={isRunning ? `توقف تایمر ${medication.name}` : `شروع تایمر ${medication.name}`}
          aria-pressed={isRunning}
          className={`flex-1 rounded-lg px-4 py-3 font-bold transition-all duration-300 focus:outline-none focus:ring-4 ${
            isRunning
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30 hover:bg-orange-600 hover:shadow-orange-500/50 focus:ring-orange-300/30'
              : 'bg-green-500 text-white shadow-lg shadow-green-500/30 hover:scale-[1.02] hover:bg-green-600 hover:shadow-green-500/50 focus:ring-green-300/30'
          }`}
        >
          {isRunning ? '⏸ توقف' : '▶ شروع'}
        </button>

        <button
          type="button"
          onClick={onReset}
          disabled={isResetDisabled}
          aria-label={`ریست تایمر ${medication.name}`}
          title="ریست تایمر"
          className="rounded-lg bg-gray-600 px-4 py-3 font-bold text-white transition-all duration-300 hover:scale-105 hover:bg-gray-700 focus:outline-none focus:ring-4 focus:ring-gray-300/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
        >
          ↺ ریست
        </button>

        <button
          type="button"
          onClick={onDelete}
          aria-label={`حذف ${medication.name}`}
          title="حذف دارو"
          className="rounded-lg bg-red-500 px-4 py-3 font-bold text-white shadow-lg shadow-red-500/30 transition-all duration-300 hover:scale-105 hover:bg-red-600 hover:shadow-red-500/50 focus:outline-none focus:ring-4 focus:ring-red-300/30"
        >
          🗑
        </button>
      </div>
    </article>
  );
}
