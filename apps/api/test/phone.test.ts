import { describe, expect, it } from 'vitest';
import { normalizePhone } from '../src/lib/phone';

describe('normalizePhone', () => {
  it('keeps valid E.164 untouched', () => {
    expect(normalizePhone('+919876543210')).toBe('+919876543210');
    expect(normalizePhone('+14155552671')).toBe('+14155552671');
  });

  it('strips spaces, dashes, parens and dots', () => {
    expect(normalizePhone('+91 98765-43210')).toBe('+919876543210');
    expect(normalizePhone('(415) 555.2671', '+1')).toBe('+14155552671');
  });

  it('applies the default country code to national numbers', () => {
    expect(normalizePhone('9876543210', '+91')).toBe('+919876543210');
    expect(normalizePhone('09876543210', '+91')).toBe('+919876543210');
  });

  it('converts 00-prefixed international format', () => {
    expect(normalizePhone('00919876543210')).toBe('+919876543210');
  });

  it('rejects garbage', () => {
    expect(() => normalizePhone('hello')).toThrow();
    expect(() => normalizePhone('')).toThrow();
    expect(() => normalizePhone('+0123')).toThrow();
  });
});
