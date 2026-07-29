import type { LucideIcon } from 'lucide-react';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="surface flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <div className="mb-1 flex size-11 items-center justify-center rounded-full border border-border bg-white/4">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <p className="font-display font-semibold">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
