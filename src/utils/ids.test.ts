import { describe, expect, it } from 'vitest';
import { sameMedId, toMedId } from './ids';

describe('sameMedId', () => {
  it('matches number and string forms of the same id', () => {
    expect(sameMedId(3, 3)).toBe(true);
    expect(sameMedId(3, '3')).toBe(true);
    expect(sameMedId('3', 3)).toBe(true);
    expect(sameMedId(3, 4)).toBe(false);
    expect(sameMedId(null, 3)).toBe(false);
  });
});

describe('toMedId', () => {
  it('coerces finite ids and rejects junk', () => {
    expect(toMedId('12')).toBe(12);
    expect(toMedId(12)).toBe(12);
    expect(toMedId(undefined)).toBeNull();
    expect(toMedId('x')).toBeNull();
  });
});
