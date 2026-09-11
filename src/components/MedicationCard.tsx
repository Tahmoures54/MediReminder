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
        'relative isolate overflow-hidden rounded-[1.75rem] border',
        'bg-slate-900/90 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.85)]',
        due && 'border-rose-400/50 med-card-due',
        !due && running && 'border-cyan-400/35 med-card-running',
        !due && !running && 'border-white/10'
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-y-0 end-0 w-1.5',
          due ? 'bg-gradient-to-b from-rose-300 to-rose-600' : running ? 'bg-gradient-to-b from-cyan-300 to-teal-500' : 'bg-slate-600'
        )}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 med-card-shine" aria-hidden />

      <div className="relative px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] font-bold text-slate-400">
                #{index}
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                  due
                    ? 'bg-rose-500/20 text-rose-100'
                    : running
                      ? 'bg-emerald-500/15 text-emerald-200'
                      : 'bg-white/5 text-slate-400'
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    due ? 'bg-rose-300 animate-pulse' : running ? 'bg-emerald-300' : 'bg-slate-500'
                  )}
                  aria-hidden
                />
                {due ? 'منتظر تأیید' : running ? 'در حال شمارش' : 'متوقف'}
              </span>
            </div>

            <h3 className="break-words text-[1.45rem] font-black leading-snug tracking-tight text-white">
              {name}
            </h3>
            <p className="mt-1.5 truncate text-sm text-slate-400">برای {condition}</p>
          </div>

          <div className="flex shrink-0 gap-1">
            <IconButton onClick={onEdit} label={`ویرایش ${name}`} title="ویرایش">
              ✎
            </IconButton>
            <IconButton onClick={onShowReport} label={`گزارش ${name}`} title="گزارش مصرف">
              ▤
            </IconButton>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]">
          <MetaChip label="دوز" value={dosage} />
          <MetaChip label="بازه" value={`هر ${intervalHours} ساعت`} />
          <MetaChip
            label="موجودی"
            value={empty ? 'تمام' : `${quantity} عدد`}
            tone={empty ? 'danger' : low ? 'warn' : 'default'}
          />
        </div>
      </div>

      <div className="relative px-5 pb-5">
        <div
          className={cn(
            'rounded-[1.35rem] border px-4 py-6 text-center',
            due
              ? 'border-rose-400/25 bg-rose-500/10'
              : running
                ? 'border-cyan-400/20 bg-cyan-500/10'
                : 'border-white/5 bg-black/25'
          )}
        >
          {due ? (
            <>
              <div className="text-3xl font-black tracking-tight text-rose-200 sm:text-4xl">زمان مصرف</div>
              <p className="mt-2 text-sm text-rose-100/70">پس از مصرف، تأیید کنید</p>
            </>
          ) : (
            <>
              <div
                className={cn(
                  'font-black tabular-nums tracking-tight',
                  remaining >= 86400 ? 'text-3xl sm:text-4xl' : 'text-5xl sm:text-6xl',
                  running ? 'text-cyan-200' : 'text-slate-500'
                )}
                role="timer"
                aria-label={`${formatTime(remaining)} باقی مانده`}
              >
                {formatTime(remaining)}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {running ? `دوز بعدی حدود ${next}` : 'تایمر متوقف است'}
              </p>
            </>
          )}
        </div>

        <div
          className="mt-4 mb-4 h-1.5 overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-valuenow={due ? 100 : Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="پیشرفت تایمر"
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-700 ease-out',
              due ? 'bg-rose-400' : running ? 'bg-gradient-to-l from-cyan-300 to-teal-400' : 'bg-slate-600'
            )}
            style={{ width: `${due ? 100 : progress}%` }}
          />
        </div>

        {due ? (
          <div className="grid grid-cols-2 gap-2">
            <ActionButton
              onClick={onTake}
              className="bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-950/30 hover:bg-emerald-300"
            >
              مصرف کردم
            </ActionButton>
            <ActionButton
              onClick={onSnooze}
              className="bg-amber-400 text-slate-950 shadow-lg shadow-amber-950/30 hover:bg-amber-300"
            >
              ۱۰ دقیقه بعد
            </ActionButton>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <ActionButton
              onClick={onToggle}
              className={cn(
                'col-span-1',
                running
                  ? 'bg-orange-400 text-slate-950 hover:bg-orange-300'
                  : 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
              )}
            >
              {running ? 'توقف' : 'شروع'}
            </ActionButton>
            <ActionButton
              onClick={onReset}
              className="bg-white/10 text-slate-100 ring-1 ring-white/10 hover:bg-white/15"
              ariaLabel="ریست تایمر"
            >
              ریست
            </ActionButton>
            <ActionButton
              onClick={onDelete}
              className="bg-rose-500/90 text-white hover:bg-rose-400"
              ariaLabel={`حذف ${name}`}
            >
              حذف
            </ActionButton>
          </div>
        )}
      </div>
    </article>
  );
}

function MetaChip({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'warn' | 'danger';
}) {
  return (
    <span
      className={cn(
        'flex min-w-0 flex-col items-center rounded-2xl border px-2 py-2.5',
        tone === 'danger' && 'border-rose-400/30 bg-rose-500/10 text-rose-100',
        tone === 'warn' && 'border-amber-400/30 bg-amber-500/10 text-amber-100',
        tone === 'default' && 'border-white/10 bg-white/5 text-slate-200'
      )}
    >
      <span className="text-[10px] text-slate-500">{label}</span>
      <span className="mt-0.5 w-full truncate text-[12px] font-bold">{value}</span>
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
              className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-slate-200 transition hover:bg-white/10"
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
        'rounded-2xl py-3.5 text-sm font-bold transition active:scale-[0.98]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400',
        className
      )}
    >
      {children}
    </button>
  );
}
