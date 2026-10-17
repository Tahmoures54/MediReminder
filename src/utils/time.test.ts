import { describe, expect, it } from 'vitest';
import { formatTime } from './time';

/* ==========================================================================
 * time.ts — formatTime contracts
 *
 * `formatTime` renders a duration (in seconds) as a human-readable string
 * for the countdown UI. It is consumed by:
 *   - The medication card countdown ("01:23:45" until next dose)
 *   - The "overdue by" badge ("1 روز و 02:00:00")
 *   - The diagnostic log timestamp deltas
 *
 * Contract:
 *   - Always returns a non-empty string. Never throws.
 *   - Sub-second input is truncated (not rounded) — a 1.9s countdown shows
 *     "00:00:01", not "00:00:02".
 *   - Negative, NaN, and ±Infinity inputs clamp to "00:00:00" — the UI
 *     must never show "-00:00:12" or "Infinity".
 *   - Durations ≥ 1 day get a "N روز و HH:MM:SS" prefix in Persian.
 *   - The HH:MM:SS portion is always zero-padded to 2 digits per component.
 * ========================================================================== */

describe('formatTime — basic formatting (sub-day durations)', () => {
  /* --------------------------------------------------------------------
   * Contract: zero and small durations render as zero-padded HH:MM:SS.
   * ------------------------------------------------------------------ */
  it('pads hours, minutes and seconds', () => {
    expect(formatTime(0)).toBe('00:00:00');
    expect(formatTime(65)).toBe('00:01:05');
    expect(formatTime(3661)).toBe('01:01:01');
  });

  /* --------------------------------------------------------------------
   * Contract: each component rolls over at 60 (seconds→minutes, minutes→
   * hours). Guards against an off-by-one in the modular arithmetic.
   * ------------------------------------------------------------------ */
  it('rolls over seconds to minutes at 60', () => {
    expect(formatTime(59)).toBe('00:00:59');
    expect(formatTime(60)).toBe('00:01:00');
    expect(formatTime(61)).toBe('00:01:01');
  });

  it('rolls over minutes to hours at 60', () => {
    expect(formatTime(3599)).toBe('00:59:59');
    expect(formatTime(3600)).toBe('01:00:00');
    expect(formatTime(3601)).toBe('01:00:01');
  });

  /* --------------------------------------------------------------------
   * Contract: sub-second input is truncated, not rounded. This matters
   * for countdown timers that re-render every 250ms — rounding would
   * make the seconds digit flicker between two values.
   * ------------------------------------------------------------------ */
  it('truncates sub-second input (does not round)', () => {
    expect(formatTime(0.9)).toBe('00:00:00');
    expect(formatTime(1.9)).toBe('00:00:01');
    expect(formatTime(59.999)).toBe('00:00:59');
  });
});

describe('formatTime — multi-day durations', () => {
  /* --------------------------------------------------------------------
   * Contract: durations ≥ 1 day get a "N روز و HH:MM:SS" prefix in
   * Persian. The day count is a plain integer (no padding).
   * ------------------------------------------------------------------ */
  it('adds a day prefix for long intervals', () => {
    expect(formatTime(86400)).toBe('1 روز و 00:00:00');
    expect(formatTime(90061)).toBe('1 روز و 01:01:01');
  });

  it('renders multi-day durations with the correct day count', () => {
    expect(formatTime(2 * 86400)).toBe('2 روز و 00:00:00');
    expect(formatTime(2 * 86400 + 3661)).toBe('2 روز و 01:01:01');
    expect(formatTime(7 * 86400)).toBe('7 روز و 00:00:00');
  });

  /* --------------------------------------------------------------------
   * Contract: the boundary between "no day prefix" and "1 روز و" is
   * exactly 86400 seconds (24 hours). One second less does not get a
   * day prefix.
   * ------------------------------------------------------------------ */
  it('does not add a day prefix below 86400 seconds', () => {
    expect(formatTime(86399)).toBe('23:59:59');
    expect(formatTime(86400)).toBe('1 روز و 00:00:00');
  });
});

describe('formatTime — invalid input handling (fail-closed)', () => {
  /* --------------------------------------------------------------------
   * Contract: negative, NaN, and non-finite inputs clamp to "00:00:00".
   * The countdown UI must never show "-00:00:12" or "Infinity" or "NaN".
   * ------------------------------------------------------------------ */
  it('clamps negative and non-finite values', () => {
    expect(formatTime(-12)).toBe('00:00:00');
    expect(formatTime(Number.NaN)).toBe('00:00:00');
  });

  it('clamps +Infinity and -Infinity', () => {
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe('00:00:00');
    expect(formatTime(Number.NEGATIVE_INFINITY)).toBe('00:00:00');
  });

  /* --------------------------------------------------------------------
   * Contract: a large negative number still clamps cleanly. Guards
   * against a `Math.max(0, n)` refactor that forgot to handle NaN
   * (Math.max(0, NaN) === NaN in JS).
   * ------------------------------------------------------------------ */
  it('clamps large negative values', () => {
    expect(formatTime(-1_000_000)).toBe('00:00:00');
  });
});

describe('formatTime — type-coercion resistance', () => {
  /* --------------------------------------------------------------------
   * Contract: the function must not throw on non-number inputs that
   * might arrive via untyped postMessage or JSON.parse. It may return
   * "00:00:00" or coerce — but never throw.
   *
   * NOTE: these tests assert "does not throw" rather than a specific
   * output, because the function's signature is `(seconds: number)`.
   * Callers passing non-numbers are in TypeScript-violation territory;
   * we just want the runtime to survive.
   * ------------------------------------------------------------------ */
  it('does not throw on null, undefined, or string inputs', () => {
    // Cast to unknown then to the parameter type to simulate an untyped
    // caller (e.g. a postMessage payload that bypassed TS checks).
    expect(() => formatTime(null as unknown as number)).not.toThrow();
    expect(() => formatTime(undefined as unknown as number)).not.toThrow();
    expect(() => formatTime('100' as unknown as number)).not.toThrow();
    expect(() => formatTime({} as unknown as number)).not.toThrow();
    expect(() => formatTime([] as unknown as number)).not.toThrow();
  });
});
