import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { CallStatus } from '@onepct/shared';
import { config } from '../config';
import { logger } from '../lib/logger';
import { verifyCallToken } from '../lib/tokens';
import { getCall, createCall, updateCall } from '../modules/calls/repo';
import { loadOrBuildPrep, prepCallContext } from '../modules/calls/service';
import { findOrCreateByPhone, getContactByPhone } from '../modules/contacts/repo';
import { storeRecordingFromUrl } from '../modules/recordings/service';
import { getDefaultPersonality } from '../modules/personalities/repo';
import { getSettings } from '../modules/settings/service';
import { hub } from '../realtime/hub';
import { sessionManager } from '../realtime/manager';
import {
  buildHangupTwiML,
  buildRejectTwiML,
  buildStreamTwiML,
  getTwilioCreds,
  twilioAuthHeader,
  twilioProvider,
  verifyTwilioWebhook,
} from '../telephony/twilio';

const TWILIO_STATUS_MAP: Record<string, CallStatus> = {
  queued: 'queued',
  initiated: 'ringing',
  ringing: 'ringing',
  'in-progress': 'in_progress',
  completed: 'completed',
  busy: 'busy',
  failed: 'failed',
  'no-answer': 'no_answer',
  canceled: 'canceled',
};

function formParams(req: FastifyRequest): Record<string, string> {
  return (req.body ?? {}) as Record<string, string>;
}

async function verified(req: FastifyRequest): Promise<boolean> {
  const fullUrl = `${config.publicBaseUrl}${req.raw.url ?? req.url}`;
  const ok = await verifyTwilioWebhook(
    fullUrl,
    formParams(req),
    req.headers['x-twilio-signature'] as string | undefined,
  );
  if (!ok) logger.warn({ url: req.url }, 'twilio webhook signature rejected');
  return ok;
}

function tokenOk(req: FastifyRequest): boolean {
  const { callId, token } = req.query as { callId?: string; token?: string };
  return Boolean(callId && token && verifyCallToken(callId, token));
}

export async function twilioWebhookRoutes(app: FastifyInstance): Promise<void> {
  // Outbound leg answered → bridge into the media stream.
  app.post('/voice/outbound', async (req, reply) => {
    if (!tokenOk(req) || !(await verified(req))) {
      return reply.code(403).send('forbidden');
    }
    const { callId } = req.query as { callId: string };
    const call = await getCall(callId);
    if (!call) return reply.code(404).send('unknown call');

    const params = formParams(req);
    await updateCall(callId, {
      providerCallSid: params.CallSid,
      status: 'in_progress',
      answeredAt: new Date(),
    });
    const [prep, settings] = await Promise.all([loadOrBuildPrep(call), getSettings()]);

    if (prep.record) {
      setTimeout(() => {
        twilioProvider
          .startRecording(params.CallSid, callId)
          .catch((err) => logger.warn({ err, callId }, 'recording start failed'));
      }, 1500);
    }

    reply.type('text/xml');
    return buildStreamTwiML({
      callId,
      announceRecording: prep.record && settings.call.announceRecording,
    });
  });

  // Inbound call to the owner's number.
  app.post('/voice/inbound', async (req, reply) => {
    if (!(await verified(req))) return reply.code(403).send('forbidden');
    const params = formParams(req);
    const settings = await getSettings();
    reply.type('text/xml');

    if (!settings.inbound.enabled) {
      return buildHangupTwiML('Sorry, this line is not taking calls right now. Goodbye.');
    }

    const from = params.From ?? '';
    const to = params.To ?? '';
    let contact = from ? await getContactByPhone(from) : null;
    if (!contact) {
      if (settings.inbound.unknownPolicy === 'reject') return buildRejectTwiML();
      if (from) contact = await findOrCreateByPhone(from);
    }

    const personality = await getDefaultPersonality();
    const call = await createCall({
      direction: 'inbound',
      provider: 'twilio',
      contactId: contact?.id ?? null,
      fromNumber: from,
      toNumber: to,
      personalityId: personality.id,
      status: 'in_progress',
      providerCallSid: params.CallSid,
    });
    await updateCall(call.id, { answeredAt: new Date() });
    await prepCallContext(call);

    if (settings.call.record && params.CallSid) {
      setTimeout(() => {
        twilioProvider
          .startRecording(params.CallSid, call.id)
          .catch((err) => logger.warn({ err, callId: call.id }, 'recording start failed'));
      }, 2000);
    }

    hub.broadcast('call.status', call.id, {
      status: 'in_progress',
      direction: 'inbound',
      contactName: contact?.name ?? null,
      to,
      from,
      startedAt: new Date().toISOString(),
    });

    return buildStreamTwiML({
      callId: call.id,
      announceRecording: settings.call.record && settings.call.announceRecording,
    });
  });

  // Call lifecycle status callbacks.
  app.post('/status', async (req, reply) => {
    if (!tokenOk(req) || !(await verified(req))) {
      return reply.code(403).send('forbidden');
    }
    const { callId } = req.query as { callId: string };
    const params = formParams(req);
    const mapped = TWILIO_STATUS_MAP[params.CallStatus ?? ''] ?? null;
    const call = await getCall(callId);
    if (!call || !mapped) return 'ok';

    const terminal = ['completed', 'busy', 'failed', 'no_answer', 'canceled'].includes(mapped);
    if (terminal) {
      const durationSeconds = Number(params.CallDuration ?? 0) || call.duration_seconds;
      await updateCall(callId, { status: mapped, endedAt: new Date(), durationSeconds });
      await sessionManager.finalizeFromStatus(callId, mapped);
      hub.broadcast('call.status', callId, {
        status: mapped,
        direction: call.direction,
        contactName: call.contact_name ?? null,
        to: call.to_number,
        from: call.from_number,
        startedAt: call.started_at ? new Date(call.started_at).toISOString() : null,
      });
    } else {
      const patch: Parameters<typeof updateCall>[1] = { status: mapped };
      if (mapped === 'in_progress' && !call.answered_at) patch.answeredAt = new Date();
      await updateCall(callId, patch);
      if (!sessionManager.get(callId)) {
        hub.broadcast('call.status', callId, {
          status: mapped,
          direction: call.direction,
          contactName: call.contact_name ?? null,
          to: call.to_number,
          from: call.from_number,
          startedAt: call.started_at ? new Date(call.started_at).toISOString() : null,
        });
      }
    }
    return 'ok';
  });

  // Recording finished → pull the dual-channel WAV into local storage.
  app.post('/recording', async (req, reply) => {
    if (!tokenOk(req) || !(await verified(req))) {
      return reply.code(403).send('forbidden');
    }
    const { callId } = req.query as { callId: string };
    const params = formParams(req);
    if (params.RecordingStatus === 'completed' && params.RecordingUrl) {
      const { accountSid, authToken } = await getTwilioCreds();
      // Fire-and-forget — Twilio expects a quick 2xx.
      storeRecordingFromUrl({
        callId,
        providerRecordingSid: params.RecordingSid ?? '',
        url: `${params.RecordingUrl}.wav`,
        durationSeconds: Number(params.RecordingDuration ?? 0),
        channels: Number(params.RecordingChannels ?? 2),
        authHeader: twilioAuthHeader(accountSid, authToken),
        format: 'wav',
      }).catch((err) => logger.error({ err, callId }, 'recording store failed'));
    }
    return 'ok';
  });
}
