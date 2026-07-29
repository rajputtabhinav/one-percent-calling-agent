'use client';

import Link from 'next/link';
import useSWR from 'swr';
import {
  ArrowUpRight,
  Brain,
  Clock,
  Gauge,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Sparkles,
} from 'lucide-react';
import type { AnalyticsOverview, CallDto, MemoryDto, RelationshipGrowthRow } from '@onepct/shared';
import { fetcher } from '@/lib/api';
import { fmtDurationLong, fmtRelative } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DialDialog } from '@/components/dial-dialog';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';

export default function DashboardPage() {
  const { data: overview } = useSWR<AnalyticsOverview>('/analytics/overview', fetcher, {
    refreshInterval: 30000,
  });
  const { data: calls } = useSWR<{ items: CallDto[] }>('/calls?limit=6', fetcher, {
    refreshInterval: 15000,
  });
  const { data: relationships } = useSWR<{ items: RelationshipGrowthRow[] }>(
    '/analytics/relationships',
    fetcher,
  );
  const { data: memories } = useSWR<{ items: MemoryDto[] }>('/memories?limit=5', fetcher);

  return (
    <>
      <PageHeader
        label="overview"
        title="Command center"
        description="Your digital human's calls, memory, and relationships at a glance."
        actions={<DialDialog />}
      />

      <div className="rise rise-1 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={Phone}
          label="calls · 7 days"
          value={overview ? String(overview.callsLast7Days) : '…'}
          hint={overview ? `${overview.totalCalls} all time` : undefined}
        />
        <StatCard
          icon={Clock}
          label="talk time"
          value={overview ? fmtDurationLong(overview.totalDurationSeconds) : '…'}
          hint={overview ? `avg ${fmtDurationLong(overview.avgDurationSeconds)} per call` : undefined}
        />
        <StatCard
          icon={Sparkles}
          label="conversation quality"
          value={overview?.avgQualityScore != null ? `${overview.avgQualityScore}` : '—'}
          hint="self-scored 0–100"
        />
        <StatCard
          icon={Gauge}
          label="response latency"
          value={overview?.avgLatencyMs != null ? `${(overview.avgLatencyMs / 1000).toFixed(1)}s` : '—'}
          hint="speech → first word"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        {/* Recent calls */}
        <Card className="rise rise-2 lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent calls</CardTitle>
            <Link
              href="/calls"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              all calls <ArrowUpRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-1">
            {!calls ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : calls.items.length === 0 ? (
              <EmptyState
                icon={Phone}
                title="No calls yet"
                description="Place your first call and watch your digital human work."
                action={<DialDialog />}
              />
            ) : (
              calls.items.map((c) => (
                <Link
                  key={c.id}
                  href={c.status === 'in_progress' ? `/calls/live/${c.id}` : `/calls/${c.id}`}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-white/4"
                >
                  {c.direction === 'inbound' ? (
                    <PhoneIncoming className="size-4 shrink-0 text-accent" />
                  ) : (
                    <PhoneOutgoing className="size-4 shrink-0 text-primary" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {c.contactName ?? (c.direction === 'inbound' ? c.fromNumber : c.toNumber)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.goal ?? 'no goal set'}
                    </p>
                  </div>
                  <span className="font-mono-nums text-xs text-muted-foreground">
                    {fmtDurationLong(c.durationSeconds)}
                  </span>
                  <StatusBadge status={c.status} />
                  <span className="w-16 text-right text-xs text-muted-foreground">
                    {fmtRelative(c.createdAt)}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Relationships */}
        <Card className="rise rise-3 lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Relationships</CardTitle>
            <Link
              href="/analytics"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              growth <ArrowUpRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {(relationships?.items ?? []).slice(0, 5).map((r) => (
              <div key={r.contactId} className="flex items-center gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-white/4 font-display text-xs font-bold">
                  {r.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{r.name}</p>
                  <div className="mt-1 h-1 w-full rounded-full bg-white/8">
                    <div
                      className="h-1 rounded-full bg-gradient-to-r from-primary/80 to-accent/80"
                      style={{ width: `${Math.min(100, r.familiarityScore)}%` }}
                    />
                  </div>
                </div>
                <span className="font-mono-nums text-xs text-muted-foreground">
                  {r.interactionCount}×
                </span>
              </div>
            ))}
            {relationships && relationships.items.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Familiarity grows with every conversation.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Fresh memories */}
      <Card className="rise rise-4 mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Freshly remembered</CardTitle>
          <Link
            href="/memories"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            all memories <ArrowUpRight className="size-3" />
          </Link>
        </CardHeader>
        <CardContent>
          {memories && memories.items.length === 0 ? (
            <EmptyState
              icon={Brain}
              title="Memory is empty"
              description="After each call, lasting facts are extracted and stored here."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {(memories?.items ?? []).slice(0, 6).map((m) => (
                <div key={m.id} className="rounded-lg border border-border bg-white/3 p-3">
                  <p className="console-label mb-1.5">
                    {m.kind} {m.contactName ? `· ${m.contactName}` : ''}
                  </p>
                  <p className="line-clamp-3 text-sm leading-relaxed">{m.content}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
