'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import {
  Brain,
  CheckCircle2,
  Disc3,
  FileText,
  Lightbulb,
  ListChecks,
  PhoneIncoming,
  PhoneOutgoing,
  Sparkles,
  XCircle,
} from 'lucide-react';
import type {
  CallDto,
  CallEventDto,
  CallSummaryDto,
  ReflectionDto,
  TranscriptSegmentDto,
} from '@onepct/shared';
import { fetcher } from '@/lib/api';
import { fmtDateTime, fmtDuration, fmtMs, fmtTimestampMs } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AudioPlayer } from '@/components/audio-player';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { TranscriptFeed } from '@/components/live/transcript-feed';

export default function CallDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: callRes } = useSWR<{ call: CallDto }>(id ? `/calls/${id}` : null, fetcher);
  const { data: transcript } = useSWR<{ items: TranscriptSegmentDto[] }>(
    id ? `/calls/${id}/transcript` : null,
    fetcher,
  );
  const call = callRes?.call;
  const { data: summaryRes } = useSWR<{ summary: CallSummaryDto }>(
    call?.hasSummary ? `/calls/${id}/summary` : null,
    fetcher,
  );
  const { data: reflectionRes } = useSWR<{ reflection: ReflectionDto }>(
    call?.hasReflection ? `/calls/${id}/reflection` : null,
    fetcher,
  );
  const { data: recording } = useSWR<{ items: Array<{ id: string; callId: string }> }>(
    call?.hasRecording ? `/recordings?limit=100` : null,
    fetcher,
  );
  const { data: events } = useSWR<{ items: CallEventDto[] }>(
    id ? `/calls/${id}/events` : null,
    fetcher,
  );

  if (!call) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const recordingId = recording?.items.find((r) => r.callId === call.id)?.id;
  const who = call.contactName ?? (call.direction === 'inbound' ? call.fromNumber : call.toNumber);

  return (
    <>
      <PageHeader
        label={`call · ${fmtDateTime(call.createdAt)}`}
        title={who}
        description={call.goal ?? undefined}
        actions={<StatusBadge status={call.status} />}
      />

      <div className="rise rise-1 mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Meta label="direction">
          <span className="flex items-center gap-1.5">
            {call.direction === 'inbound' ? (
              <PhoneIncoming className="size-3.5 text-accent" />
            ) : (
              <PhoneOutgoing className="size-3.5 text-primary" />
            )}
            {call.direction}
          </span>
        </Meta>
        <Meta label="duration">{fmtDuration(call.durationSeconds)}</Meta>
        <Meta label="avg latency">{fmtMs(call.latencyMsAvg)}</Meta>
        <Meta label="quality">{call.qualityScore != null ? `${Math.round(call.qualityScore)}/100` : 'pending'}</Meta>
        <Meta label="tokens">{call.tokensUsed.toLocaleString()}</Meta>
      </div>

      <Tabs defaultValue="transcript" className="rise rise-2">
        <TabsList>
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="reflection">Reflection</TabsTrigger>
          <TabsTrigger value="recording">Recording</TabsTrigger>
          <TabsTrigger value="events">Mind replay</TabsTrigger>
        </TabsList>

        <TabsContent value="transcript">
          <Card>
            <CardContent className="pt-5">
              {transcript && transcript.items.length === 0 ? (
                <EmptyState icon={FileText} title="No transcript" description="This call produced no spoken turns." />
              ) : (
                <TranscriptFeed
                  segments={(transcript?.items ?? []).map((s) => ({
                    id: s.id,
                    speaker: s.speaker,
                    text: s.text,
                    startedMs: s.startedMs,
                    emotion: s.emotion,
                  }))}
                  agentName="AI"
                  contactName={call.contactName ?? 'Caller'}
                  className="max-h-[60vh]"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary">
          {!call.hasSummary ? (
            <EmptyState
              icon={Sparkles}
              title="Summary pending"
              description="The post-call pipeline writes the summary moments after a call ends."
            />
          ) : summaryRes ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle>What happened</CardTitle></CardHeader>
                <CardContent>
                  <p className="leading-relaxed text-foreground/90">{summaryRes.summary.summary}</p>
                </CardContent>
              </Card>
              <ListCard icon={ListChecks} title="Key points" items={summaryRes.summary.keyPoints} />
              <ListCard icon={CheckCircle2} title="Follow-ups" items={summaryRes.summary.followUps} />
              <ListCard
                icon={Brain}
                title="Worth remembering"
                items={summaryRes.summary.importantMemories}
                className="lg:col-span-2"
              />
            </div>
          ) : (
            <Skeleton className="h-48" />
          )}
        </TabsContent>

        <TabsContent value="reflection">
          {!call.hasReflection ? (
            <EmptyState
              icon={Lightbulb}
              title="Reflection pending"
              description="After every call the agent critiques itself and stores a lesson for next time."
            />
          ) : reflectionRes ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle>Self-scores</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <Score label="conversation" value={reflectionRes.reflection.scores.conversationQuality} />
                  <Score label="emotional IQ" value={reflectionRes.reflection.scores.emotionalIntelligence} />
                  <Score label="memory use" value={reflectionRes.reflection.scores.memoryEffectiveness} />
                  <Score label="goal" value={reflectionRes.reflection.scores.goalCompletion} />
                </CardContent>
              </Card>
              <ListCard icon={CheckCircle2} title="What worked" items={reflectionRes.reflection.wentWell} />
              <ListCard icon={XCircle} title="What didn't" items={reflectionRes.reflection.wentPoorly} />
              <ListCard
                icon={Lightbulb}
                title="Missed opportunities"
                items={reflectionRes.reflection.missedOpportunities}
              />
              <Card>
                <CardHeader><CardTitle>Lesson for next time</CardTitle></CardHeader>
                <CardContent>
                  <p className="rounded-lg border border-primary/25 bg-primary/8 p-3 text-sm leading-relaxed text-primary">
                    “{reflectionRes.reflection.advice}”
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    <strong className="text-foreground/80">Memory:</strong> {reflectionRes.reflection.memoryAssessment}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    <strong className="text-foreground/80">Emotion:</strong> {reflectionRes.reflection.emotionAssessment}
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Skeleton className="h-48" />
          )}
        </TabsContent>

        <TabsContent value="recording">
          {!call.hasRecording ? (
            <EmptyState
              icon={Disc3}
              title="No recording"
              description="Recording was disabled for this call, or it is still processing."
            />
          ) : recordingId ? (
            <Card>
              <CardContent className="pt-5">
                <AudioPlayer src={`/api/v1/recordings/${recordingId}/audio`} />
                <p className="mt-3 text-xs text-muted-foreground">
                  Dual-channel recording — manage it in{' '}
                  <Link href="/recordings" className="text-primary hover:underline">
                    Recordings
                  </Link>
                  .
                </p>
              </CardContent>
            </Card>
          ) : (
            <Skeleton className="h-24" />
          )}
        </TabsContent>

        <TabsContent value="events">
          <Card>
            <CardContent className="pt-5">
              {events && events.items.length === 0 ? (
                <EmptyState icon={Brain} title="No events" description="Live-screen events appear for calls made after setup." />
              ) : (
                <div className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-2">
                  {(events?.items ?? []).map((e) => (
                    <div key={e.id} className="flex items-start gap-3 rounded-md px-2 py-1.5 text-xs hover:bg-white/3">
                      <span className="font-mono-nums w-12 shrink-0 text-muted-foreground">
                        {fmtTimestampMs(e.tsMs)}
                      </span>
                      <span className="console-label w-24 shrink-0">{e.type}</span>
                      <span className="min-w-0 break-words text-muted-foreground">
                        {describeEvent(e)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function describeEvent(e: CallEventDto): string {
  const p = e.payload as Record<string, unknown>;
  switch (e.type) {
    case 'thought':
      return String(p.text ?? '');
    case 'tool_call':
      return `${p.name}(${JSON.stringify(p.args ?? {})}) → ${String(p.result ?? '').slice(0, 120)}`;
    case 'memory_recall':
      return `${(p.memories as unknown[])?.length ?? 0} memories (${p.trigger})`;
    case 'emotion':
      return `${p.label} · intensity ${Math.round(Number(p.intensity ?? 0) * 100)}% · ${p.trend ?? ''}`;
    case 'adaptation':
      return `${p.reason}: ${p.directive}`;
    case 'latency':
      return `turn ${p.turnMs}ms (avg ${p.avgMs}ms)`;
    case 'state':
      return `${p.state}${p.reason ? ` (${p.reason})` : ''}`;
    default:
      return JSON.stringify(p).slice(0, 140);
  }
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="surface px-4 py-3">
      <p className="console-label mb-1">{label}</p>
      <p className="font-mono-nums text-sm">{children}</p>
    </div>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="console-label">{label}</span>
        <span className="font-mono-nums text-sm font-semibold">{Math.round(value * 100)}</span>
      </div>
      <Progress value={value * 100} />
    </div>
  );
}

function ListCard({
  icon: Icon,
  title,
  items,
  className,
}: {
  icon: typeof Brain;
  title: string;
  items: string[];
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="size-4 text-primary" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing noted.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((it, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-foreground/90">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-primary/70" />
                {it}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
