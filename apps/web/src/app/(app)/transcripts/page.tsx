'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { FileText, Search } from 'lucide-react';
import type { TranscriptSearchHit } from '@onepct/shared';
import { fetcher } from '@/lib/api';
import { fmtDateTime, fmtTimestampMs } from '@/lib/format';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';

function renderSnippet(snippet: string) {
  // ts_headline marks hits with ⟦…⟧ — render as <mark>.
  const parts = snippet.split(/(⟦[^⟧]*⟧)/g);
  return parts.map((part, i) =>
    part.startsWith('⟦') ? <mark key={i}>{part.slice(1, -1)}</mark> : <span key={i}>{part}</span>,
  );
}

export default function TranscriptsPage() {
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');
  const { data, isLoading } = useSWR<{ items: TranscriptSearchHit[] }>(
    submitted ? `/transcripts/search?q=${encodeURIComponent(submitted)}&limit=50` : null,
    fetcher,
  );

  return (
    <>
      <PageHeader
        label="full-text search"
        title="Transcripts"
        description="Search every word ever spoken across all calls."
      />

      <form
        className="rise rise-1 relative mb-6"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(q.trim());
        }}
      >
        <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder='Try "wedding", "invoice", "birthday plans"… (press Enter)'
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-12 pl-11 text-base"
        />
      </form>

      {!submitted ? (
        <EmptyState
          icon={FileText}
          title="Search the archive"
          description="Postgres full-text search over every transcript segment, with highlighted snippets."
        />
      ) : isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : data && data.items.length === 0 ? (
        <EmptyState icon={FileText} title="No matches" description={`Nothing said on any call matches "${submitted}".`} />
      ) : (
        <div className="space-y-3">
          {(data?.items ?? []).map((hit, i) => (
            <Link key={hit.segmentId} href={`/calls/${hit.callId}`} className="block">
              <Card className={`rise p-4 transition-colors hover:border-primary/40 rise-${Math.min(5, i + 1)}`}>
                <p className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {hit.contactName ?? (hit.direction === 'inbound' ? hit.fromNumber : hit.toNumber)}
                  </span>
                  · {fmtDateTime(hit.callStartedAt)} ·
                  <span className="font-mono-nums">@{fmtTimestampMs(hit.startedMs)}</span> ·
                  <span className={hit.speaker === 'ai' ? 'text-accent' : 'text-primary'}>
                    {hit.speaker === 'ai' ? 'agent said' : 'they said'}
                  </span>
                </p>
                <p className="text-sm leading-relaxed">{renderSnippet(hit.snippet)}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
