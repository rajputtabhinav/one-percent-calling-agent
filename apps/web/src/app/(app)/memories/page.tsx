'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Brain, Plus, Search, Trash2 } from 'lucide-react';
import { MEMORY_KINDS, type ContactDto, type MemoryDto, type MemoryKind } from '@onepct/shared';
import { api, fetcher } from '@/lib/api';
import { fmtRelative } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';

const KIND_COLORS: Record<MemoryKind, string> = {
  fact: 'text-sky-300',
  preference: 'text-emerald-300',
  event: 'text-amber-300',
  relationship: 'text-pink-300',
  identity: 'text-violet-300',
  commitment: 'text-orange-300',
  other: 'text-slate-300',
};

export default function MemoriesPage() {
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [kind, setKind] = useState<MemoryKind | 'all'>('all');
  const params = new URLSearchParams({ limit: '60' });
  if (submitted) params.set('q', submitted);
  if (kind !== 'all') params.set('kind', kind);

  const { data, mutate } = useSWR<{ items: MemoryDto[]; total: number }>(
    `/memories?${params.toString()}`,
    fetcher,
  );

  async function remove(id: string) {
    if (!confirm('Forget this memory permanently?')) return;
    await api.del(`/memories/${id}`).catch((e) => toast.error(e.message));
    void mutate();
  }

  async function toggleActive(m: MemoryDto) {
    await api.patch(`/memories/${m.id}`, { isActive: !m.isActive }).catch((e) => toast.error(e.message));
    void mutate();
  }

  return (
    <>
      <PageHeader
        label="long-term memory"
        title="Memories"
        description="Everything the digital human knows about the people it talks to."
        actions={<NewMemoryDialog onCreated={() => void mutate()} />}
      />

      <form
        className="rise rise-1 mb-4 flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(q.trim());
        }}
      >
        <div className="relative min-w-64 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Semantic search — “what does Ravi like to eat?” (press Enter)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            {MEMORY_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </form>

      {!data ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Brain}
          title="Nothing remembered yet"
          description="Memories are extracted automatically after calls, saved mid-call by the agent, or added manually."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data.items.map((m, i) => (
            <div
              key={m.id}
              className={`surface rise flex flex-col p-4 rise-${Math.min(5, (i % 5) + 1)} ${m.isActive ? '' : 'opacity-50'}`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className={`console-label ${KIND_COLORS[m.kind]}`}>{m.kind}</span>
                {m.score !== undefined ? (
                  <Badge variant="accent" className="font-mono-nums">
                    {(m.score * 100).toFixed(0)}% match
                  </Badge>
                ) : null}
              </div>
              <p className="flex-1 text-sm leading-relaxed">{m.content}</p>
              <div className="mt-3 border-t border-border/60 pt-2.5">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{m.contactName ?? 'global'}</span>
                  <span>
                    {fmtRelative(m.createdAt)} · used {m.referenceCount}×
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-1 w-16 rounded-full bg-white/8">
                      <div
                        className="h-1 rounded-full bg-primary"
                        style={{ width: `${m.importance * 100}%` }}
                      />
                    </div>
                    <span className="font-mono-nums text-[10px] text-muted-foreground">
                      {Math.round(m.importance * 100)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Switch checked={m.isActive} onCheckedChange={() => void toggleActive(m)} />
                    <button
                      onClick={() => void remove(m.id)}
                      className="rounded p-1 text-muted-foreground hover:text-destructive cursor-pointer"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function NewMemoryDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [kind, setKind] = useState<MemoryKind>('fact');
  const [contactId, setContactId] = useState('');
  const [importance, setImportance] = useState(0.6);
  const { data: contacts } = useSWR<{ items: ContactDto[] }>(open ? '/contacts?limit=100' : null, fetcher);

  async function save() {
    if (!content.trim()) return;
    try {
      await api.post('/memories', {
        content: content.trim(),
        kind,
        importance,
        ...(contactId ? { contactId } : {}),
      });
      toast.success('Remembered');
      setOpen(false);
      setContent('');
      onCreated();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> New memory
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Teach it something</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Memory</Label>
            <Textarea
              placeholder="e.g. Ravi is vegetarian and hates being called before 10am"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as MemoryKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEMORY_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>About</Label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger>
                  <SelectValue placeholder="Global (everyone)" />
                </SelectTrigger>
                <SelectContent>
                  {(contacts?.items ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Importance</Label>
              <span className="font-mono-nums text-xs text-muted-foreground">
                {Math.round(importance * 100)}
              </span>
            </div>
            <Slider
              value={[importance]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={([v]) => setImportance(v)}
            />
          </div>
          <Button className="w-full" onClick={save}>
            Save memory
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
