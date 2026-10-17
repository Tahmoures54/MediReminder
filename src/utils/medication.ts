import type { HistoryRecord, Medication } from '../db/database';

/* ==========================================================================
 * medication.ts — pure helpers for the medication state machine
 *
 * These functions drive the countdown UI, the adherence classification
 * (which surfaces in the doctor-facing report), the due-pending
 * transition, list ordering, and timer-driven patching.
 *
 * Design rules
 * ============
 *   - Pure: no side effects, no mutation of inputs. Callers reuse the
 *     source object in React state, so mutation would cause silent
 *     render bugs.
 *   - Idempotent: calling `normalize(normalize(m))` produces the same
 *     result as calling it once.
 *   - Defensive: every field is coerced to a safe shape before use, so
 *     a corrupted DB row cannot crash the UI.
 * ========================================================================== */

/* ==========================================================================
 * Adherence window constants
 *
 * These define the four bands shown in the report modal and the doctor-
 * facing HTML export. Tweaking them silently rewrites the patient's
 * adherence history, so they are pinned by medication.test.ts.
 * ========================================================================== */

/** A dose taken more than this many ms BEFORE the scheduled time is "early". */
export const EARLY_WINDOW_MS = 30 * 60 * 1000;
/** A dose taken more than this many ms AFTER the scheduled time is "late". */
export const LATE_WINDOW_MS = 60 * 60 * 1000;
/** A dose taken more than this many ms after the scheduled time is "missed". */
export const MISSED_AFTER_MS = 4 * 60 * 60 * 1000;

const SECONDS_PER_HOUR = 3600;
const FALLBACK_INTERVAL_SECONDS = 3600;
const MIN_INTERVAL_HOURS = 1;

/* ==========================================================================
 * normalize
 * ========================================================================== */

/**
 * Coerces a medication into a consistent shape for UI and timer use.
 *
 * Guarantees:
 *   - `interval` and `intervalHours` are derived from each other so they
 *     can never drift apart.
 *   - A running medication always has `nextDoseAt`; if missing, it is
 *     filled from `now + remaining*1000` so the countdown has an anchor.
 *   - A stopped medication has `nextDoseAt` cleared, so the alarm
 *     scheduler does not pick up a stale reminder.
 *   - `remaining` is derived from `nextDoseAt` while running, otherwise
 *     kept from the input.
 *   - Booleans are coerced, `history` defaults to `[]`, timestamps
 *     default to `now`.
 *   - The input is NOT mutated.
 */
export function normalize(m: Medication): Medication {
  const now = Date.now();

  // Resolve the canonical interval (seconds). Prefer `interval`; fall back
  // to `intervalHours * 3600`; then to a safe default. Same logic as
  // db/database.ts:sanitizeMedication, kept in sync here so the in-memory
  // shape matches the on-disk shape.
  const interval =
    Number(m.interval) ||
    Number(m.intervalHours) * SECONDS_PER_HOUR ||
    FALLBACK_INTERVAL_SECONDS;
  const intervalHours = Number(m.intervalHours) || Math.max(MIN_INTERVAL_HOURS, Math.round(interval / SECONDS_PER_HOUR));

  // A running medication must always have `nextDoseAt`. If missing
  // (corrupted DB row, manual edit), fill it from `remaining` so the
  // countdown has an anchor. A stopped medication must NOT have one —
  // otherwise the alarm scheduler picks up a stale reminder.
  let nextDoseAt = m.nextDoseAt;
  if (m.running) {
    if (!nextDoseAt) {
      nextDoseAt = now + Math.max(1, m.remaining || interval) * 1000;
    }
  } else {
    nextDoseAt = undefined;
  }

  // Derive `remaining` from `nextDoseAt` while running; otherwise keep
  // the input value (clamped to non-negative).
  const remaining =
    nextDoseAt && m.running
      ? Math.max(0, Math.ceil((nextDoseAt - now) / 1000))
      : Math.max(0, m.remaining || 0);

  return {
    ...m,
    interval,
    intervalHours,
    remaining,
    running: Boolean(m.running),
    pendingDose: Boolean(m.pendingDose),
    history: m.history || [],
    createdAt: m.createdAt || now,
    updatedAt: m.updatedAt || now,
    nextDoseAt,
  };
}

/* ==========================================================================
 * statusFor
 * ========================================================================== */

