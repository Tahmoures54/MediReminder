import { describe, expect, it } from 'vitest';
import { canAddMedication, getMedicationLimit } from './medicationAccess';

/* ==========================================================================
 * medicationAccess.ts — entitlement → slot capacity contracts
 *
 * These functions gate how many medication cards a user can create:
 *   - Every user gets 1 free card.
 *   - Each purchased card-pack SKU grants 1 additional slot per card.
 *   - Invalid entitlement counts (negative, NaN, non-finite) must NOT
 *     silently expand capacity — they fall back to the free tier (1).
 *
 * Why this matters: a regression here either blocks legitimate users from
 * adding medications they paid for, or lets users add unlimited
 * medications for free. Both are customer-trust / revenue bugs.
 * ========================================================================== */

describe('medicationAccess — free tier', () => {
  /* --------------------------------------------------------------------
   * Contract: a user with zero purchased cards can still create exactly
   * one medication. This is the "free trial" floor — never remove it.
   * ------------------------------------------------------------------ */
  it('allows exactly one free card', () => {
    expect(getMedicationLimit(0)).toBe(1);
    expect(canAddMedication(0, 0)).toBe(true);
    expect(canAddMedication(1, 0)).toBe(false);
  });
});

describe('medicationAccess — purchased capacity', () => {
  /* --------------------------------------------------------------------
   * Contract: each purchased card adds exactly one slot on top of the
   * free card. So `getMedicationLimit(n) === n + 1` for valid n.
   * ------------------------------------------------------------------ */
  it('adds the purchased bundle size to the free card capacity', () => {
    expect(getMedicationLimit(1)).toBe(2);
    expect(canAddMedication(1, 1)).toBe(true);
    expect(canAddMedication(2, 1)).toBe(false);

    expect(getMedicationLimit(3)).toBe(4);
    expect(getMedicationLimit(10)).toBe(11);
    expect(getMedicationLimit(25)).toBe(26);

    // Duplicate assertions from the original — kept for regression safety
    // even though they are redundant with the lines above.
    expect(getMedicationLimit(10)).toBe(11);
    expect(getMedicationLimit(25)).toBe(26);
  });

  /* --------------------------------------------------------------------
   * Contract: large entitlement counts scale linearly. Guards against a
   * refactor that caps the limit (e.g. `Math.min(limit, 50)`).
   * ------------------------------------------------------------------ */
  it('scales linearly for large bundle counts', () => {
    expect(getMedicationLimit(100)).toBe(101);
    expect(getMedicationLimit(1000)).toBe(1001);
  });

  /* --------------------------------------------------------------------
   * Contract: the boundary between "can add" and "cannot add" is exact.
   * At limit L, the user can add while current count < L, and cannot at L.
   * ------------------------------------------------------------------ */
  it('treats the limit as a strict less-than boundary', () => {
    const limit = getMedicationLimit(5); // 6
    expect(canAddMedication(limit - 1, 5)).toBe(true);
    expect(canAddMedication(limit, 5)).toBe(false);
    expect(canAddMedication(limit + 1, 5)).toBe(false);
  });
});

describe('medicationAccess — invalid entitlement handling', () => {
  /* --------------------------------------------------------------------
   * Contract: negative, NaN, and non-finite entitlement counts must NOT
   * expand capacity. They fall back to the free tier (1) so a corrupted
   * DB row or a buggy caller cannot grant unlimited slots.
   * ------------------------------------------------------------------ */
  it('does not turn invalid entitlement counts into extra slots', () => {
    expect(getMedicationLimit(-5)).toBe(1);
    expect(getMedicationLimit(Number.NaN)).toBe(1);
  });

  it('rejects Infinity and -Infinity as entitlement counts', () => {
    expect(getMedicationLimit(Number.POSITIVE_INFINITY)).toBe(1);
    expect(getMedicationLimit(Number.NEGATIVE_INFINITY)).toBe(1);
  });

  it('does not let negative entitlements reduce the free tier below 1', () => {
    // A negative count must clamp to 1, not to 0 or below — the free card
    // is always granted.
    expect(getMedicationLimit(-1)).toBe(1);
    expect(getMedicationLimit(-1000)).toBe(1);
    expect(canAddMedication(0, -1)).toBe(true);
    expect(canAddMedication(1, -1)).toBe(false);
  });
});

describe('medicationAccess — boundary semantics', () => {
  /* --------------------------------------------------------------------
   * Contract: `canAddMedication` is monotonic — once you cannot add,
   * adding more current count never makes it possible again.
   * ------------------------------------------------------------------ */
  it('is monotonic: once full, more count never re-enables adding', () => {
    const cards = 3;
    expect(canAddMedication(0, cards)).toBe(true);
    expect(canAddMedication(1, cards)).toBe(true);
    expect(canAddMedication(2, cards)).toBe(true);
    expect(canAddMedication(3, cards)).toBe(true);
    expect(canAddMedication(4, cards)).toBe(false);
    expect(canAddMedication(5, cards)).toBe(false);
    expect(canAddMedication(100, cards)).toBe(false);
  });

  /* --------------------------------------------------------------------
   * Contract: zero purchased cards + zero current count → can add.
   * The free card is always available to a fresh user.
   * ------------------------------------------------------------------ */
  it('allows the first card for a brand-new user', () => {
    expect(canAddMedication(0, 0)).toBe(true);
  });
});
