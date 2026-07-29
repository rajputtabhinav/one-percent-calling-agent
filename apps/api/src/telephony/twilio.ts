import crypto from 'node:crypto';
import { config } from '../config';
import { unavailable } from '../lib/errors';
import { logger } from '../lib/logger';
import { mintCallToken } from '../lib/tokens';
import { getSecret } from '../modules/settings/service';
import { queryOne } from '../db/pool';
import type { OutboundCallRequest, TelephonyProvider } from './types';

const API_BASE = 'https://api.twilio.com/2010-04-01';

export async function getTwilioCreds(): Promise<{ accountSid: string; authToken: string }> {
  const [accountSid, authToken] = await Promise.all([
    getSecret('twilio.accountSid'),
    getSecret('twilio.authToken'),
  ]);
  if (!accountSid || !authToken) {
    throw unavailable('Twilio credentials are not configured — add them in Settings → Integrations');
  }
  return { accountSid, authToken };
}

export function twilioAuthHeader(accountSid: string, authToken: string): string {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
}

async function twilioPost(
  path: string,
  form: URLSearchParams,
): Promise<Record<string, unknown>> {
  const { accountSid, authToken } = await getTwilioCreds();
  const res = await fetch(`${API_BASE}/Accounts/${accountSid}${path}`, {
    method: 'POST',
    headers: {
      Authorization: twilioAuthHeader(accountSid, authToken),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (body as { message?: string }).message ?? `HTTP ${res.status}`;
    throw new Error(`Twilio API error: ${msg}`);
  }
  return body;
}

class TwilioProvider implements TelephonyProvider {
  readonly name = 'twilio' as const;

  async startOutboundCall(req: OutboundCallRequest): Promise<{ providerCallSid: string }> {
    const token = mintCallToken(req.callId);
    const voiceUrl = `${config.publicBaseUrl}/webhooks/twilio/voice/outbound?callId=${req.callId}&token=${token}`;
    const statusUrl = `${config.publicBaseUrl}/webhooks/twilio/status?callId=${req.callId}&token=${token}`;

    const form = new URLSearchParams();
    form.set('To', req.to);
    form.set('From', req.from);
    form.set('Url', voiceUrl);
    form.set('Method', 'POST');
    form.set('StatusCallback', statusUrl);
    form.set('StatusCallbackMethod', 'POST');
    for (const ev of ['initiated', 'ringing', 'answered', 'completed']) {
      form.append('StatusCallbackEvent', ev);
    }
    form.set('Timeout', '30');
    form.set('TimeLimit', String(req.maxDurationMinutes * 60 + 60));

    const body = await twilioPost('/Calls.json', form);
    return { providerCallSid: String(body.sid) };
  }

  async hangup(providerCallSid: string): Promise<void> {
    const form = new URLSearchParams({ Status: 'completed' });
    await twilioPost(`/Calls/${providerCallSid}.json`, form);
  }

  async startRecording(providerCallSid: string, callId: string): Promise<void> {
    // Idempotency guard — a recording may already have been requested.
    const existing = await queryOne(
      'SELECT id FROM recordings WHERE call_id = $1',
      [callId],
    );
    if (existing) return;
    const token = mintCallToken(callId);
    const form = new URLSearchParams({
      RecordingChannels: 'dual',
      RecordingStatusCallback: `${config.publicBaseUrl}/webhooks/twilio/recording?callId=${callId}&token=${token}`,
      RecordingStatusCallbackEvent: 'completed',
    });
    try {
      const body = await twilioPost(`/Calls/${providerCallSid}/Recordings.json`, form);
      const { upsertPendingRecording } = await import('../modules/recordings/service');
      await upsertPendingRecording(callId, String(body.sid));
    } catch (err) {
      logger.warn({ err, callId }, 'twilio startRecording failed');
    }
  }
}

export const twilioProvider = new TwilioProvider();

// ── Webhook signature validation (HMAC-SHA1 per Twilio spec) ─────────────────

export function computeTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join('');
  return crypto.createHmac('sha1', authToken).update(data).digest('base64');
}

export async function verifyTwilioWebhook(
  fullUrl: string,
  params: Record<string, string>,
  signature: string | undefined,
): Promise<boolean> {
  if (config.twilioSkipSignatureValidation) return true;
  if (!signature) return false;
  const authToken = await getSecret('twilio.authToken');
  if (!authToken) return false;
  const expected = computeTwilioSignature(authToken, fullUrl, params);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ── TwiML ────────────────────────────────────────────────────────────────────

const xmlEscape = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function buildStreamTwiML(opts: { callId: string; announceRecording: boolean }): string {
  const token = mintCallToken(opts.callId);
  const wsUrl = `${config.publicWsBaseUrl}/ws/twilio-media?callId=${opts.callId}&token=${token}`;
  const announce = opts.announceRecording
    ? '<Say voice="Polly.Aditi">This call may be recorded.</Say>'
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${announce}<Connect><Stream url="${xmlEscape(wsUrl)}" /></Connect></Response>`;
}

export function buildRejectTwiML(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Reject reason="rejected" /></Response>`;
}

export function buildHangupTwiML(message?: string): string {
  const say = message ? `<Say voice="Polly.Aditi">${xmlEscape(message)}</Say>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${say}<Hangup /></Response>`;
}
