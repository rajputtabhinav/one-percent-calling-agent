'use client';

import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import type { EmotionUpdateEvent } from '@onepct/shared';
import { EmotionChip } from '@/components/emotion-chip';
import { Progress } from '@/components/ui/progress';

export function EmotionMeter({ state }: { state: EmotionUpdateEvent | null }) {
  if (!state) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">
        Listening for emotional signals…
      </p>
    );
  }
  const TrendIcon =
    state.trend === 'improving' ? TrendingUp : state.trend === 'declining' ? TrendingDown : Minus;
  const trendColor =
    state.trend === 'improving'
      ? 'text-emerald-300'
      : state.trend === 'declining'
        ? 'text-rose-300'
        : 'text-muted-foreground';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <EmotionChip label={state.label} />
        <span className={`flex items-center gap-1 text-xs ${trendColor}`}>
          <TrendIcon className="size-3.5" />
          {state.trend}
        </span>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
          <span>intensity</span>
          <span className="font-mono-nums">{Math.round(state.intensity * 100)}%</span>
        </div>
        <Progress value={state.intensity * 100} />
      </div>
      <div>
        <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
          <span>negative</span>
          <span>mood</span>
          <span>positive</span>
        </div>
        <div className="relative h-1.5 w-full rounded-full bg-gradient-to-r from-rose-500/40 via-white/10 to-emerald-400/40">
          <span
            className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full border border-white/40 bg-foreground shadow"
            style={{ left: `calc(${((state.valence + 1) / 2) * 100}% - 6px)` }}
          />
        </div>
      </div>
    </div>
  );
}
