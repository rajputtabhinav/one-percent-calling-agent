import type { OutboundCallRequest, TelephonyProvider } from './types';

/**
 * SIP provider stub — the architecture is SIP-ready (the media pipeline speaks
 * G.711 μ-law, which maps 1:1 onto PCMU RTP), but a signaling stack is not
 * bundled. Integration path (documented in docs/ROADMAP.md):
 *   1. Run a drachtio server (or Asterisk ARI) next to the API container.
 *   2. Implement startOutboundCall via INVITE, bridge RTP ⇄ a local WS
 *      endpoint that speaks the same frame protocol as /ws/twilio-media.
 *   3. Register this provider in telephony/registry.ts.
 */
class SipProvider implements TelephonyProvider {
  readonly name = 'sip' as const;

  async startOutboundCall(_req: OutboundCallRequest): Promise<{ providerCallSid: string }> {
    throw new Error('SIP provider is not implemented yet — see docs/ROADMAP.md');
  }

  async hangup(): Promise<void> {
    throw new Error('SIP provider is not implemented yet');
  }

  async startRecording(): Promise<void> {
    throw new Error('SIP provider is not implemented yet');
  }
}

export const sipProvider = new SipProvider();
