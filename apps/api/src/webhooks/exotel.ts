import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { CallStatus } from '@onepct/shared';
import { config } from '../config';
import { logger } from '../lib/logger';
import { mintCallToken, verifyCallToken } from '../lib/tokens';
import {
  createCall,
  getCall,
  getCallByProviderSid,
  updateCall,
  type CallRow,
} from '../modules/calls/repo';
import { prepCallContext } from '../modules/calls/service';
import { findOrCreateByPhone, getContactByPhone } from '../modules/contacts/repo';
import { getDefaultPersonality } from '../modules/personalities/repo';
import { storeRecordingFromUrl } from '../modules/recordings/service';
import { getSettings } from '../modules/settings/service';
import { normalizePhone } from '../lib/phone';
import { exotelAuthHeader, getExotelCreds } from '../telephony/exotel';
import { sessionManager } from '../realtime/manager';
import { hub } from '../realtime/hub';

const EXOTEL_STATUS_MAP: Record<string, CallStatus> = {
  completed: 'completed',
  failed: 'failed',
  busy: 'busy',
  'no-answer': 'no_answer',
  canceled: 'canceled',
};

function params(req: FastifyRequest): Record<string, string> {
  const fromBody = (req.body ?? {}) as Record<string, unknown>;
  const fromQuery = (req.query ?? {}) as Record<string, unknown>;
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...fromQuery, ...fromBody })) {
    if (v != null) merged[k] = String(v);
  }
  return merged;
}

async function resolveCall(p: Record<string, string>): Promise<CallRow | null> {
  const callId = p.callId || p.CustomField;
  if (callId) {
    const byId = await getCall(callId);
    if (byId) return byId;
  }
  if (p.CallSid) return getCallByProviderSid(p.CallSid);
  return null;
}

export async function exotelWebhookRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Voicebot applet "dynamic URL" endpoint: Exotel calls this when the flow's
   * voicebot starts and expects the WebSocket URL as the response body.
   * Outbound: the call row exists (CustomField carries our callId).
   * Inbound: we create the call row here.
   */
  app.get('/voicebot', async (req, reply) => {
    const p = params(req);
    let call = await resolveCall(p);

    if (!call) {
      const settings = await getSettings();
      if (!settings.inbound.enabled) return reply.code(403).send('inbound disabled');
      let fromRaw = p.CallFrom || p.From || '';
      let from = '';
      try {
        from = fromRaw ? normalizePhone(fromRaw, settings.telephony.defaultCountryCode) : '';
      } catch {
        from = fromRaw;
      }
      let contact = from ? await getContactByPhone(from) : null;
      if (!contact) {
        if (settings.inbound.unknownPolicy === 'reject') {
          return reply.code(403).send('unknown caller rejected');
        }
        if (from) contact = await findOrCreateByPhone(from);
      }
      const personality = await getDefaultPersonality();
      call = await createCall({
        direction: 'inbound',
        provider: 'exotel',
        contactId: contact?.id ?? null,
        fromNumber: from,
        toNumber: p.CallTo || p.To || '',
        personalityId: personality.id,
        status: 'in_progress',
        providerCallSid: p.CallSid ?? null,
      });
      await updateCall(call.id, { answeredAt: new Date() });
      await prepCallContext(call);
    } else if (p.CallSid && !call.provider_call_sid) {
      await updateCall(call.id, { providerCallSid: p.CallSid });
    }

    const token = mintCallToken(call.id);
    const wsUrl = `${config.publicWsBaseUrl}/ws/exotel-media?callId=${call.id}&token=${token}`;
    reply.type('text/plain');
    return wsUrl;
  });

  /** Terminal status callback (StatusCallback on the Connect API / Passthru applet). */
  app.post('/passthru', async (req) => {
    const p = params(req);
    // Validate via token when present (outbound), else require a known CallSid.
    if (p.callId && p.token) {
      if (!verifyCallToken(p.callId, p.token)) {
        logger.warn('exotel passthru token rejected');
        return 'ok';
      }
    }
    const call = await resolveCall(p);
    if (!call) return 'ok';

    const mapped = EXOTEL_STATUS_MAP[(p.Status ?? '').toLowerCase()];
    if (mapped) {
      const durationSeconds =
        Number(p.ConversationDuration ?? p.DialCallDuration ?? 0) || call.duration_seconds;
      await updateCall(call.id, { status: mapped, endedAt: new Date(), durationSeconds });
      await sessionManager.finalizeFromStatus(call.id, mapped);
      hub.broadcast('call.status', call.id, {
        status: mapped,
        direction: call.direction,
        contactName: call.contact_name ?? null,
        to: call.to_number,
        from: call.from_number,
        startedAt: call.started_at ? new Date(call.started_at).toISOString() : null,
      });
    }

    const recordingUrl = p.RecordingUrl;
    if (recordingUrl) {
      const creds = await getExotelCreds().catch(() => null);
      storeRecordingFromUrl({
        callId: call.id,
        providerRecordingSid: p.CallSid ?? '',
        url: recordingUrl,
        durationSeconds: Number(p.ConversationDuration ?? 0),
        channels: 2,
        authHeader: creds ? exotelAuthHeader(creds) : undefined,
        format: 'mp3',
      }).catch((err) => logger.error({ err, callId: call!.id }, 'exotel recording store failed'));
    }
    return 'ok';
  });
}
