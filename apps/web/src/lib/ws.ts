'use client';

import { useEffect, useRef } from 'react';
import type { DashboardEvent } from '@onepct/shared';
import { api } from './api';

type Listener = (event: DashboardEvent) => void;

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:4000';
const WS_ORIGIN = API_ORIGIN.replace(/^http/, 'ws');

/** Singleton dashboard socket with ticket auth and auto-reconnect. */
class DashboardSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private retry = 0;
  private connecting = false;
  private closedByUser = false;

  subscribeCallIds = new Set<string>();

  addListener(fn: Listener): () => void {
    this.listeners.add(fn);
    void this.ensureConnected();
    return () => {
      this.listeners.delete(fn);
    };
  }

  subscribe(callId: string): void {
    this.subscribeCallIds.add(callId);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', callId }));
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.connecting || this.ws?.readyState === WebSocket.OPEN) return;
    this.connecting = true;
    this.closedByUser = false;
    try {
      const { ticket } = await api.post<{ ticket: string }>('/auth/ws-ticket');
      const ws = new WebSocket(`${WS_ORIGIN}/ws/dashboard?ticket=${ticket}`);
      this.ws = ws;
      ws.onopen = () => {
        this.retry = 0;
        for (const callId of this.subscribeCallIds) {
          ws.send(JSON.stringify({ type: 'subscribe', callId }));
        }
      };
      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data as string) as DashboardEvent;
          if (!('type' in event)) return;
          for (const fn of this.listeners) fn(event);
        } catch {
          /* ignore malformed frame */
        }
      };
      ws.onclose = () => {
        this.ws = null;
        if (!this.closedByUser && this.listeners.size > 0) {
          const delay = Math.min(15000, 800 * 2 ** this.retry++);
          setTimeout(() => void this.ensureConnected(), delay);
        }
      };
      ws.onerror = () => ws.close();
    } catch {
      const delay = Math.min(15000, 800 * 2 ** this.retry++);
      setTimeout(() => void this.ensureConnected(), delay);
    } finally {
      this.connecting = false;
    }
  }
}

let socket: DashboardSocket | null = null;
export function getDashboardSocket(): DashboardSocket {
  if (!socket) socket = new DashboardSocket();
  return socket;
}

/** Subscribe to live dashboard events. `callId` filters; pass null for all. */
export function useDashboardEvents(callId: string | null, handler: Listener): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    const sock = getDashboardSocket();
    if (callId) sock.subscribe(callId);
    const off = sock.addListener((event) => {
      if (callId && event.callId !== callId) return;
      handlerRef.current(event);
    });
    return off;
  }, [callId]);
}
