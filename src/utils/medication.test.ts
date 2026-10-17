import { describe, expect, it } from 'vitest';
import type { Medication } from '../db/database';
import {
  EARLY_WINDOW_MS,
  MISSED_AFTER_MS,
  normalize,
  patchMedications,
  sortMedications,
  statusFor,
  toDue,
} from './medication';

/* ==========================================================================
 * medication.ts — utility contracts
 *
 * These functions are the pure helpers that drive the medication state
 * machine: deriving `remaining` from `nextDoseAt`, classifying a dose as
 * early / on-time / late / missed, freezing the due time when a dose
 * becomes pending, ordering the list for display, and patching the list
 * from a timer-driven snapshot.
 *
 * Why these are tested at the contract level (not just behavior):
 *   - `statusFor` defines the adherence bands that surface in the report
 *     modal and the doctor-facing HTML export. A regression here silently
 *     rewrites the patient's adherence history.
 *   - `toDue` is the transition that fires when a dose becomes due; it
 *     must freeze `dueScheduledAt` so the adherence score stays stable
 *     even if `nextDoseAt` is later mutated.
 *   - `patchMedications` must NOT resurrect a medication that was removed
 *     from the array between timer ticks — that would resurrect deleted
 *     meds in the UI.
 * ========================================================================== */

/* --------------------------------------------------------------------------
 * Test factory
 * -------------------------------------------------------------------------- */

/**
 * Builds a minimal valid Medication for tests. All overridable via `partial`.
 *
 * Defaults are chosen so that a freshly-built med is in a "stopped" state
 * (`running: false`, no `nextDoseAt`) — the safest baseline because it
 * forces each test to opt INTO a running/pending state explicitly.
 */
function med(partial: Partial<Medication> = {}): Medication {
  return {
    id: undefined,
    name: 'Test',
    dosage: '10mg',
    intervalHours: 8,
    interval: 8 * 3600,
    quantity: 10,
    remaining: 8 * 3600,
    running: false,
    pendingDose: false,
    ...partial,
  };
}

/* ==========================================================================
 * normalize
 * ========================================================================== */

describe('normalize', () => {
  /* --------------------------------------------------------------------
   * Contract: when a running medication has `nextDoseAt`, `remaining`
   * must be derived from it (in seconds, rounded down). This is what
   * the countdown UI reads from.
   * ------------------------------------------------------------------ */
  it('derives remaining from nextDoseAt while running', () => {
    const now = Date.now();
    const result = normalize(
      med({
        running: true,
        nextDoseAt: now + 90_000,
        remaining: 1,
      }),
    );
    expect(result.remaining).toBe(90);
    expect(result.interval).toBe(8 * 3600);
  });

  /* --------------------------------------------------------------------
   * Contract: when a running medication is missing `nextDoseAt`, the
   * normalizer must fill it from `now + remaining*1000` so the timer
   * has something to count down from. Otherwise the UI would show an
   * undefined countdown forever.
   * ------------------------------------------------------------------ */
  it('fills nextDoseAt when a running med is missing it', () => {
    const before = Date.now();
    const result = normalize(med({ running: true, nextDoseAt: undefined, remaining: 30 }));
    const after = Date.now();

    expect(result.nextDoseAt).toBeTypeOf('number');
    expect(result.nextDoseAt).toBeGreaterThanOrEqual(before + 30 * 1000);
    expect(result.nextDoseAt).toBeLessThanOrEqual(after + 30 * 1000);
    expect(result.remaining).toBeGreaterThan(0);
  });

  /* --------------------------------------------------------------------
   * Contract: a stopped medication must NOT have `nextDoseAt` set. This
   * prevents the alarm scheduler from picking up a stale reminder after
   * the user pauses the medication.
   * ------------------------------------------------------------------ */
  it('clears nextDoseAt when a medication is not running', () => {
    const result = normalize(
      med({ running: false, nextDoseAt: Date.now() + 1000, remaining: 100 }),
    );
    expect(result.nextDoseAt).toBeUndefined();
  });

  /* --------------------------------------------------------------------
   * Contract: the normalizer must not mutate the input. Callers reuse
   * the source object in React state.
   * ------------------------------------------------------------------ */
  it('does not mutate the input medication', () => {
    const input = med({ running: true, nextDoseAt: Date.now() + 90_000, remaining: 1 });
    const snapshot = { ...input };
    normalize(input);
    expect(input).toEqual(snapshot);
  });
});