/**
 * Classifies a dose based on when it was taken vs the scheduled time.
 *
 * Bands (pinned by medication.test.ts):
 *   - `early`   : taken more than EARLY_WINDOW_MS BEFORE schedule
 *   - `missed`  : taken more than MISSED_AFTER_MS AFTER schedule
 *   - `late`    : taken more than LATE_WINDOW_MS AFTER schedule
 *                  (but not yet missed)
 *   - `on-time` : otherwise (including exactly at schedule, or when no
 *                  schedule exists — manual dose entries default here so
 *                  they do not penalize the adherence score)
 *
 * Schedule resolution order: `scheduledAt` argument → `dueScheduledAt`
 * (frozen when dose became pending) → `nextDoseAt` → `lastTakenAt`.
 * If none exists, returns 'on-time'.
 *
 * Boundary semantics:
 *   - `delta === -EARLY_WINDOW_MS` → on-time (early requires STRICTLY less)
 *   - `delta === 0`                → on-time
 *   - `delta === LATE_WINDOW_MS`   → on-time (late requires STRICTLY greater)
 *   - `delta === MISSED_AFTER_MS`  → late (missed requires STRICTLY greater)
 */
export function statusFor(
  m: Medication,
  takenAt: number,
  scheduledAt?: number,
): HistoryRecord['status'] {
  const scheduled = scheduledAt ?? m.dueScheduledAt ?? m.nextDoseAt ?? m.lastTakenAt;
  if (!scheduled) return 'on-time';

  const delta = takenAt - scheduled;
  if (delta < -EARLY_WINDOW_MS) return 'early';
  if (delta > MISSED_AFTER_MS) return 'missed';
  if (delta > LATE_WINDOW_MS) return 'late';
  return 'on-time';
}

/* ==========================================================================
 * toDue
 * ========================================================================== */

/**
 * Transitions a medication into the "due / pending confirmation" state.
 *
 * Freezes the scheduled time into `dueScheduledAt` so the adherence score
 * stays stable even if `nextDoseAt` is later mutated. Marks `pendingDose`,
 * stops the running timer, and zeroes `remaining`. Falls back to `now`
 * for `dueScheduledAt` if `nextDoseAt` is missing (corrupted state).
 *
 * Does NOT mutate the input.
 */
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

/* ==========================================================================
 * sortMedications
 * ========================================================================== */

/**
 * Orders medications for display: pending first, then running, then stopped.
 * Within a group, the soonest `nextDoseAt` comes first; missing
 * `nextDoseAt` sorts last (treated as +Infinity).
 *
 * Does NOT mutate the input array.
 */
export function sortMedications(list: Medication[]): Medication[] {
  const rank = (m: Medication): number => (m.pendingDose ? 0 : m.running ? 1 : 2);
  return [...list].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    return (
      (a.nextDoseAt ?? Number.POSITIVE_INFINITY) -
      (b.nextDoseAt ?? Number.POSITIVE_INFINITY)
    );
  });
}

/* ==========================================================================
 * findMedication
 * ========================================================================== */

/**
 * Finds a medication by id in the list. Returns `undefined` for a missing
 * or null id, or when no match exists.
 */
export function findMedication(list: Medication[], id?: number | null): Medication | undefined {
  if (id == null) return undefined;
  return list.find((m) => m.id === id);
}

/* ==========================================================================
 * patchMedications
 * ========================================================================== */

/**
 * Applies a timer-driven patch onto the current medication list.
 *
 * Only medications already in `list` are updated — entries in `updates`
 * whose id is NOT in `list` are dropped. This prevents the patch from
 * resurrecting a medication that was deleted between timer ticks.
 *
 * If no entry in `list` was patched, the original array is returned
 * unchanged (so React's bailout-on-reference-equality keeps the UI from
 * re-rendering needlessly). If any entry was patched, the result is
 * re-sorted via `sortMedications` so the new countdown order takes effect.
 *
 * Does NOT mutate the input array or its entries.
 */
export function patchMedications(
  list: Medication[],
  updates: ReadonlyMap<number, Medication>,
): Medication[] {
  if (updates.size === 0) return list;

  let changed = false;
  const next = list.map((m) => {
    if (m.id == null || !updates.has(m.id)) return m;
    changed = true;
    return updates.get(m.id)!;
  });

  return changed ? sortMedications(next) : list;
}
