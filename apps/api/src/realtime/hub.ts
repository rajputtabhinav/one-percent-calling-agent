import type { WebSocket } from 'ws';
import type { DashboardClientMessage, DashboardEvent, DashboardEventMap } from '@onepct/shared';
import { logger } from '../lib/logger';

interface Client {
  socket: WebSocket;
  subs: Set<string>; // callIds or '*'
}

/** Fan-out hub: live call events → every subscribed dashboard socket. */
class DashboardHub {
  private clients = new Set<Client>();

  add(socket: WebSocket): void {
    const client: Client = { socket, subs: new Set(['*']) };
    this.clients.add(client);
    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as DashboardClientMessage;
        if (msg.type === 'subscribe') client.subs.add(msg.callId);
        else if (msg.type === 'unsubscribe') client.subs.delete(msg.callId);
        else if (msg.type === 'ping') socket.send('{"type":"pong"}');
      } catch {
        // ignore malformed frames
      }
    });
    const drop = () => this.clients.delete(client);
    socket.on('close', drop);
    socket.on('error', drop);
  }

  broadcast<K extends keyof DashboardEventMap>(
    type: K,
    callId: string,
    data: DashboardEventMap[K],
    tsMs = Date.now(),
  ): void {
    const event = { type, callId, tsMs, data } as DashboardEvent;
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if (!client.subs.has('*') && !client.subs.has(callId)) continue;
      if (client.socket.readyState === client.socket.OPEN) {
        client.socket.send(payload, (err) => {
          if (err) logger.debug({ err: err.message }, 'dashboard ws send failed');
        });
      }
    }
  }

  get size(): number {
    return this.clients.size;
  }
}

export const hub = new DashboardHub();
