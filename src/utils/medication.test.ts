import { describe, expect, it } from 'vitest';
import type { Medication } from '../db/database';
import {
  MISSED_AFTER_MS,
  normalize,
  patchMedications,
  sortMedications,
  statusFor,
  toDue,
} from './medication';

function med(partial: Partial<Medication>): Medication {
  return {
    name: 'Test',
    dosage: '10mg',
    intervalHours: 8,
    interval: 8 * 3600,
    quantity: 10,
    remaining: 8 * 3600,
    running: false,
    ...partial,
  };
}

describe('normalize', () => {
  it('derives remaining from nextDoseAt while running', () => {
    const now = Date.now();
    const result = normalize(
      med({
        running: true,
        nextDoseAt: now + 90_000,
        remaining: 1,
      })
    );
    expect(result.remaining).toBe(90);
    expect(result.interval).toBe(8 * 3600);
  });

  it('fills nextDoseAt when a running med is missing it', () => {
    const result = normalize(med({ running: true, nextDoseAt: undefined, remaining: 30 }));
    expect(result.nextDoseAt).toBeTypeOf('number');
    expect(result.remaining).toBeGreaterThan(0);
  });
});

describe('statusFor', () => {
  const base = med({ nextDoseAt: 1_000_000 });

  it('classifies early, on-time, late and missed windows', () => {
    expect(statusFor(base, 1_000_000 - 31 * 60 * 1000, 1_000_000)).toBe('early');
    expect(statusFor(base, 1_000_000 + 10 * 60 * 1000, 1_000_000)).toBe('on-time');
    expect(statusFor(base, 1_000_000 + 61 * 60 * 1000, 1_000_000)).toBe('late');
    expect(statusFor(base, 1_000_000 + MISSED_AFTER_MS + 1, 1_000_000)).toBe('missed');
  });

  it('falls back to on-time when no schedule exists', () => {
    expect(statusFor(med({ nextDoseAt: undefined }), Date.now())).toBe('on-time');
  });
});

describe('toDue', () => {
  it('freezes the scheduled time and marks the dose pending', () => {
    const nextDoseAt = Date.now() + 1000;
    const result = toDue(med({ running: true, nextDoseAt }));
    expect(result.pendingDose).toBe(true);
    expect(result.running).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.dueScheduledAt).toBe(nextDoseAt);
  });
});

describe('sortMedications', () => {
  it('orders pending, then running, then stopped', () => {
    const stopped = med({ id: 1, running: false, pendingDose: false, nextDoseAt: 3 });
    const running = med({ id: 2, running: true, pendingDose: false, nextDoseAt: 2 });
    const pending = med({ id: 3, running: false, pendingDose: true, nextDoseAt: 9 });
    const sorted = sortMedications([stopped, running, pending]);
    expect(sorted.map((m) => m.id)).toEqual([3, 2, 1]);
  });
});

describe('patchMedications', () => {
  it('does not resurrect a medication that was removed from the list', () => {
    const running = med({ id: 2, running: true, pendingDose: false, remaining: 10 });
    const ghost = med({ id: 1, running: true, pendingDose: false, remaining: 3 });
    const patched = patchMedications(
      [running],
      new Map([
        [1, { ...ghost, remaining: 2 }],
        [2, { ...running, remaining: 9 }],
      ])
    );
    expect(patched.map((m) => m.id)).toEqual([2]);
    expect(patched[0].remaining).toBe(9);
  });
});
