import { describe, expect, it } from 'vitest';
import { sameMedId, toMedId } from './ids';

/* ==========================================================================
 * ids.ts — medication id coercion & comparison contracts
 *
 * These utilities exist because medication ids flow through several layers
 * (IndexedDB numeric keys, service-worker messages, native notification
 * `extra` payloads) and arrive as either `number` or `string`. Comparing
 * them with `===` would silently fail across type boundaries, so the rest
 * of the app routes through `sameMedId` / `toMedId`.
 *
 * Test philosophy: these helpers are tiny but load-bearing — a regression
 * here would break alarm routing, history association, and the deletion
 * flow. We test every edge case explicitly rather than relying on a few
 * representative samples.
 * ========================================================================== */

describe('toMedId', () => {
  /* --------------------------------------------------------------------
   * Happy path: finite numeric ids (string or number form) round-trip
   * to a finite number.
   * ------------------------------------------------------------------ */
  it('coerces numeric strings to numbers', () => {
    expect(toMedId('12')).toBe(12);
    expect(toMedId('0')).toBe(0);
    expect(toMedId('  42  ')).toBe(42);
  });

  it('passes through finite numbers unchanged', () => {
    expect(toMedId(12)).toBe(12);
    expect(toMedId(0)).toBe(0);
    expect(toMedId(1)).toBe(1);
  });

  /* --------------------------------------------------------------------
   * Rejection path: junk and missing values return null.
   * The caller is expected to null-check before using the result.
   * ------------------------------------------------------------------ */
  it('returns null for non-numeric strings', () => {
    expect(toMedId('x')).toBeNull();
    expect(toMedId('abc')).toBeNull();
    expect(toMedId('12abc')).toBeNull();
  });

  it('returns null for undefined and null', () => {
    expect(toMedId(undefined)).toBeNull();
    expect(toMedId(null)).toBeNull();
  });

  it('returns null for non-finite numbers', () => {
    expect(toMedId(NaN)).toBeNull();
    expect(toMedId(Infinity)).toBeNull();
    expect(toMedId(-Infinity)).toBeNull();
  });

  it('returns null for non-numeric types', () => {
    expect(toMedId(true as unknown as string)).toBeNull();
    expect(toMedId(false as unknown as string)).toBeNull();
    expect(toMedId({} as unknown as string)).toBeNull();
    expect(toMedId([] as unknown as string)).toBeNull();
  });
});

describe('sameMedId', () => {
  /* --------------------------------------------------------------------
   * Identity comparison: same id in number or string form must match.
   * This is the core cross-boundary invariant.
   * ------------------------------------------------------------------ */
  it('matches number-to-number', () => {
    expect(sameMedId(3, 3)).toBe(true);
    expect(sameMedId(0, 0)).toBe(true);
    expect(sameMedId(3, 4)).toBe(false);
    expect(sameMedId(0, 1)).toBe(false);
  });

  it('matches number-to-string (and vice versa)', () => {
    expect(sameMedId(3, '3')).toBe(true);
    expect(sameMedId('3', 3)).toBe(true);
    expect(sameMedId(0, '0')).toBe(true);
    expect(sameMedId('0', 0)).toBe(true);
  });

  it('matches string-to-string for numeric strings', () => {
    expect(sameMedId('3', '3')).toBe(true);
    expect(sameMedId('12', '12')).toBe(true);
    expect(sameMedId('3', '4')).toBe(false);
  });

  /* --------------------------------------------------------------------
   * Asymmetry guard: numeric comparison must NOT match on junk strings.
   * `sameMedId(3, '3abc')` must be false even though both contain "3".
   * ------------------------------------------------------------------ */
  it('does not match numeric id against a junk string', () => {
    expect(sameMedId(3, '3abc')).toBe(false);
    expect(sameMedId(3, 'abc')).toBe(false);
    expect(sameMedId('3abc', 3)).toBe(false);
  });

  /* --------------------------------------------------------------------
   * Null / undefined / NaN handling — both sides.
   * A missing id must not silently match anything, including another
   * missing id. This prevents "two new (unsaved) medications match"
   * bugs in the alarm scheduler.
   * ------------------------------------------------------------------ */
  it('returns false when either side is null or undefined', () => {
    expect(sameMedId(null, 3)).toBe(false);
    expect(sameMedId(3, null)).toBe(false);
    expect(sameMedId(null, null)).toBe(false);
    expect(sameMedId(undefined, 3)).toBe(false);
    expect(sameMedId(3, undefined)).toBe(false);
    expect(sameMedId(undefined, undefined)).toBe(false);
    expect(sameMedId(null, undefined)).toBe(false);
    expect(sameMedId(undefined, null)).toBe(false);
  });

  it('returns false when either side is NaN or Infinity', () => {
    expect(sameMedId(NaN, 3)).toBe(false);
    expect(sameMedId(3, NaN)).toBe(false);
    expect(sameMedId(NaN, NaN)).toBe(false);
    expect(sameMedId(Infinity, Infinity)).toBe(false);
    expect(sameMedId(3, Infinity)).toBe(false);
  });

  /* --------------------------------------------------------------------
   * Type-confusion guard: sameMedId must not coerce booleans to 0/1.
   * Without this, `sameMedId(false, 0)` would silently be true.
   * ------------------------------------------------------------------ */
  it('does not coerce booleans to numbers', () => {
    expect(sameMedId(true as unknown as number, 1)).toBe(false);
    expect(sameMedId(false as unknown as number, 0)).toBe(false);
    expect(sameMedId(1, true as unknown as number)).toBe(false);
    expect(sameMedId(0, false as unknown as number)).toBe(false);
  });
});
