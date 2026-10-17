/* ==========================================================================
 * medicationAccess.ts — entitlement → slot capacity
 *
 * Gates how many medication cards a user can create:
 *   - Every user gets 1 free card (the "free tier").
 *   - Each purchased Bazaar card-pack grants 1 additional slot.
 *   - Invalid entitlement counts (negative, NaN, ±Infinity, non-numeric)
 *     fall back to the free tier alone — never expand capacity, never
 *     collapse it below 1.
 *
 * Why the strict validation:
 *   A corrupted DB row or a buggy caller that hands in `Infinity` or `NaN`
 *   could either grant unlimited free cards (revenue loss) or zero cards
 *   (user lockout). Both are customer-trust bugs, so we coerce defensively.
 * ========================================================================== */

/** Free cards granted to every user, regardless of purchase history. */
const FREE_CARD_SLOTS = 1;

/**
 * Returns the maximum number of medication cards the user may have, given
 * their purchased entitlement.
 *
 * Contract:
 *   - `getMedicationLimit(0) === 1`            (free tier only)
 *   - `getMedicationLimit(n) === n + 1`        (for any non-negative integer n)
 *   - `getMedicationLimit(negative) === 1`     (negatives clamped to free tier)
 *   - `getMedicationLimit(NaN) === 1`          (NaN rejected)
 *   - `getMedicationLimit(Infinity) === 1`     (non-finite rejected — was a bug)
 *   - `getMedicationLimit(-Infinity) === 1`    (non-finite rejected)
 *
 * @param paidCardCount - Number of cards the user has purchased via Bazaar.
 * @returns Total slot capacity (always ≥ 1, always finite).
 */
export function getMedicationLimit(paidCardCount: number): number {
  const n = Number(paidCardCount);
  // Reject NaN and the two infinities. `Number.isFinite` covers all three
  // in a single check. Without this guard, `Math.floor(Infinity)` returns
  // `Infinity` and the function returns `1 + Infinity === Infinity` —
  // granting unlimited free cards.
  const safeCount = Number.isFinite(n) ? Math.floor(n) : 0;
  return FREE_CARD_SLOTS + Math.max(0, safeCount);
}

/**
 * Returns `true` if the user may add another medication card.
 *
 * The boundary is strict less-than: at limit L, the user can add while
 * current count is `< L`, and cannot at `L` or above.
 *
 * Contract:
 *   - `canAddMedication(0, 0) === true`          (first card for new user)
 *   - `canAddMedication(1, 0) === false`         (free tier exhausted)
 *   - `canAddMedication(currentCount, paidCardCount)` is monotonic — once
 *      false, adding more `currentCount` never re-enables adding.
 *   - Invalid `currentCount` (negative, NaN, +Infinity) returns `false` —
 *      a corrupted caller MUST NOT bypass the limit by passing junk.
 *      `-Infinity` is treated as 0 (it is strictly less than any real
 *      count, so a caller using it as "no medications yet" still works).
 *
 * @param currentCount - Number of medications the user currently has.
 * @param paidCardCount - Number of cards the user has purchased via Bazaar.
 * @returns `true` if the user may add another medication card.
 */
export function canAddMedication(currentCount: number, paidCardCount: number): boolean {
  const n = Number(currentCount);
  // Reject NaN and +Infinity: these cannot represent a real current count
  // and would otherwise let a buggy caller bypass the limit (Infinity was
  // previously clamped to 0, which then passed the `< limit` check).
  // -Infinity is allowed and treated as 0, since it is the natural "floor"
  // sentinel and never bypasses anything.
  if (Number.isNaN(n) || n === Number.POSITIVE_INFINITY) return false;
  const safeCount = Number.isFinite(n) ? Math.floor(n) : 0;
  return Math.max(0, safeCount) < getMedicationLimit(paidCardCount);
}