/* ==========================================================================
 * statusFor
 * ========================================================================== */

describe('statusFor', () => {
  const base = med({ nextDoseAt: 1_000_000 });

  /* --------------------------------------------------------------------
   * Contract: the four adherence windows. Boundary values matter — a
   * dose taken at exactly the scheduled time is 'on-time', not 'early'.
   * ------------------------------------------------------------------ */
  it('classifies early, on-time, late and missed windows', () => {
    expect(statusFor(base, 1_000_000 - 31 * 60 * 1000, 1_000_000)).toBe('early');
    expect(statusFor(base, 1_000_000 + 10 * 60 * 1000, 1_000_000)).toBe('on-time');
    expect(statusFor(base, 1_000_000 + 61 * 60 * 1000, 1_000_000)).toBe('late');
    expect(statusFor(base, 1_000_000 + MISSED_AFTER_MS + 1, 1_000_000)).toBe('missed');
  });

  /* --------------------------------------------------------------------
   * Contract: when no schedule exists (manual dose entry, e.g. user took
   * a dose out-of-band), default to 'on-time' so it does not penalize the
   * adherence score.
   * ------------------------------------------------------------------ */
  it('falls back to on-time when no schedule exists', () => {
    expect(statusFor(med({ nextDoseAt: undefined }), Date.now())).toBe('on-time');
  });

  /* --------------------------------------------------------------------
   * Contract: a dose taken at exactly the scheduled time is 'on-time'.
   * This is the boundary between 'early' and 'on-time'.
   * ------------------------------------------------------------------ */
  it('classifies a dose taken exactly at the scheduled time as on-time', () => {
    expect(statusFor(base, 1_000_000, 1_000_000)).toBe('on-time');
  });

  /* --------------------------------------------------------------------
   * Contract: a dose taken within the early window's edge is 'early'.
   * Tests the boundary so a refactor of the threshold does not silently
   * reclassify early doses as on-time.
   * ------------------------------------------------------------------ */
  it('classifies a dose taken just before the scheduled time as early', () => {
    expect(statusFor(base, 1_000_000 - EARLY_WINDOW_MS - 1, 1_000_000)).toBe('early');
  });

  /* --------------------------------------------------------------------
   * Contract: a dose taken exactly at MISSED_AFTER_MS after schedule is
   * still 'late' (not yet 'missed'). The +1 case is covered above.
   * ------------------------------------------------------------------ */
  it('classifies a dose at exactly MISSED_AFTER_MS as late (boundary)', () => {
    expect(statusFor(base, 1_000_000 + MISSED_AFTER_MS, 1_000_000)).toBe('late');
  });
});

/* ==========================================================================
 * toDue
 * ========================================================================== */

describe('toDue', () => {
  /* --------------------------------------------------------------------
   * Contract: when a dose becomes due, freeze the scheduled time into
   * `dueScheduledAt`, mark `pendingDose`, stop the running timer, and
   * zero out `remaining`. The frozen time is what `statusFor` later
   * uses to classify the dose — it MUST NOT drift.
   * ------------------------------------------------------------------ */
  it('freezes the scheduled time and marks the dose pending', () => {
    const nextDoseAt = Date.now() + 1000;
    const result = toDue(med({ running: true, nextDoseAt }));

    expect(result.pendingDose).toBe(true);
    expect(result.running).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.dueScheduledAt).toBe(nextDoseAt);
  });

  /* --------------------------------------------------------------------
   * Contract: if `nextDoseAt` is missing for some reason, `toDue` must
   * still mark the dose pending — but `dueScheduledAt` should fall back
   * to `now` so the adherence clock starts ticking.
   * ------------------------------------------------------------------ */
  it('falls back to now when nextDoseAt is missing', () => {
    const before = Date.now();
    const result = toDue(med({ running: true, nextDoseAt: undefined }));
    const after = Date.now();

    expect(result.pendingDose).toBe(true);
    expect(result.dueScheduledAt).toBeGreaterThanOrEqual(before);
    expect(result.dueScheduledAt).toBeLessThanOrEqual(after);
  });

  /* --------------------------------------------------------------------
   * Contract: `toDue` must not mutate the input.
   * ------------------------------------------------------------------ */
  it('does not mutate the input medication', () => {
    const input = med({ running: true, nextDoseAt: Date.now() + 1000 });
    const snapshot = { ...input };
    toDue(input);
    expect(input).toEqual(snapshot);
  });
});

