import { badRequest } from './errors';

/**
 * Normalize a dialable number to E.164.
 * Handles: spaces/dashes/parens, 00-prefix international, national numbers
 * with a leading 0 (replaced by default country code), bare 10-digit numbers.
 */
export function normalizePhone(input: string, defaultCountryCode = '+91'): string {
  let s = input.trim().replace(/[\s\-().]/g, '');
  if (!s) throw badRequest('Phone number is empty', 'invalid_phone');

  if (s.startsWith('00')) s = `+${s.slice(2)}`;

  if (!s.startsWith('+')) {
    if (s.startsWith('0')) {
      s = `${defaultCountryCode}${s.slice(1)}`;
    } else {
      s = `${defaultCountryCode}${s}`;
    }
  }

  if (!/^\+[1-9]\d{6,14}$/.test(s)) {
    throw badRequest(`"${input}" is not a valid phone number`, 'invalid_phone');
  }
  return s;
}

export function isLikelyPhone(input: string): boolean {
  return /^[+\d][\d\s\-().]{3,}$/.test(input.trim());
}
