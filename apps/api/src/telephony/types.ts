import type { TelephonyProviderName } from '@onepct/shared';

export interface OutboundCallRequest {
  callId: string;
  to: string; // E.164
  from: string; // owner's number / exophone
  record: boolean;
  announceRecording: boolean;
  maxDurationMinutes: number;
}

/**
 * Telephony abstraction. Implementations: Twilio (complete), Exotel (complete),
 * SIP (interface-ready stub — see docs/ROADMAP.md).
 */
export interface TelephonyProvider {
  readonly name: TelephonyProviderName;
  /** Dial the callee and route the answered leg into our media WebSocket. */
  startOutboundCall(req: OutboundCallRequest): Promise<{ providerCallSid: string }>;
  /** Terminate an active call leg. */
  hangup(providerCallSid: string): Promise<void>;
  /** Begin dual-channel recording on an answered call (idempotent). */
  startRecording(providerCallSid: string, callId: string): Promise<void>;
}
