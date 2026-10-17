import { describe, expect, it } from 'vitest';
import { canAddMedication, canPerformPaidMedicationOperation } from './medicationAccess';

describe('consumable medication tokens', () => {
  it('allows the one-time free first medication without paid tokens', () => {
    expect(canAddMedication(0, true)).toBe(true);
  });

  it('requires a paid token after the free first medication has been used', () => {
    expect(canAddMedication(0, false)).toBe(false);
    expect(canAddMedication(1, false)).toBe(true);
    expect(canAddMedication(10, false)).toBe(true);
  });

  it('treats purchased tokens as operation credits, not simultaneous medication slots', () => {
    expect(canPerformPaidMedicationOperation(10)).toBe(true);
    expect(canPerformPaidMedicationOperation(1)).toBe(true);
    expect(canPerformPaidMedicationOperation(0)).toBe(false);
    expect(canPerformPaidMedicationOperation(-1)).toBe(false);
  });

  it('fails closed for invalid balances', () => {
    expect(canAddMedication(Number.NaN, false)).toBe(false);
    expect(canAddMedication(Number.POSITIVE_INFINITY, false)).toBe(false);
    expect(canPerformPaidMedicationOperation(Number.NaN)).toBe(false);
    expect(canPerformPaidMedicationOperation(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
