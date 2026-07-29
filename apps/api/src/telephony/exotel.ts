import { config } from '../config';
import { unavailable } from '../lib/errors';
import { logger } from '../lib/logger';
import { mintCallToken } from '../lib/tokens';
import { getSecret } from '../modules/settings/service';
import type { OutboundCallRequest, TelephonyProvider } from './types';

interface ExotelCreds {
  sid: string;
  apiKey: string;
  apiToken: string;
  subdomain: string; // api.exotel.com | api.in.exotel.com
  flowId: string;
}

export async function getExotelCreds(): Promise<ExotelCreds> {
  const [sid, apiKey, apiToken, subdomain, flowId] = await Promise.all([
    getSecret('exotel.sid'),
    getSecret('exotel.apiKey'),
    getSecret('exotel.apiToken'),
    getSecret('exotel.subdomain'),
    getSecret('exotel.flowId'),
  ]);
  if (!sid || !apiKey || !apiToken) {
    throw unavailable('Exotel credentials are not configured — add them in Settings → Integrations');
  }
  if (!flowId) {
    throw unavailable(
      'Exotel flow id is not configured — create a flow with a Voicebot applet pointing at ' +
        `${config.publicBaseUrl}/webhooks/exotel/voicebot and save its id in Settings`,
    );
  }
  return { sid, apiKey, apiToken, subdomain: subdomain || 'api.exotel.com', flowId };
}

export function exotelAuthHeader(c: Pick<ExotelCreds, 'apiKey' | 'apiToken'>): string {
  return `Basic ${Buffer.from(`${c.apiKey}:${c.apiToken}`).toString('base64')}`;
}

class ExotelProvider implements TelephonyProvider {
  readonly name = 'exotel' as const;

  /**
   * Dials the callee and connects the answered leg to the configured Exotel
   * flow, whose Voicebot applet opens our /ws/exotel-media WebSocket.
   */
  async startOutboundCall(req: OutboundCallRequest): Promise<{ providerCallSid: string }> {
    const creds = await getExotelCreds();
    const token = mintCallToken(req.callId);
    const form = new URLSearchParams({
      From: req.to, // Exotel "From" = the customer leg being dialed
      CallerId: req.from, // the exophone shown to the callee
      Url: `http://my.exotel.com/${creds.sid}/exoml/start_voice/${creds.flowId}`,
      CallType: 'trans',
      TimeLimit: String(req.maxDurationMinutes * 60 + 60),
      StatusCallback: `${config.publicBaseUrl}/webhooks/exotel/passthru?callId=${req.callId}&token=${token}`,
      StatusCallbackContentType: 'application/json',
      'StatusCallbackEvents[0]': 'terminal',
      CustomField: req.callId,
    });
    if (req.record) {
      form.set('Record', 'true');
      form.set('RecordingChannels', 'dual');
    }

    const res = await fetch(
      `https://${creds.subdomain}/v1/Accounts/${creds.sid}/Calls/connect.json`,
      {
        method: 'POST',
        headers: {
          Authorization: exotelAuthHeader(creds),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      },
    );
    const body = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      const msg = body?.RestException?.Message ?? `HTTP ${res.status}`;
      throw new Error(`Exotel API error: ${msg}`);
    }
    const sid = body?.Call?.Sid;
    if (!sid) throw new Error('Exotel API did not return a call Sid');
    return { providerCallSid: String(sid) };
  }

  async hangup(providerCallSid: string): Promise<void> {
    // Exotel has no universal hangup REST endpoint; closing the Voicebot
    // WebSocket (done by the orchestrator) terminates the bot leg and the flow.
    logger.info({ providerCallSid }, 'exotel hangup: media socket close terminates the leg');
  }

  async startRecording(): Promise<void> {
    // Recording is requested at dial time (Record=true on the Connect API) and
    // delivered via the terminal status callback — nothing to do mid-call.
  }
}

export const exotelProvider = new ExotelProvider();
