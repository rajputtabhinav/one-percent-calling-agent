import { describe, expect, it } from 'vitest';
import { mintCallToken, verifyCallToken } from '../src/lib/tokens';

describe('media call tokens', () => {
  const callId = 'b9e9a7a2-0000-4000-8000-000000000001';

  it('verifies a freshly minted token', () => {
    const token = mintCallToken(callId);
    expect(verifyCallToken(callId, token)).toBe(true);
  });

  it('rejects a token for a different call', () => {
    const token = mintCallToken(callId);
    expect(verifyCallToken('other-call-id', token)).toBe(false);
  });

  it('rejects expired tokens', () => {
    const past = Date.now() - 5 * 3600 * 1000;
    const token = mintCallToken(callId, past);
    expect(verifyCallToken(callId, token)).toBe(false);
  });

  it('rejects tampered tokens', () => {
    const token = mintCallToken(callId);
    const [exp, sig] = token.split('.');
    expect(verifyCallToken(callId, `${Number(exp) + 1000}.${sig}`)).toBe(false);
    expect(verifyCallToken(callId, `${exp}.${sig}x`)).toBe(false);
    expect(verifyCallToken(callId, 'garbage')).toBe(false);
  });
});
