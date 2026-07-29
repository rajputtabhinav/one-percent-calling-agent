'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { Phone, PhoneIncoming, PhoneOutgoing, Search } from 'lucide-react';
import type { CallDto, CallStatus } from '@onepct/shared';
import { fetcher } from '@/lib/api';
import { fmtDateTime, fmtDuration, fmtMs } from '@/lib/format';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DialDialog } from '@/components/dial-dialog';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';

const STATUS_OPTIONS: Array<{ value: CallStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'in_progress', label: 'Live' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'no_answer', label: 'No answer' },
  { value: 'busy', label: 'Busy' },
  { value: 'canceled', label: 'Canceled' },
];

export default function CallsPage() {
  const [q, setQ] = useState('');
  const [direction, setDirection] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [status, setStatus] = useState<CallStatus | 'all'>('all');
  const [page, setPage] = useState(0);
  const limit = 25;

  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (direction !== 'all') params.set('direction', direction);
  if (status !== 'all') params.set('status', status);
  params.set('limit', String(limit));
  params.set('offset', String(page * limit));

  const { data } = useSWR<{ items: CallDto[]; total: number }>(
    `/calls?${params.toString()}`,
    fetcher,
    { refreshInterval: 10000 },
  );

  return (
    <>
      <PageHeader
        label="telephony"
        title="Calls"
        description="Every conversation your digital human has had — searchable, replayable, remembered."
        actions={<DialDialog />}
      />

      <div className="rise rise-1 mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search transcripts, names, numbers…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            className="pl-9"
          />
        </div>
        <Select value={direction} onValueChange={(v) => { setDirection(v as typeof direction); setPage(0); }}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All directions</SelectItem>
            <SelectItem value="outbound">Outbound</SelectItem>
            <SelectItem value="inbound">Inbound</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => { setStatus(v as typeof status); setPage(0); }}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rise rise-2 surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="console-label px-4 py-3 font-normal">when</th>
              <th className="console-label px-4 py-3 font-normal">contact</th>
              <th className="console-label px-4 py-3 font-normal">duration</th>
              <th className="console-label px-4 py-3 font-normal">latency</th>
              <th className="console-label px-4 py-3 font-normal">quality</th>
              <th className="console-label px-4 py-3 font-normal">status</th>
            </tr>
          </thead>
          <tbody>
            {!data ? (
              [...Array(6)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={6} className="px-4 py-2">
                    <Skeleton className="h-9" />
                  </td>
                </tr>
              ))
            ) : data.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6">
                  <EmptyState icon={Phone} title="No calls match" description="Adjust filters or place a new call." />
                </td>
              </tr>
            ) : (
              data.items.map((c) => (
                <tr key={c.id} className="group border-b border-border/50 last:border-0 hover:bg-white/3">
                  <td className="px-4 py-3">
                    <Link
                      href={c.status === 'in_progress' ? `/calls/live/${c.id}` : `/calls/${c.id}`}
                      className="block"
                    >
                      <span className="font-mono-nums text-xs text-muted-foreground">
                        {fmtDateTime(c.createdAt)}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={c.status === 'in_progress' ? `/calls/live/${c.id}` : `/calls/${c.id}`}
                      className="flex items-center gap-2"
                    >
                      {c.direction === 'inbound' ? (
                        <PhoneIncoming className="size-3.5 text-accent" />
                      ) : (
                        <PhoneOutgoing className="size-3.5 text-primary" />
                      )}
                      <span className="font-medium group-hover:text-primary">
                        {c.contactName ?? (c.direction === 'inbound' ? c.fromNumber : c.toNumber)}
                      </span>
                    </Link>
                  </td>
                  <td className="font-mono-nums px-4 py-3 text-muted-foreground">
                    {fmtDuration(c.durationSeconds)}
                  </td>
                  <td className="font-mono-nums px-4 py-3 text-muted-foreground">
                    {fmtMs(c.latencyMsAvg)}
                  </td>
                  <td className="font-mono-nums px-4 py-3 text-muted-foreground">
                    {c.qualityScore != null ? Math.round(c.qualityScore) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && data.total > limit ? (
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {page * limit + 1}–{Math.min((page + 1) * limit, data.total)} of {data.total}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="rounded border border-border px-3 py-1 hover:bg-white/5 disabled:opacity-40 cursor-pointer"
            >
              Prev
            </button>
            <button
              disabled={(page + 1) * limit >= data.total}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-border px-3 py-1 hover:bg-white/5 disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
