/** The first medication card is free; each verified Bazaar purchase adds one slot. */
export function getMedicationLimit(paidCardCount: number): number {
  return 1 + Math.max(0, Math.floor(Number(paidCardCount) || 0));
}

export function canAddMedication(currentCount: number, paidCardCount: number): boolean {
  return Math.max(0, Math.floor(Number(currentCount) || 0)) < getMedicationLimit(paidCardCount);
}
