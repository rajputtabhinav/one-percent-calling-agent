'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useDashboardEvents } from '@/lib/ws';

interface ActiveCall {
  callId: string;
  contactName: string | null;
  to: string;
}

/** Always-visible "live call" indicator in the top bar. */
export function ActiveCallPill() {
  const [active, setActive] = useState<ActiveCall[]>([]);

  useEffect(() => {
    api
      .get<{ items: ActiveCall[] }>('/calls/active')
      .then((r) => setActive(r.items))
      .catch(() => {});
  }, []);

  useDashboardEvents(null, (event) => {
    if (event.type === 'call.status' && event.data.status === 'in_progress') {
      setActive((prev) =>
        prev.some((c) => c.callId === event.callId)
          ? prev
          : [...prev, { callId: event.callId, contactName: event.data.contactName, to: event.data.to }],
      );
    }
    if (event.type === 'call.ended' || (event.type === 'call.status' && ['completed', 'failed', 'no_answer', 'busy', 'canceled'].includes(event.data.status))) {
      setActive((prev) => prev.filter((c) => c.callId !== event.callId));
    }
  });

  if (active.length === 0) return null;
  const call = active[0];
  return (
    <Link
      href={`/calls/live/${call.callId}`}
      className="flex items-center gap-2.5 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-sm text-primary transition-all hover:bg-primary/20"
    >
      <span className="live-dot" />
      <span className="eq-bars text-primary">
        <span /><span /><span /><span />
      </span>
      Live — {call.contactName ?? call.to}
    </Link>
  );
}
