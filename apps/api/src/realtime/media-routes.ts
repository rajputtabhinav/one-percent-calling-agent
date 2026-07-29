import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { logger } from '../lib/logger';
import { pcm16ToUlaw, ulawToPcm16 } from '../lib/g711';
import { verifyCallToken } from '../lib/tokens';
import { consumeWsTicket } from '../auth/service';
import { config } from '../config';
import { getCall, getCallByProviderSid } from '../modules/calls/repo';
import { loadOrBuildPrep } from '../modules/calls/service';
import { hub } from './hub';
import { sessionManager } from './manager';
import type { MediaAdapter } from './types';
import type { CallSession } from './session';

async function buildSession(callId: string): Promise<CallSession | null> {
  const existing = sessionManager.get(callId);
  if (existing) return existing;
  const call = await getCall(callId);
  if (!call) return null;
  const prep = await loadOrBuildPrep(call);
  return sessionManager.create(call, prep);
}

export async function realtimeRoutes(app: FastifyInstance): Promise<void> {
  // ── Dashboard live feed ────────────────────────────────────────────────────
  app.get('/ws/dashboard', { websocket: true }, async (socket: WebSocket, req) => {
    const { ticket } = req.query as { ticket?: string };
    const origin = req.headers.origin;
    if (origin && origin !== config.webOrigin && origin !== config.publicBaseUrl) {
      socket.close(1008, 'bad origin');
      return;
    }
    const ownerId = ticket ? await consumeWsTicket(ticket) : null;
    if (!ownerId) {
      socket.close(1008, 'invalid ticket');
      return;
    }
    hub.add(socket);
  });

  // ── Twilio Media Streams (bidirectional G.711 μ-law) ───────────────────────
  app.get('/ws/twilio-media', { websocket: true }, async (socket: WebSocket, req) => {
    const { callId, token } = req.query as { callId?: string; token?: string };
    if (!callId || !token || !verifyCallToken(callId, token)) {
      socket.close(1008, 'invalid token');
      return;
    }
    const session = await buildSession(callId).catch((err) => {
      logger.error({ err, callId }, 'twilio media: session build failed');
      return null;
    });
    if (!session) {
      socket.close(1011, 'no session');
      return;
    }

    let streamSid = '';
    const send = (obj: Record<string, unknown>) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(obj));
    };
    const adapter: MediaAdapter = {
      kind: 'twilio',
      sendAudio: (b64) => send({ event: 'media', streamSid, media: { payload: b64 } }),
      clear: () => send({ event: 'clear', streamSid }),
      sendMark: (name) => send({ event: 'mark', streamSid, mark: { name } }),
      close: () => {
        try {
          socket.close(1000, 'session ended');
        } catch {
          /* already closed */
        }
      },
    };

    socket.on('message', (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      switch (msg.event) {
        case 'start':
          streamSid = msg.start?.streamSid ?? '';
          session
            .attachMedia(adapter, msg.start?.callSid)
            .catch((err) => {
              logger.error({ err, callId }, 'twilio media: attach failed');
              adapter.close();
            });
          break;
        case 'media':
          if (msg.media?.payload) session.onProviderAudio(msg.media.payload);
          break;
        case 'mark':
          if (msg.mark?.name) session.onProviderMark(msg.mark.name);
          break;
        case 'stop':
          session.onMediaClosed();
          break;
        default:
          break;
      }
    });
    socket.on('close', () => session.onMediaClosed());
    socket.on('error', () => session.onMediaClosed());
  });

  // ── Exotel Voicebot (16-bit 8 kHz PCM ⇄ μ-law transcode) ───────────────────
  app.get('/ws/exotel-media', { websocket: true }, async (socket: WebSocket, req) => {
    const { callId, token } = req.query as { callId?: string; token?: string };
    const tokenValid = Boolean(callId && token && verifyCallToken(callId, token));

    let session: CallSession | null = null;
    let streamSid = '';
    // Exotel wants outbound chunks in multiples of 320 bytes (20 ms of slin8).
    let outBuf = Buffer.alloc(0);
    const CHUNK = 3200; // 200 ms

    const send = (obj: Record<string, unknown>) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(obj));
    };
    const flushOut = (force = false) => {
      while (outBuf.length >= CHUNK) {
        send({
          event: 'media',
          stream_sid: streamSid,
          media: { payload: outBuf.subarray(0, CHUNK).toString('base64') },
        });
        outBuf = outBuf.subarray(CHUNK);
      }
      if (force && outBuf.length > 0) {
        const padded =
          outBuf.length % 320 === 0
            ? outBuf
            : Buffer.concat([outBuf, Buffer.alloc(320 - (outBuf.length % 320))]);
        send({
          event: 'media',
          stream_sid: streamSid,
          media: { payload: padded.toString('base64') },
        });
        outBuf = Buffer.alloc(0);
      }
    };
    const flushTimer = setInterval(() => flushOut(true), 250);

    const adapter: MediaAdapter = {
      kind: 'exotel',
      sendAudio: (b64Ulaw) => {
        outBuf = Buffer.concat([outBuf, ulawToPcm16(Buffer.from(b64Ulaw, 'base64'))]);
        flushOut();
      },
      clear: () => {
        outBuf = Buffer.alloc(0);
        send({ event: 'clear', stream_sid: streamSid });
      },
      sendMark: (name) => send({ event: 'mark', stream_sid: streamSid, mark: { name } }),
      close: () => {
        clearInterval(flushTimer);
        try {
          socket.close(1000, 'session ended');
        } catch {
          /* already closed */
        }
      },
    };

    socket.on('message', async (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      switch (msg.event) {
        case 'start': {
          streamSid = msg.start?.stream_sid ?? '';
          const sid = msg.start?.call_sid ?? '';
          try {
            if (tokenValid && callId) {
              session = await buildSession(callId);
            } else if (sid) {
              // Static voicebot URL — trust only calls we already know about.
              const call = await getCallByProviderSid(sid);
              if (call) session = await buildSession(call.id);
            }
            if (!session) {
              socket.close(1008, 'unknown call');
              return;
            }
            await session.attachMedia(adapter, sid || undefined);
          } catch (err) {
            logger.error({ err }, 'exotel media: attach failed');
            adapter.close();
          }
          break;
        }
        case 'media': {
          if (session && msg.media?.payload) {
            const pcm = Buffer.from(msg.media.payload, 'base64');
            session.onProviderAudio(pcm16ToUlaw(pcm).toString('base64'));
          }
          break;
        }
        case 'mark':
          if (session && msg.mark?.name) session.onProviderMark(msg.mark.name);
          break;
        case 'stop':
          clearInterval(flushTimer);
          session?.onMediaClosed();
          break;
        default:
          break;
      }
    });
    socket.on('close', () => {
      clearInterval(flushTimer);
      session?.onMediaClosed();
    });
    socket.on('error', () => {
      clearInterval(flushTimer);
      session?.onMediaClosed();
    });
  });
}
