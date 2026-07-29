import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <Card className={`p-5 ${className ?? ''}`}>
      <div className="flex items-start justify-between">
        <p className="console-label">{label}</p>
        <Icon className="size-4 text-primary/70" />
      </div>
      <p className="font-display mt-2 text-[1.7rem] font-bold leading-none tracking-tight">
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}
