import type { EmotionLabel } from '@onepct/shared';
import { cn } from '@/lib/utils';

const STYLE: Record<EmotionLabel, { dot: string; text: string }> = {
  happy: { dot: 'bg-emerald-400', text: 'text-emerald-300' },
  excited: { dot: 'bg-amber-400', text: 'text-amber-300' },
  neutral: { dot: 'bg-slate-400', text: 'text-slate-300' },
  confused: { dot: 'bg-sky-400', text: 'text-sky-300' },
  stressed: { dot: 'bg-orange-400', text: 'text-orange-300' },
  frustrated: { dot: 'bg-rose-400', text: 'text-rose-300' },
  angry: { dot: 'bg-red-500', text: 'text-red-400' },
  sad: { dot: 'bg-indigo-400', text: 'text-indigo-300' },
};

export function EmotionChip({
  label,
  intensity,
  className,
}: {
  label: EmotionLabel;
  intensity?: number;
  className?: string;
}) {
  const s = STYLE[label] ?? STYLE.neutral;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-white/4 px-2 py-0.5 text-[11px]',
        s.text,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', s.dot)} />
      {label}
      {intensity !== undefined ? (
        <span className="font-mono-nums opacity-70">{Math.round(intensity * 100)}%</span>
      ) : null}
    </span>
  );
}
