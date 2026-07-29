'use client';

import { useEffect, useRef } from 'react';
import type { EmotionState, Speaker } from '@onepct/shared';
import { EmotionChip } from '@/components/emotion-chip';
import { fmtTimestampMs } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface FeedSegment {
  id: string;
  speaker: Speaker;
  text: string;
  startedMs: number;
  emotion?: EmotionState | null;
}

export function TranscriptFeed({
  segments,
  partial,
  agentName,
  contactName,
  className,
}: {
  segments: FeedSegment[];
  partial?: string | null;
  agentName: string;
  contactName: string;
  className?: string;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [segments.length, partial]);

  return (
    <div className={cn('space-y-3 overflow-y-auto pr-2', className)}>
      {segments.length === 0 && !partial ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Waiting for the conversation to begin…
        </p>
      ) : null}
      {segments.map((s) => (
        <Bubble key={s.id} segment={s} agentName={agentName} contactName={contactName} />
      ))}
      {partial ? (
        <div className="flex justify-end">
          <div className="max-w-[78%] rounded-2xl rounded-br-sm border border-accent/25 bg-accent/8 px-4 py-2.5">
            <p className="mb-1 flex items-center gap-2 text-[11px] text-accent">
              {agentName}
              <span className="eq-bars !h-2.5 text-accent">
                <span /><span /><span />
              </span>
            </p>
            <p className="text-sm leading-relaxed">{partial}</p>
          </div>
        </div>
      ) : null}
      <div ref={bottomRef} />
    </div>
  );
}

function Bubble({
  segment,
  agentName,
  contactName,
}: {
  segment: FeedSegment;
  agentName: string;
  contactName: string;
}) {
  const isAi = segment.speaker === 'ai';
  return (
    <div className={cn('flex', isAi ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[78%] rounded-2xl border px-4 py-2.5',
          isAi
            ? 'rounded-br-sm border-accent/25 bg-accent/8'
            : 'rounded-bl-sm border-border bg-white/4',
        )}
      >
        <p
          className={cn(
            'mb-1 flex items-center gap-2 text-[11px]',
            isAi ? 'text-accent' : 'text-primary',
          )}
        >
          {isAi ? agentName : contactName}
          <span className="font-mono-nums text-muted-foreground/70">
            {fmtTimestampMs(segment.startedMs)}
          </span>
          {segment.emotion ? (
            <EmotionChip label={segment.emotion.label} className="!py-0" />
          ) : null}
        </p>
        <p className="text-sm leading-relaxed">{segment.text}</p>
      </div>
    </div>
  );
}
