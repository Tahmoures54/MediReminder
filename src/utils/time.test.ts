import { describe, expect, it } from 'vitest';
import { formatTime } from './time';

describe('formatTime', () => {
  it('pads hours, minutes and seconds', () => {
    expect(formatTime(0)).toBe('00:00:00');
    expect(formatTime(65)).toBe('00:01:05');
    expect(formatTime(3661)).toBe('01:01:01');
  });

  it('adds a day prefix for long intervals', () => {
    expect(formatTime(86400)).toBe('1 روز و 00:00:00');
    expect(formatTime(90061)).toBe('1 روز و 01:01:01');
  });

  it('clamps negative and non-finite values', () => {
    expect(formatTime(-12)).toBe('00:00:00');
    expect(formatTime(Number.NaN)).toBe('00:00:00');
  });
});
