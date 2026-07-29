import type { CallStatus } from '@onepct/shared';
import { Badge } from '@/components/ui/badge';

const MAP: Record<CallStatus, { label: string; variant: 'default' | 'accent' | 'secondary' | 'destructive' | 'success' }> = {
  queued: { label: 'Queued', variant: 'secondary' },
  ringing: { label: 'Ringing', variant: 'default' },
  in_progress: { label: 'Live', variant: 'default' },
  completed: { label: 'Completed', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
  no_answer: { label: 'No answer', variant: 'secondary' },
  busy: { label: 'Busy', variant: 'secondary' },
  canceled: { label: 'Canceled', variant: 'secondary' },
};

export function StatusBadge({ status }: { status: CallStatus }) {
  const { label, variant } = MAP[status] ?? MAP.queued;
  return (
    <Badge variant={variant}>
      {status === 'in_progress' ? <span className="live-dot !size-1.5" /> : null}
      {label}
    </Badge>
  );
}
