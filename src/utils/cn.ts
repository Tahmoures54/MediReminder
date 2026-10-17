import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/* ==========================================================================
 * cn — Tailwind-aware className combiner
 *
 * A thin wrapper around `clsx` (conditional class composition) and
 * `tailwind-merge` (conflict resolution for Tailwind utility classes).
 *
 * Why both?
 *   - `clsx` alone: `{ 'px-2': true, 'px-4': cond }` → `"px-2 px-4"` (both kept,
 *     CSS source-order wins — unpredictable for Tailwind).
 *   - `twMerge` alone: cannot accept objects/arrays/falsy values.
 *   - `cn` = `twMerge(clsx(...))` → accepts any ClassValue shape AND resolves
 *     conflicting Tailwind utilities so the last one wins predictably.
 *
 * Example:
 *   cn('px-2 py-1', isActive && 'bg-blue-500', isLarge ? 'px-4' : 'px-2')
 *   // → 'py-1 bg-blue-500 px-4'      (px-2 dropped, px-4 wins)
 *
 * Performance note: `twMerge` is the expensive call. For hot paths that don't
 * need conflict resolution (e.g. static class strings), call `clsx` directly.
 * ========================================================================== */

/**
 * Combines CSS class values with conditional support and intelligent
 * Tailwind utility conflict resolution.
 *
 * Accepts the full `ClassValue` shape from `clsx`:
 *   - strings: `'px-2'`
 *   - numbers: `0` (falsy, dropped) or any other number (kept as string)
 *   - booleans / null / undefined: falsy, dropped
 *   - objects: `{ 'bg-red-500': isError, 'opacity-50': isDisabled }`
 *   - arrays (nested): `['px-2', ['py-1', condition && 'font-bold']]`
 *
 * Conflicting Tailwind utilities are resolved by `twMerge`: the last
 * occurrence wins. For example `cn('text-sm', 'text-lg')` → `'text-lg'`.
 *
 * @param inputs - ClassValue values to combine. Falsy values are dropped.
 * @returns A single className string with Tailwind conflicts resolved.
 *
 * @example
 * cn('px-2', isActive && 'bg-blue-500', 'py-1')
 * // → 'px-2 bg-blue-500 py-1'
 *
 * @example
 * cn('text-sm text-red-500', isLarge && 'text-lg')
 * // → 'text-red-500 text-lg'   (text-sm dropped, text-lg wins)
 *
 * @example
 * cn('btn', { 'btn-disabled': isDisabled, 'btn-active': isActive })
 * // → 'btn btn-disabled'  (when isDisabled=true, isActive=false)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/* ==========================================================================
 * Variant helpers (optional — uncomment if/when needed)
 *
 * For components with many variant combinations (Button, Badge, Card, etc.),
 * consider `cva` from `class-variance-authority` instead of hand-rolling
 * conditional spreads. `cva` plays well with `cn` and gives you typed
 * variant props for free.
 *
 * Example:
 *   import { cva } from 'class-variance-authority';
 *   const button = cva('btn', {
 *     variants: { size: { sm: 'px-2', lg: 'px-4' }, tone: { ... } },
 *     defaultVariants: { size: 'sm' },
 *   });
 *   button({ size: 'lg' })  // → 'btn px-4'
 * ========================================================================== */
