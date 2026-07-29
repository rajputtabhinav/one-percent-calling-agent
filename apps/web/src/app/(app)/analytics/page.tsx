'use client';

import useSWR from 'swr';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Brain, Clock, Phone, Sparkles } from 'lucide-react';
import type {
  AnalyticsOverview,
  EmotionTrendPoint,
  QualityTrendPoint,
  RelationshipGrowthRow,
  TimeseriesPoint,
} from '@onepct/shared';
import { fetcher } from '@/lib/api';
import { fmtDurationLong, fmtRelative } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';

const AXIS = { stroke: 'rgba(255,255,255,0.25)', fontSize: 11 };
const GRID = 'rgba(255,255,255,0.05)';
const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'var(--popover)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    fontSize: 12,
  },
  labelStyle: { color: 'var(--muted-foreground)' },
};

const EMOTION_COLORS: Record<string, string> = {
  happy: '#34d399',
  excited: '#fbbf24',
  neutral: '#94a3b8',
  confused: '#38bdf8',
  stressed: '#fb923c',
  frustrated: '#fb7185',
  angry: '#ef4444',
  sad: '#818cf8',
};

export default function AnalyticsPage() {
  const { data: overview } = useSWR<AnalyticsOverview>('/analytics/overview', fetcher);
  const { data: timeseries } = useSWR<{ items: TimeseriesPoint[] }>(
    '/analytics/timeseries?days=30',
    fetcher,
  );
  const { data: emotions } = useSWR<{ items: EmotionTrendPoint[] }>(
    '/analytics/emotions?days=30',
    fetcher,
  );
  const { data: quality } = useSWR<{ items: QualityTrendPoint[] }>(
    '/analytics/quality?days=90',
    fetcher,
  );
  const { data: relationships } = useSWR<{ items: RelationshipGrowthRow[] }>(
    '/analytics/relationships',
    fetcher,
  );

  const emotionData = (emotions?.items ?? []).map((p) => ({ day: p.day.slice(5), ...p.distribution }));
  const presentEmotions = Object.keys(EMOTION_COLORS).filter((label) =>
    emotionData.some((d) => (d as Record<string, unknown>)[label] !== undefined),
  );

  return (
    <>
      <PageHeader
        label="instrumentation"
        title="Analytics"
        description="How well the digital human converses, feels, and remembers — over time."
      />

      <div className="rise rise-1 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Phone} label="total calls" value={overview ? String(overview.totalCalls) : '…'} />
        <StatCard
          icon={Clock}
          label="total talk time"
          value={overview ? fmtDurationLong(overview.totalDurationSeconds) : '…'}
        />
        <StatCard
          icon={Sparkles}
          label="avg quality"
          value={overview?.avgQualityScore != null ? `${overview.avgQualityScore}/100` : '—'}
        />
        <StatCard
          icon={Brain}
          label="active memories"
          value={overview ? String(overview.activeMemories) : '…'}
          hint={overview ? `${overview.totalMemories} total stored` : undefined}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card className="rise rise-2">
          <CardHeader><CardTitle>Calls per day · 30d</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={(timeseries?.items ?? []).map((p) => ({ ...p, day: p.day.slice(5) }))}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="day" {...AXIS} tickLine={false} axisLine={false} />
                <YAxis {...AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                <Tooltip {...TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="outbound" stackId="a" fill="#f5a524" radius={[0, 0, 0, 0]} />
                <Bar dataKey="inbound" stackId="a" fill="#2dd4bf" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rise rise-2">
          <CardHeader><CardTitle>Talk time · 30d</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={(timeseries?.items ?? []).map((p) => ({
                  day: p.day.slice(5),
                  minutes: Math.round(p.durationSeconds / 60),
                }))}
              >
                <defs>
                  <linearGradient id="talkFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f5a524" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#f5a524" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="day" {...AXIS} tickLine={false} axisLine={false} />
                <YAxis {...AXIS} tickLine={false} axisLine={false} width={28} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="minutes" stroke="#f5a524" fill="url(#talkFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rise rise-3">
          <CardHeader><CardTitle>Emotions heard · 30d</CardTitle></CardHeader>
          <CardContent className="h-64">
            {emotionData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Emotion data appears after your first calls.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={emotionData}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="day" {...AXIS} tickLine={false} axisLine={false} />
                  <YAxis {...AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                  <Tooltip {...TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {presentEmotions.map((label) => (
                    <Bar key={label} dataKey={label} stackId="e" fill={EMOTION_COLORS[label]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rise rise-3">
          <CardHeader><CardTitle>Self-scored performance · 90d</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={(quality?.items ?? []).map((p) => ({ ...p, day: p.day.slice(5) }))}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="day" {...AXIS} tickLine={false} axisLine={false} />
                <YAxis {...AXIS} domain={[0, 1]} tickLine={false} axisLine={false} width={28} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="conversationQuality" name="conversation" stroke="#f5a524" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="emotionalIntelligence" name="emotional IQ" stroke="#2dd4bf" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="memoryEffectiveness" name="memory" stroke="#8b7cf6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="rise rise-4 mt-5">
        <CardHeader><CardTitle>Relationship growth</CardTitle></CardHeader>
        <CardContent>
          {relationships && relationships.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Familiarity and trust scores build as the agent talks to people.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="console-label py-2 pr-4 font-normal">contact</th>
                  <th className="console-label py-2 pr-4 font-normal">familiarity</th>
                  <th className="console-label py-2 pr-4 font-normal">trust</th>
                  <th className="console-label py-2 pr-4 font-normal">calls</th>
                  <th className="console-label py-2 pr-4 font-normal">30d growth</th>
                  <th className="console-label py-2 font-normal">last spoke</th>
                </tr>
              </thead>
              <tbody>
                {(relationships?.items ?? []).map((r) => (
                  <tr key={r.contactId} className="border-b border-border/40 last:border-0">
                    <td className="py-2.5 pr-4 font-medium">{r.name}</td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 rounded-full bg-white/8">
                          <div
                            className="h-1.5 rounded-full bg-primary"
                            style={{ width: `${Math.min(100, r.familiarityScore)}%` }}
                          />
                        </div>
                        <span className="font-mono-nums text-xs text-muted-foreground">
                          {r.familiarityScore}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 rounded-full bg-white/8">
                          <div
                            className="h-1.5 rounded-full bg-accent"
                            style={{ width: `${Math.min(100, r.trustScore)}%` }}
                          />
                        </div>
                        <span className="font-mono-nums text-xs text-muted-foreground">{r.trustScore}</span>
                      </div>
                    </td>
                    <td className="font-mono-nums py-2.5 pr-4">{r.interactionCount}</td>
                    <td className="font-mono-nums py-2.5 pr-4">
                      <span className={r.familiarityDelta30d > 0 ? 'text-emerald-300' : 'text-muted-foreground'}>
                        {r.familiarityDelta30d > 0 ? '+' : ''}
                        {r.familiarityDelta30d}
                      </span>
                    </td>
                    <td className="py-2.5 text-muted-foreground">{fmtRelative(r.lastInteractionAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
