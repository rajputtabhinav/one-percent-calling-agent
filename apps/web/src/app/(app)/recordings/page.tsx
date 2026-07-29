'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Disc3, ExternalLink, Trash2 } from 'lucide-react';
import type { Paginated, RecordingDto } from '@onepct/shared';
import { api, fetcher } from '@/lib/api';
import { fmtBytes, fmtDateTime, fmtDuration } from '@/lib/format';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AudioPlayer } from '@/components/audio-player';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';

export default function RecordingsPage() {
  const { data, mutate } = useSWR<Paginated<RecordingDto>>('/recordings?limit=50', fetcher);

  async function remove(id: string) {
    if (!confirm('Delete this recording permanently?')) return;
    try {
      await api.del(`/recordings/${id}`);
      toast.success('Recording deleted');
      void mutate();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        label="audio archive"
        title="Recordings"
        description="Dual-channel call audio, stored locally on your machine."
      />

      {!data ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Disc3}
          title="No recordings yet"
          description="Enable recording in Settings → Calls, then every call lands here."
        />
      ) : (
        <div className="space-y-3">
          {data.items.map((r, i) => (
            <Card key={r.id} className={`rise p-4 rise-${Math.min(5, i + 1)}`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {r.contactName ?? (r.direction === 'inbound' ? r.fromNumber : r.toNumber)}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {fmtDateTime(r.callStartedAt ?? r.createdAt)} · {fmtDuration(r.durationSeconds)} ·{' '}
                      {fmtBytes(r.sizeBytes)} · {r.channels}ch {r.format}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Link
                    href={`/calls/${r.callId}`}
                    className="rounded-md p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground"
                    title="Open call"
                  >
                    <ExternalLink className="size-4" />
                  </Link>
                  <button
                    onClick={() => remove(r.id)}
                    className="rounded-md p-2 text-muted-foreground hover:bg-destructive/15 hover:text-destructive cursor-pointer"
                    title="Delete"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
              {r.status === 'ready' ? (
                <AudioPlayer src={`/api/v1/recordings/${r.id}/audio`} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  {r.status === 'pending' ? 'Processing — the provider is still delivering this recording.' : 'Failed to fetch from provider.'}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
