/** Compare medication primary keys even if one side was stored as a string. */
export function sameMedId(
  a?: number | string | null,
  b?: number | string | null
): boolean {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

export function toMedId(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
