/* ==========================================================================
 * ids.ts — medication id coercion & comparison
 *
 * Why this file exists
 * ====================
 * Medication ids flow through several boundaries with different type
 * conventions:
 *   - IndexedDB:        `id: number` (auto-increment primary key)
 *   - Service Worker:   `id: number | string` (postMessage is untyped)
 *   - Native notif extras: `medicationId?: number` (Capacitor serializes
 *     to whatever the JS value was — sometimes stringified by the bridge)
 *   - Local-notifications mock layer: `extra.medicationId` may arrive as
 *     either number or string depending on the test fixture
 *
 * Comparing with `===` would silently fail across the number/string
 * boundary. `==` would pass the cross-type check BUT also silently match
 * `1 == true` and `0 == false` — a type-confusion bug. `String(a) ===
 * String(b)` (the original implementation) fixes the cross-type case
 * but introduces new bugs: it matches `'3abc'` against `'3'` is fine,
 * BUT it matches `NaN` against `NaN` (which `===` correctly rejects) and
 * matches `Infinity` against `Infinity`.
 *
 * The safe contract is:
 *   1. Coerce both sides to a canonical numeric form via `toMedId`.
 *   2. Reject null/undefined/NaN/Infinity on either side.
 *   3. Compare the two canonical numbers with `===`.
 *
 * This guarantees:
 *   - `sameMedId(3, '3') === true`     (cross-type, same id)
 *   - `sameMedId(3, '3abc') === false`  (junk string rejected)
 *   - `sameMedId(NaN, NaN) === false`   (NaN never matches)
 *   - `sameMedId(true, 1) === false`    (booleans rejected)
 *   - `sameMedId(null, null) === false` (missing ids never match)
 * ========================================================================== */

/** Accepted input shape for a medication id. */
export type MedIdInput = number | string | null | undefined;

/** Canonical numeric id (always finite, always a non-negative integer in practice). */
export type MedId = number;

/* ==========================================================================
 * toMedId — canonicalization
 * ========================================================================== */

/**
 * Coerces a medication id to a canonical finite number, or `null` if the
 * input is not a valid id.
 *
 * Accepts:
 *   - Finite numbers (returned unchanged)
 *   - Numeric strings with optional surrounding whitespace
 *
 * Rejects (returns `null`):
 *   - `null` and `undefined`
 *   - Empty strings
 *   - Non-numeric strings (`'abc'`, `'12abc'`)
 *   - `NaN`, `Infinity`, `-Infinity`
 *   - Booleans, objects, arrays (type-confusion guard — without this,
 *     `toMedId(true)` would silently become `1` and `toMedId(false)`
 *     would become `0`)
 *
 * @param value - The id to canonicalize.
 * @returns The canonical numeric id, or `null` if the input is invalid.
 */
export function toMedId(value: MedIdInput): MedId | null {
  // Reject null/undefined first. We use `== null` (loose equality) to catch
  // both `null` and `undefined` in a single check — this is the one place
  // loose equality is intentional and safe.
  if (value == null) return null;

  // Reject objects and arrays before Number() coercion (Number([]) is 0).
  if (typeof value !== 'number' && typeof value !== 'string') return null;

  // Reject empty strings explicitly — `Number('')` would return 0.
  if (value === '') return null;

  // Type-confusion guard: reject booleans. `Number(true)` would return 1
  // and `Number(false)` would return 0, which would silently make
  // `toMedId(true) === 1` and cause `sameMedId(true, 1)` to be true.
  if (typeof value === 'boolean') return null;

  // Coerce. `Number('  42  ')` → 42, `Number('12abc')` → NaN,
  // `Number('abc')` → NaN.
  const n = Number(value);

  // Reject NaN and the two infinities. `Number.isFinite` is the cleanest
  // check — it returns false for all three.
  if (!Number.isFinite(n)) return null;

  return n;
}

/* ==========================================================================
 * sameMedId — cross-boundary comparison
 * ========================================================================== */

/**
 * Compares two medication ids for equality, tolerating the number/string
 * boundary that exists across app layers.
 *
 * Both sides are canonicalized via `toMedId` first. If either side is
 * invalid (null, undefined, NaN, Infinity, junk string, boolean, etc.),
 * the comparison returns `false` — even if both sides are invalid in the
 * same way. This prevents the "two new (unsaved) medications match" bug
 * in the alarm scheduler, where both ids are `undefined`.
 *
 * Contract:
 *   - `sameMedId(3, '3') === true`     (cross-type, same id)
 *   - `sameMedId(3, 3) === true`       (same type, same id)
 *   - `sameMedId(3, 4) === false`      (different ids)
 *   - `sameMedId(3, '3abc') === false`  (junk string rejected)
 *   - `sameMedId(NaN, NaN) === false`   (NaN never matches, even itself)
 *   - `sameMedId(null, null) === false` (missing ids never match)
 *   - `sameMedId(true, 1) === false`    (booleans rejected)
 *   - Symmetric: `sameMedId(a, b) === sameMedId(b, a)` always
 *
 * @param a - First id (number, string, null, or undefined).
 * @param b - Second id (number, string, null, or undefined).
 * @returns `true` only when both sides canonicalize to the same finite number.
 */
export function sameMedId(a: MedIdInput, b: MedIdInput): boolean {
  const aId = toMedId(a);
  const bId = toMedId(b);
  // `aId === bId` is safe here because both are either `null` or a finite
  // number — no NaN-vs-NaN trap possible.
  return aId !== null && bId !== null && aId === bId;
}
