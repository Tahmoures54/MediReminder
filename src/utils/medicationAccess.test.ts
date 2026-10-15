import { describe, expect, it } from 'vitest';
import { canAddMedication, getMedicationLimit } from './medicationAccess';

describe('medication card access', () => {
  it('allows exactly one free card', () => {
    expect(getMedicationLimit(0)).toBe(1);
    expect(canAddMedication(0, 0)).toBe(true);
    expect(canAddMedication(1, 0)).toBe(false);
  });

  it('adds one slot for each paid card entitlement', () => {
    expect(getMedicationLimit(1)).toBe(2);
    expect(canAddMedication(1, 1)).toBe(true);
    expect(canAddMedication(2, 1)).toBe(false);
    expect(getMedicationLimit(3)).toBe(4);
  });

  it('does not turn invalid entitlement counts into extra slots', () => {
    expect(getMedicationLimit(-5)).toBe(1);
    expect(getMedicationLimit(Number.NaN)).toBe(1);
  });
});