/* ==========================================================================
 * sortMedications
 * ========================================================================== */

describe('sortMedications', () => {
  /* --------------------------------------------------------------------
   * Contract: pending first, then running (soonest nextDoseAt first),
   * then stopped. This puts the most actionable items at the top of the
   * list the user sees.
   * ------------------------------------------------------------------ */
  it('orders pending, then running, then stopped', () => {
    const stopped = med({ id: 1, running: false, pendingDose: false, nextDoseAt: 3 });
    const running = med({ id: 2, running: true, pendingDose: false, nextDoseAt: 2 });
    const pending = med({ id: 3, running: false, pendingDose: true, nextDoseAt: 9 });
    const sorted = sortMedications([stopped, running, pending]);
    expect(sorted.map((m) => m.id)).toEqual([3, 2, 1]);
  });

  /* --------------------------------------------------------------------
   * Contract: within the running group, earlier `nextDoseAt` comes first.
   * Two medications due at 5min and 30min should show 5min on top.
   * ------------------------------------------------------------------ */
  it('sorts running medications by nextDoseAt ascending', () => {
    const soon = med({ id: 10, running: true, nextDoseAt: 1_000 });
    const later = med({ id: 20, running: true, nextDoseAt: 5_000 });
    const sorted = sortMedications([later, soon]);
    expect(sorted.map((m) => m.id)).toEqual([10, 20]);
  });

  /* --------------------------------------------------------------------
   * Contract: the input array is not mutated.
   * ------------------------------------------------------------------ */
  it('does not mutate the input array', () => {
    const input = [
      med({ id: 1, running: false }),
      med({ id: 2, running: true, nextDoseAt: 100 }),
    ];
    const inputSnapshot = input.map((m) => m.id);
    sortMedications(input);
    expect(input.map((m) => m.id)).toEqual(inputSnapshot);
  });

  /* --------------------------------------------------------------------
   * Contract: empty input returns empty output (no throw).
   * ------------------------------------------------------------------ */
  it('returns an empty array for empty input', () => {
    expect(sortMedications([])).toEqual([]);
  });
});

/* ==========================================================================
 * patchMedications
 * ========================================================================== */

describe('patchMedications', () => {
  /* --------------------------------------------------------------------
   * Contract: the patch map may contain entries for medications that
   * were deleted between timer ticks. Those entries MUST be dropped —
   * applying them would resurrect the deleted med in the UI.
   * ------------------------------------------------------------------ */
  it('does not resurrect a medication that was removed from the list', () => {
    const running = med({ id: 2, running: true, pendingDose: false, remaining: 10 });
    const ghost = med({ id: 1, running: true, pendingDose: false, remaining: 3 });
    const patched = patchMedications(
      [running],
      new Map([
        [1, { ...ghost, remaining: 2 }],
        [2, { ...running, remaining: 9 }],
      ]),
    );
    expect(patched.map((m) => m.id)).toEqual([2]);
    expect(patched[0]!.remaining).toBe(9);
  });

  /* --------------------------------------------------------------------
   * Contract: medications in the list whose id is NOT in the patch map
   * are kept unchanged. The patch is a partial update, not a replace-all.
   * ------------------------------------------------------------------ */
  it('keeps medications that are not in the patch map unchanged', () => {
    const a = med({ id: 1, running: true, remaining: 100 });
    const b = med({ id: 2, running: true, remaining: 200 });
    const patched = patchMedications([a, b], new Map([[1, { ...a, remaining: 50 }]]));
    expect(patched.map((m) => m.id)).toEqual([1, 2]);
    expect(patched[0]!.remaining).toBe(50);
    expect(patched[1]!.remaining).toBe(200);
  });

  /* --------------------------------------------------------------------
   * Contract: the order of the patched list follows the original list,
   * not the patch map's insertion order. Otherwise the UI would flicker.
   * ------------------------------------------------------------------ */
  it('preserves the original list order', () => {
    const a = med({ id: 1, running: true, remaining: 10 });
    const b = med({ id: 2, running: true, remaining: 20 });
    const c = med({ id: 3, running: true, remaining: 30 });
    const patched = patchMedications(
      [a, b, c],
      new Map([
        [3, { ...c, remaining: 31 }],
        [1, { ...a, remaining: 11 }],
        [2, { ...b, remaining: 21 }],
      ]),
    );
    expect(patched.map((m) => m.id)).toEqual([1, 2, 3]);
  });
});
