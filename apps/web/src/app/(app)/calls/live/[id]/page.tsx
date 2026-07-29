'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Activity, Gauge, PhoneOff } from 'lucide-react';
import type {
  CallDto,
  CallEventDto,
  EmotionUpdateEvent,
  TranscriptSegmentDto,
} from '@onepct/shared';
import { api, fetcher } from '@/lib/api';
import { fmtDuration, fmtMs } from '@/lib/format';
import { useDashboardEvents } from '@/lib/ws';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { EmotionMeter } from '@/components/live/emotion-meter';
import { ThoughtFeed, type ThoughtItem } from '@/components/live/thought-feed';
import { TranscriptFeed, type FeedSegment } from '@/components/live/transcript-feed';

let thoughtSeq = 0;

export default function LiveCallPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: callRes, mutate } = useSWR<{ call: CallDto }>(id ? `/calls/${id}` : null, fetcher);
  const call = callRes?.call;

  const [segments, setSegments] = useState<FeedSegment[]>([]);
  const [partial, setPartial] = useState<string | null>(null);
  const [thoughts, setThoughts] = useState<ThoughtItem[]>([]);
  const [emotion, setEmotion] = useState<EmotionUpdateEvent | null>(null);
  const [latency, setLatency] = useState<{ turnMs: number; avgMs: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [hangingUp, setHangingUp] = useState(false);
  const endedRef = useRef(false);

  // Seed from persisted data (page refresh mid-call, or joining late).
  useEffect(() => {
    if (!id) return;
    api
      .get<{ items: TranscriptSegmentDto[] }>(`/calls/${id}/transcript`)
      .then((r) =>
        setSegments(
          r.items.map((s) => ({
            id: s.id,
            speaker: s.speaker,
            text: s.text,
            startedMs: s.startedMs,
            emotion: s.emotion,
          })),
        ),
      )
      .catch(() => {});
    api
      .get<{ items: CallEventDto[] }>(`/calls/${id}/events`)
      .then((r) => setThoughts(r.items.map(eventToThought).filter(Boolean) as ThoughtItem[]))
      .catch(() => {});
  }, [id]);

  // Duration ticker.
  useEffect(() => {
    const startIso = call?.answeredAt ?? call?.startedAt;
    if (!startIso || endedRef.current) return;
    const start = new Date(startIso).getTime();
    const t = setInterval(() => setElapsed(Math.max(0, (Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [call?.answeredAt, call?.startedAt]);

  useDashboardEvents(id ?? null, (event) => {
    switch (event.type) {
      case 'transcript.partial':
        setPartial(event.data.text);
        break;
      case 'transcript.segment':
        setPartial(null);
        setSegments((prev) =>
          prev.some((s) => s.id === event.data.id)
            ? prev
            : [...prev, { ...event.data, emotion: null }],
        );
        break;
      case 'emotion.update':
        setEmotion(event.data);
        break;
      case 'latency':
        setLatency(event.data);
        break;
      case 'thought':
        pushThought({ kind: event.data.kind === 'strategy' ? 'strategy' : 'observation', title: event.data.text, tsMs: event.tsMs });
        break;
      case 'memory.recall':
        pushThought({
          kind: 'memory',
          title: `Recalled ${event.data.memories.length} memor${event.data.memories.length === 1 ? 'y' : 'ies'} (${event.data.trigger === 'pre_call' ? 'before the call' : 'mid-call'})`,
          detail: event.data.memories.map((m) => m.content).join(' · ').slice(0, 220),
          tsMs: event.tsMs,
        });
        break;
      case 'tool':
        pushThought({
          kind: 'tool',
          title: `${event.data.name}`,
          detail: event.data.result?.slice(0, 200),
          tsMs: event.tsMs,
        });
        break;
      case 'adaptation':
        pushThought({ kind: 'adaptation', title: event.data.reason, detail: event.data.directive, tsMs: event.tsMs });
        break;
      case 'call.status':
        void mutate();
        break;
      case 'call.ended':
        endedRef.current = true;
        toast.info('Call ended — generating summary & reflection…');
        void mutate();
        break;
      case 'postcall.done':
        toast.success('Summary and reflection are ready');
        router.push(`/calls/${id}`);
        break;
    }
  });

  function pushThought(t: Omit<ThoughtItem, 'id'>) {
    setThoughts((prev) => [...prev.slice(-60), { ...t, id: `t${thoughtSeq++}` }]);
  }

  async function hangup() {
    if (!id) return;
    setHangingUp(true);
    try {
      await api.post(`/calls/${id}/hangup`);
    } catch (err) {
      toast.error((err as Error).message);
      setHangingUp(false);
    }
  }

  const live = call ? ['queued', 'ringing', 'in_progress'].includes(call.status) : true;
  const who = call?.contactName ?? call?.toNumber ?? '…';

  return (
    <>
      <PageHeader
        label="live call"
        title={who}
        description={call?.goal ?? undefined}
        actions={
          <div className="flex items-center gap-3">
            {call ? <StatusBadge status={call.status} /> : null}
            <span className="font-mono-nums font-display text-2xl font-bold tabular-nums">
              {fmtDuration(elapsed)}
            </span>
            {live ? (
              <Button variant="destructive" onClick={hangup} disabled={hangingUp}>
                <PhoneOff /> {hangingUp ? 'Ending…' : 'Hang up'}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => router.push(`/calls/${id}`)}>
                View report
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Conversation */}
        <Card className="rise rise-1 lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              Conversation
              {live ? (
                <span className="eq-bars text-primary">
                  <span /><span /><span /><span />
                </span>
              ) : null}
            </CardTitle>
            <span className="font-mono-nums flex items-center gap-1.5 text-xs text-muted-foreground">
              <Gauge className="size-3.5" />
              {latency ? `${fmtMs(latency.turnMs)} (avg ${fmtMs(latency.avgMs)})` : 'latency —'}
            </span>
          </CardHeader>
          <CardContent>
            <TranscriptFeed
              segments={segments}
              partial={partial}
              agentName="Agent"
              contactName={call?.contactName ?? 'Caller'}
              className="h-[58vh]"
            />
          </CardContent>
        </Card>

        {/* Right rail */}
        <div className="space-y-5">
          <Card className="rise rise-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Activity className="size-4 text-primary" /> Emotional read
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EmotionMeter state={emotion} />
            </CardContent>
          </Card>

          <Card className="rise rise-3">
            <CardHeader>
              <CardTitle className="text-sm">AI thoughts</CardTitle>
            </CardHeader>
            <CardContent>
              <ThoughtFeed items={thoughts} className="h-[34vh]" />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function eventToThought(e: CallEventDto): ThoughtItem | null {
  const p = e.payload as Record<string, any>;
  switch (e.type) {
    case 'thought':
      return { id: `e${e.id}`, tsMs: e.tsMs, kind: p.kind === 'strategy' ? 'strategy' : 'observation', title: String(p.text ?? '') };
    case 'memory_recall':
      return {
        id: `e${e.id}`,
        tsMs: e.tsMs,
        kind: 'memory',
        title: `Recalled ${(p.memories as unknown[])?.length ?? 0} memories (${p.trigger})`,
        detail: Array.isArray(p.memories)
          ? (p.memories as Array<{ content: string }>).map((m) => m.content).join(' · ').slice(0, 220)
          : undefined,
      };
    case 'tool_call':
      return { id: `e${e.id}`, tsMs: e.tsMs, kind: 'tool', title: String(p.name ?? 'tool'), detail: String(p.result ?? '').slice(0, 200) };
    case 'adaptation':
      return { id: `e${e.id}`, tsMs: e.tsMs, kind: 'adaptation', title: String(p.reason ?? ''), detail: String(p.directive ?? '') };
    default:
      return null;
  }
}
