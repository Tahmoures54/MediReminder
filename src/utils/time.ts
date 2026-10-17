/* ==========================================================================
 * time.ts — duration formatting helper
 *
 * Renders a duration (in seconds) as a human-readable string for the
 * countdown UI. Consumers:
 *   - Medication card countdown ("01:23:45" until next dose)
 *   - "Overdue by" badge ("1 روز و 02:00:00")
 *   - Diagnostic log timestamp deltas
 *
 * Design rules
 * ============
 *   - Never throws. Non-number inputs (from untyped postMessage or
 *     JSON.parse) coerce to 0 via `Number.isFinite` rejection.
 *   - Sub-second input is truncated, not rounded — rounding would make
 *     the seconds digit flicker between two values when the countdown
 *     re-renders every 250ms.
 *   - Negative, NaN, and ±Infinity inputs clamp to "00:00:00". The UI
 *     must never show "-00:00:12" or "Infinity" or "NaN".
 *   - Durations ≥ 1 day get a "N روز و HH:MM:SS" prefix in Persian.
 *     The day count is a plain integer (no padding).
 *   - The HH:MM:SS portion is always zero-padded to 2 digits per
 *     component so column alignment in the UI stays stable.
 * ========================================================================== */

/** Seconds per day. Used as the day/hour boundary. */
const SECONDS_PER_DAY = 86400;
/** Seconds per hour. Used as the hour/minute boundary. */
const SECONDS_PER_HOUR = 3600;
/** Seconds per minute. Used as the minute/second boundary. */
const SECONDS_PER_MINUTE = 60;

/** Persian conjunction between day count and the HH:MM:SS clock. */
const DAY_PREFIX_SEPARATOR = ' روز و ';

/**
 * Formats a duration (in seconds) as `HH:MM:SS`, or `N روز و HH:MM:SS`
 * when the duration is at least one day.
 *
 * @param seconds - Duration in seconds. Non-finite, negative, or non-number
 *                  inputs are clamped to 0.
 * @returns The formatted duration string. Always non-empty, never throws.
 *
 * @example
 * formatTime(0)         // → '00:00:00'
 * formatTime(65)        // → '00:01:05'
 * formatTime(3661)      // → '01:01:01'
 * formatTime(86400)     // → '1 روز و 00:00:00'
 * formatTime(90061)     // → '1 روز و 01:01:01'
 * formatTime(-12)       // → '00:00:00'  (negative clamped)
 * formatTime(NaN)       // → '00:00:00'  (non-finite clamped)
 * formatTime(0.9)       // → '00:00:00'  (sub-second truncated, not rounded)
 */
export function formatTime(seconds: number): string {
  // `Number.isFinite` rejects NaN, ±Infinity, AND non-number types (string,
  // null, undefined, boolean, object, array) without ever throwing. This is
  // the single defensive gateway that makes the function safe against
  // untyped inputs from postMessage / JSON.parse.
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;

  const days = Math.floor(total / SECONDS_PER_DAY);
  const hours = Math.floor((total % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const minutes = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const secs = total % SECONDS_PER_MINUTE;

  // padStart(2, '0') guarantees 2-digit components so the UI column width
  // stays stable regardless of the value (e.g. "01:01:01" vs "23:59:59").
  const clock = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  if (days > 0) return `${days}${DAY_PREFIX_SEPARATOR}${clock}`;
  return clock;
}
