'use client';

import {
  Brain,
  Lightbulb,
  MessageCircleWarning,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { fmtTimestampMs } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface ThoughtItem {
  id: string;
  tsMs: number;
  kind: 'strategy' | 'observation' | 'tool' | 'memory' | 'adaptation';
  title: string;
  detail?: string;
}

const KIND_STYLE: Record<ThoughtItem['kind'], { icon: typeof Sparkles; color: string; label: string }> = {
  strategy: { icon: Lightbulb, color: 'text-amber-300', label: 'thinking' },
  observation: { icon: Sparkles, color: 'text-slate-300', label: 'noticing' },
  tool: { icon: Wrench, color: 'text-sky-300', label: 'tool' },
  memory: { icon: Brain, color: 'text-violet-300', label: 'memory' },
  adaptation: { icon: MessageCircleWarning, color: 'text-rose-300', label: 'adapting' },
};

export function ThoughtFeed({ items, className }: { items: ThoughtItem[]; className?: string }) {
  return (
    <div className={cn('space-y-2 overflow-y-auto pr-1', className)}>
      {items.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          The agent&apos;s inner monologue appears here.
        </p>
      ) : null}
      {[...items].reverse().map((t) => {
        const s = KIND_STYLE[t.kind];
        const Icon = s.icon;
        return (
          <div key={t.id} className="rise rounded-lg border border-border bg-white/3 px-3 py-2">
            <p className={cn('flex items-center gap-1.5 text-[10px] uppercase tracking-wider', s.color)}>
              <Icon className="size-3" />
              {s.label}
              <span className="font-mono-nums ml-auto normal-case text-muted-foreground/70">
                {fmtTimestampMs(t.tsMs)}
              </span>
            </p>
            <p className="mt-1 text-xs leading-relaxed text-foreground/90">{t.title}</p>
            {t.detail ? (
              <p className="mt-0.5 break-words text-[11px] leading-relaxed text-muted-foreground">
                {t.detail}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
