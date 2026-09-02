import { Medication } from '../db/database';
import { formatTime } from '../utils/audio';

interface Props {
  medication: Medication;
  index: number;
  onToggle: () => void;
  onReset: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onShowReport: () => void;
  onTake: () => void;
  onSnooze: () => void;
}

const LOW_STOCK_THRESHOLD = 5;

export function MedicationCard({
  medication,
  index,
  onToggle,
  onReset,
  onDelete,
  onEdit,
  onShowReport,
  onTake,
  onSnooze,
}: Props) {
  const remaining = Math.max(0, medication.remaining || 0);
  const interval = Math.max(1, medication.interval || 1);
  const progress = Math.min(100, Math.max(0, (remaining / interval) * 100));
  const due = Boolean(medication.pendingDose);
  const running = Boolean(medication.running);
  const empty = medication.quantity <= 0;
  const low = !empty && medication.quantity <= LOW_STOCK_THRESHOLD;
  const next = medication.nextDoseAt
    ? new Date(medication.nextDoseAt).toLocaleTimeString('fa-IR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  return (
    <article
      className={`rounded-2xl border bg-gray-800 p-5 shadow-xl ${
        due
          ? 'border-red-400/80'
          : running
            ? 'border-cyan-400/60'
            : 'border-gray-700'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-xl font-bold">
            #{index} {medication.name}
          </h3>
          <p className="mt-1 text-sm text-gray-300">
            💊 {medication.dosage} · هر {medication.intervalHours} ساعت
          </p>
          <p
            className={`mt-1 text-sm ${
              empty
                ? 'font-bold text-red-300'
                : low
                  ? 'font-bold text-amber-300'
                  : 'text-gray-400'
            }`}
          >
            📦 {medication.quantity} عدد
            {empty ? ' · موجودی تمام شده — شارژ کنید' : low ? ' · موجودی کم' : ''}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg bg-gray-700 px-3 py-2 text-sm"
            aria-label={`ویرایش ${medication.name}`}
            title="ویرایش"
          >
            ✏️ ویرایش
          </button>
          <button
            type="button"
            onClick={onShowReport}
            className="rounded-lg bg-gray-700 px-3 py-2 text-sm"
            aria-label={`گزارش ${medication.name}`}
            title="گزارش"
          >
            📊 گزارش
          </button>
        </div>
      </div>

      <div className="my-5 rounded-2xl bg-gray-900/70 p-4 text-center">
        {due ? (
          <>
            <div className="text-3xl font-black text-red-400">زمان مصرف</div>
            <p className="mt-1 text-sm text-gray-400">لطفاً پس از مصرف، تأیید کنید.</p>
          </>
        ) : (
          <>
            <div
              className={`text-5xl font-black tabular-nums ${
                running ? 'text-cyan-300' : 'text-gray-500'
              }`}
              role="timer"
              aria-label={`${formatTime(remaining)} باقی مانده`}
            >
              {formatTime(remaining)}
            </div>
            <p className="mt-2 text-xs text-gray-400">
              {running ? `دوز بعدی حدود ${next}` : 'تایمر متوقف است'}
            </p>
          </>
        )}
      </div>

      <div className="mb-4 h-2 overflow-hidden rounded-full bg-gray-700">
        <div
          className={`h-full transition-all ${
            due ? 'bg-red-500' : running ? 'bg-cyan-500' : 'bg-gray-600'
          }`}
          style={{ width: `${due ? 100 : progress}%` }}
        />
      </div>

      {due ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onTake}
            className="rounded-xl bg-emerald-500 py-3.5 text-base font-bold text-gray-950"
          >
            ✓ مصرف کردم
          </button>
          <button
            type="button"
            onClick={onSnooze}
            className="rounded-xl bg-amber-500 py-3.5 text-base font-bold text-gray-950"
          >
            ⏰ ۱۰ دقیقه
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onToggle}
            className={`min-w-[7rem] flex-1 rounded-xl py-3.5 text-base font-bold ${
              running ? 'bg-orange-500' : 'bg-emerald-500'
            }`}
          >
            {running ? '⏸ توقف' : '▶ شروع'}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded-xl bg-gray-700 px-4 py-3.5 text-sm font-semibold"
            aria-label="ریست تایمر"
          >
            ↺ ریست
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-xl bg-red-600 px-4 py-3.5 text-sm font-semibold"
            aria-label={`حذف ${medication.name}`}
          >
            🗑 حذف
          </button>
        </div>
      )}
    </article>
  );
}
