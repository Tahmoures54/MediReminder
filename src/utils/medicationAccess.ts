/**
 * Medication actions are credit-based, not concurrent-slot-based.
 * The first medication can be created once for free. After that, every add
 * and every delete costs one purchased token; deleting never refunds credit.
 */

/** Whether another medication can be added without entering the purchase flow. */
export function canAddMedication(availableTokens: number, freeTokenAvailable: boolean): boolean {
  const n = Number(availableTokens);
  const safeTokens = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  return Boolean(freeTokenAvailable) || safeTokens > 0;
}

/** Whether a paid medication operation (add after the free card, or delete) is affordable. */
export function canPerformPaidMedicationOperation(availableTokens: number): boolean {
  const n = Number(availableTokens);
  return Number.isFinite(n) && Math.floor(n) >= 1;
}
