import type { CallStatus } from '@onepct/shared';
import { logger } from '../lib/logger';
import type { CallRow } from '../modules/calls/repo';
import { CallSession } from './session';
import type { CallPrep } from './types';

class SessionManager {
  private sessions = new Map<string, CallSession>();

  create(call: CallRow, prep: CallPrep): CallSession {
    const existing = this.sessions.get(call.id);
    if (existing) return existing;
    const session = new CallSession({
      call,
      prep,
      onFinalized: () => this.sessions.delete(call.id),
    });
    this.sessions.set(call.id, session);
    return session;
  }

  get(callId: string): CallSession | undefined {
    return this.sessions.get(callId);
  }

  /** Telephony status webhook reported a terminal state. */
  async finalizeFromStatus(callId: string, status: CallStatus): Promise<void> {
    const session = this.sessions.get(callId);
    if (session) await session.externalFinalize(status);
  }

  activeSnapshots(): Array<ReturnType<CallSession['snapshot']>> {
    return [...this.sessions.values()].map((s) => s.snapshot());
  }

  async shutdown(): Promise<void> {
    const all = [...this.sessions.values()];
    logger.info({ count: all.length }, 'shutting down active call sessions');
    await Promise.allSettled(all.map((s) => s.externalFinalize('completed')));
  }
}

export const sessionManager = new SessionManager();
