/** The first medication card is free; paid unlocks raise the limit.
 *  9999 (or higher) means unlimited. */
export function getMedicationLimit(paidCardCount: number): number {
  const paid = Math.max(0, Math.floor(Number(paidCardCount) || 0));
  if (paid >= 9999) return Number.MAX_SAFE_INTEGER;
  return 1 + paid;
}

export function canAddMedication(currentCount: number, paidCardCount: number): boolean {
  return Math.max(0, Math.floor(Number(currentCount) || 0)) < getMedicationLimit(paidCardCount);
}

export function isUnlimited(paidCardCount: number): boolean {
  return Math.max(0, Math.floor(Number(paidCardCount) || 0)) >= 9999;
}
