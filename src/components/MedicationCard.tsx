import type { ReactNode } from 'react';
import type { Medication } from '../db/database';
import { formatTime } from '../utils/time';
import { LOW_STOCK_THRESHOLD } from '../constants';
import { cn } from '../utils/cn';

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
  const quantity = medication.quantity ?? 0;
  const intervalHours = medication.intervalHours ?? 0;
  const dosage = medication.dosage ?? '—';
  const name = medication.name ?? 'بدون نام';
  const condition = medication.condition?.trim() || 'بیماری مشخص نشده';

  const remaining = Math.max(0, medication.remaining ?? 0);
  const interval = Math.max(1, medication.interval ?? 1);
  const progress = Math.min(100, Math.max(0, (remaining / interval) * 100));
  const due = Boolean(medication.pendingDose);
  const running = Boolean(medication.running);
  const empty = quantity <= 0;
  const low = !empty && quantity <= LOW_STOCK_THRESHOLD;
  const next = medication.nextDoseAt
    ? new Date(medication.nextDoseAt).toLocaleTimeString('fa-IR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-3xl border bg-gradient-to-br from-slate-900/95 via-slate-900 to-slate-950',
        'shadow-lg shadow-black/30 backdrop-blur-sm',
        'transition-all duration-300 ease-out',
        'hover:-translate-y-0.5 hover:shadow-xl hover:shadow-cyan-950/40',
        'active:translate-y-0 active:scale-[0.995]',
        due &&
          'border-rose-400/70 shadow-rose-950/40 ring-1 ring-rose-400/30 animate-card-pulse',
        !due && running && 'border-cyan-400/50 ring-1 ring-cyan-400/20',
        !due && !running && 'border-slate-700/80 hover:border-slate-600'
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full blur-3xl transition-opacity duration-500',
          due ? 'bg-rose-500/25 opacity-100' : running ? 'bg-cyan-500/20 opacity-100' : 'bg-slate-500/10 opacity-70'
        )}
        aria-hidden
      />

      <div
        className={cn(
          'relative border-b p-5',
          due
            ? 'border-rose-500/20 bg-gradient-to-l from-rose-950/50 via-slate-900/80 to-slate-900/40'
            : running
              ? 'border-cyan-500/15 bg-gradient-to-l from-cyan-950/40 via-slate-900/80 to-slate-900/40'
              : 'border-slate-700/60 bg-gradient-to-l from-slate-800/50 via-slate-900/80 to-slate-900/40'
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide',
                  due
                    ? 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40'
                    : running
                      ? 'bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/30'
                      : 'bg-slate-700/60 text-slate-300 ring-1 ring-slate-600/50'
                )}
              >
                #{index}
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                  due
                    ? 'bg-rose-500/25 text-rose-100'
                    : running
                      ? 'bg-emerald-500/15 text-emerald-200'
                      : 'bg-slate-700/50 text-slate-400'
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    due ? 'bg-rose-400 animate-pulse' : running ? 'bg-emerald-400' : 'bg-slate-500'
                  )}
                  aria-hidden
                />
                {due ? 'منتظر تأیید' : running ? 'در حال شمارش' : 'متوقف'}
              </span>
            </div>

            <h3 className="break-words text-xl font-black leading-snug text-white sm:text-2xl">{name}</h3>

            <p className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/5 bg-black/25 px-3 py-1 text-sm text-slate-200">
              <span aria-hidden>🩺</span>
              <span className="truncate">برای: {condition}</span>
            </p>
          </div>

          <div className="flex shrink-0 gap-1.5">
            <IconButton onClick={onEdit} label={`ویرایش ${name}`} title="ویرایش">
              ✏️
            </IconButton>
            <IconButton onClick={onShowReport} label={`گزارش ${name}`} title="گزارش مصرف">
              📊
            </IconButton>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <MetaChip>💊 {dosage}</MetaChip>
          <MetaChip>⏱ هر {intervalHours} ساعت</MetaChip>
          <MetaChip
            className={cn(
              empty && 'border-rose-500/40 bg-rose-500/15 text-rose-200',
              low && !empty && 'border-amber-500/40 bg-amber-500/15 text-amber-100'
            )}
          >
            📦 {quantity} عدد
            {empty ? ' · تمام' : low ? ' · کم' : ''}
          </MetaChip>
        </div>
      </div>

      <div className="relative p-5">
        <div
          className={cn(
            'rounded-2xl border p-5 text-center transition-colors duration-300',
            due
              ? 'border-rose-500/30 bg-rose-950/30'
              : running
                ? 'border-cyan-500/20 bg-cyan-950/20'
                : 'border-slate-700/50 bg-slate-950/50'
          )}
        >
          {due ? (
            <>
              <div className="text-3xl font-black tracking-tight text-rose-300 sm:text-4xl">زمان مصرف</div>
              <p className="mt-2 text-sm text-rose-100/70">لطفاً پس از مصرف، دکمه تأیید را بزنید</p>
            </>
          ) : (
            <>
              <div
                className={cn(
                  'text-5xl font-black tabular-nums tracking-tight transition-colors sm:text-6xl',
                  running ? 'text-cyan-300' : 'text-slate-500'
                )}
                role="timer"
                aria-label={`${formatTime(remaining)} باقی مانده`}
              >
                {formatTime(remaining)}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {running ? `دوز بعدی حدود ${next}` : 'تایمر متوقف است — شروع را بزنید'}
              </p>
            </>
          )}
        </div>

        <div
          className="mt-4 mb-5 h-2.5 overflow-hidden rounded-full bg-slate-800/90 ring-1 ring-inset ring-white/5"
          role="progressbar"
          aria-valuenow={due ? 100 : Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="پیشرفت تایمر"
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-700 ease-out',
              due
                ? 'bg-gradient-to-l from-rose-400 to-rose-600'
                : running
                  ? 'bg-gradient-to-l from-cyan-300 to-cyan-500'
                  : 'bg-slate-600'
            )}
            style={{ width: `${due ? 100 : progress}%` }}
          />
        </div>

        {due ? (
          <div className="grid grid-cols-2 gap-2.5">
            <ActionButton
              onClick={onTake}
              className="bg-gradient-to-b from-emerald-400 to-emerald-600 text-slate-950 shadow-lg shadow-emerald-900/30 hover:from-emerald-300 hover:to-emerald-500"
            >
              ✓ مصرف کردم
            </ActionButton>
            <ActionButton
              onClick={onSnooze}
              className="bg-gradient-to-b from-amber-400 to-amber-600 text-slate-950 shadow-lg shadow-amber-900/30 hover:from-amber-300 hover:to-amber-500"
            >
              ⏰ ۱۰ دقیقه
            </ActionButton>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_auto_auto] gap-2.5">
            <ActionButton
              onClick={onToggle}
              className={cn(
                'text-slate-950 shadow-lg',
                running
                  ? 'bg-gradient-to-b from-orange-400 to-orange-600 shadow-orange-900/30 hover:from-orange-300 hover:to-orange-500'
                  : 'bg-gradient-to-b from-emerald-400 to-emerald-600 shadow-emerald-900/30 hover:from-emerald-300 hover:to-emerald-500'
              )}
            >
              {running ? '⏸ توقف' : '▶ شروع'}
            </ActionButton>
            <ActionButton
              onClick={onReset}
              className="bg-slate-700/90 px-3.5 text-sm font-semibold text-slate-100 ring-1 ring-slate-600/60 hover:bg-slate-600"
              ariaLabel="ریست تایمر"
            >
              ↺ ریست
            </ActionButton>
            <ActionButton
              onClick={onDelete}
              className="bg-rose-700/90 px-3.5 text-sm font-semibold text-rose-50 ring-1 ring-rose-500/40 hover:bg-rose-600"
              ariaLabel={`حذف ${name}`}
            >
              🗑 حذف
            </ActionButton>
          </div>
        )}
      </div>
    </article>
  );
}

function MetaChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-slate-600/50 bg-slate-800/60 px-2.5 py-1 text-slate-300',
        className
      )}
    >
      {children}
    </span>
  );
}

function IconButton({
  onClick,
  label,
  title,
  children,
}: {
  onClick: () => void;
  label: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border border-white/10 bg-white/5 p-2.5 text-base',
        'transition-all duration-200',
        'hover:border-cyan-400/30 hover:bg-cyan-500/15 hover:scale-105',
        'active:scale-95'
      )}
      aria-label={label}
      title={title}
    >
      {children}
    </button>
  );
}

function ActionButton({
  onClick,
  className,
  children,
  ariaLabel,
}: {
  onClick: () => void;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        'rounded-2xl py-3.5 text-base font-bold',
        'transition-all duration-200 ease-out',
        'hover:brightness-110 active:scale-[0.97] active:brightness-95',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400',
        className
      )}
    >
      {children}
    </button>
  );
}
