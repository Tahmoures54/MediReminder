import type { HistoryRecord, Medication } from '../db/database';

/** Normalize medication fields so UI and timers always see consistent numbers. */
export function normalize(m: Medication): Medication {
  const now = Date.now();
  const interval = Number(m.interval) || Number(m.intervalHours) * 3600 || 3600;
  let next = m.nextDoseAt;
  if (m.running && !next) {
    next = now + Math.max(1, m.remaining || interval) * 1000;
  }
  const remaining =
    next && m.running ? Math.max(0, Math.ceil((next - now) / 1000)) : Math.max(0, m.remaining || 0);
  return {
    ...m,
    interval,
    intervalHours: Number(m.intervalHours) || Math.max(1, Math.round(interval / 3600)),
    remaining,
    running: Boolean(m.running),
    pendingDose: Boolean(m.pendingDose),
    history: m.history || [],
    createdAt: m.createdAt || now,
    updatedAt: m.updatedAt || now,
    nextDoseAt: next,
  };
}

/**
 * Classify adherence based on when the dose was taken vs scheduled time.
 * early  : > 30 minutes before schedule
 * late   : > 60 minutes after schedule
 * on-time: otherwise
 */
export function statusFor(
  m: Medication,
  takenAt: number,
  scheduledAt?: number
): HistoryRecord['status'] {
  const scheduled = scheduledAt ?? m.dueScheduledAt ?? m.nextDoseAt ?? m.lastTakenAt;
  if (!scheduled) return 'on-time';
  const delta = takenAt - scheduled;
  if (delta < -30 * 60 * 1000) return 'early';
  if (delta > 60 * 60 * 1000) return 'late';
  return 'on-time';
}

/** Mark a medication as due (pending confirmation). */
export function toDue(m: Medication, now = Date.now()): Medication {
  return {
    ...normalize(m),
    running: false,
    pendingDose: true,
    remaining: 0,
    dueScheduledAt: m.nextDoseAt ?? now,
    updatedAt: now,
  };
}
