import { describe, expect, it } from 'vitest';
import { buildStreamTwiML, computeTwilioSignature } from '../src/telephony/twilio';

describe('computeTwilioSignature', () => {
  const url = 'https://example.com/webhooks/twilio/status?callId=abc&token=t';
  const params = { CallSid: 'CA123', CallStatus: 'completed', From: '+1415' };

  it('is deterministic and order-independent', () => {
    const a = computeTwilioSignature('token', url, params);
    const b = computeTwilioSignature('token', url, {
      From: '+1415',
      CallStatus: 'completed',
      CallSid: 'CA123',
    });
    expect(a).toBe(b);
  });

  it('changes when any input changes', () => {
    const base = computeTwilioSignature('token', url, params);
    expect(computeTwilioSignature('token2', url, params)).not.toBe(base);
    expect(computeTwilioSignature('token', `${url}x`, params)).not.toBe(base);
    expect(
      computeTwilioSignature('token', url, { ...params, CallStatus: 'failed' }),
    ).not.toBe(base);
  });
});

describe('buildStreamTwiML', () => {
  it('produces valid TwiML with an escaped wss url and token', () => {
    const xml = buildStreamTwiML({ callId: 'call-1', announceRecording: true });
    expect(xml).toContain('<Connect><Stream url="ws');
    expect(xml).toContain('callId=call-1&amp;token=');
    expect(xml).toContain('This call may be recorded.');
    expect(xml.startsWith('<?xml version="1.0"')).toBe(true);
  });

  it('omits the announcement when disabled', () => {
    const xml = buildStreamTwiML({ callId: 'call-1', announceRecording: false });
    expect(xml).not.toContain('<Say');
  });
});
