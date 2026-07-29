export function PageHeader({
  label,
  title,
  description,
  actions,
}: {
  label: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="rise mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="console-label mb-1.5">{label}</p>
        <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
