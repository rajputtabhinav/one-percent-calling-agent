'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Drama, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import {
  REALTIME_VOICES,
  type PersonalityDto,
  type PersonalityStyle,
  type Settings,
} from '@onepct/shared';
import { api, fetcher } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/page-header';

const STYLE_KEYS: Array<{ key: keyof PersonalityStyle; label: string; low: string; high: string }> = [
  { key: 'pace', label: 'Pace', low: 'unhurried', high: 'brisk' },
  { key: 'warmth', label: 'Warmth', low: 'reserved', high: 'affectionate' },
  { key: 'formality', label: 'Formality', low: 'street', high: 'formal' },
  { key: 'humor', label: 'Humor', low: 'earnest', high: 'playful' },
  { key: 'empathy', label: 'Empathy', low: 'practical', high: 'feelings-first' },
];

const EMPTY: Omit<PersonalityDto, 'id' | 'isBuiltin' | 'createdAt' | 'updatedAt'> = {
  name: '',
  description: '',
  systemPrompt: '',
  style: { pace: 0.5, warmth: 0.6, formality: 0.4, humor: 0.4, empathy: 0.6 },
  voice: 'marin',
};

export default function PersonalitiesPage() {
  const { data, mutate } = useSWR<{ items: PersonalityDto[] }>('/personalities', fetcher);
  const { data: settingsRes, mutate: mutateSettings } = useSWR<{ settings: Settings }>(
    '/settings',
    fetcher,
  );
  const [editing, setEditing] = useState<PersonalityDto | 'new' | null>(null);
  const defaultId = settingsRes?.settings.personality.defaultId;

  async function makeDefault(id: string) {
    await api
      .put('/settings', { personality: { defaultId: id } })
      .catch((e) => toast.error(e.message));
    toast.success('Default personality set');
    void mutateSettings();
  }

  async function remove(p: PersonalityDto) {
    if (!confirm(`Delete "${p.name}"?`)) return;
    try {
      await api.del(`/personalities/${p.id}`);
      void mutate();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        label="character engine"
        title="Personalities"
        description="Who your digital human becomes when it picks up the phone."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> New personality
          </Button>
        }
      />

      {!data ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.items.map((p, i) => {
            const isDefault = p.id === defaultId || (!defaultId && p.name === 'Friendly');
            return (
              <Card key={p.id} className={`rise flex flex-col p-5 rise-${Math.min(5, (i % 5) + 1)}`}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="font-display text-lg font-semibold">{p.name}</h3>
                  <div className="flex items-center gap-1.5">
                    {isDefault ? <Badge>default</Badge> : null}
                    {p.isBuiltin ? <Badge variant="secondary">built-in</Badge> : null}
                  </div>
                </div>
                <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
                <div className="mb-4 space-y-1.5">
                  {STYLE_KEYS.map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="console-label w-16">{label}</span>
                      <div className="h-1 flex-1 rounded-full bg-white/8">
                        <div
                          className="h-1 rounded-full bg-gradient-to-r from-primary/70 to-accent/70"
                          style={{ width: `${p.style[key] * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-3">
                  <span className="font-mono-nums text-xs text-muted-foreground">voice · {p.voice}</span>
                  <div className="flex gap-1">
                    {!isDefault ? (
                      <button
                        title="Make default"
                        onClick={() => void makeDefault(p.id)}
                        className="rounded p-1.5 text-muted-foreground hover:text-primary cursor-pointer"
                      >
                        <Star className="size-4" />
                      </button>
                    ) : null}
                    <button
                      title="Edit"
                      onClick={() => setEditing(p)}
                      className="rounded p-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <Pencil className="size-4" />
                    </button>
                    {!p.isBuiltin ? (
                      <button
                        title="Delete"
                        onClick={() => void remove(p)}
                        className="rounded p-1.5 text-muted-foreground hover:text-destructive cursor-pointer"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editing ? (
        <PersonalityEditor
          personality={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void mutate();
          }}
        />
      ) : null}
    </>
  );
}

function PersonalityEditor({
  personality,
  onClose,
  onSaved,
}: {
  personality: PersonalityDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(personality ?? EMPTY);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!form.name.trim() || !form.systemPrompt.trim()) {
      toast.error('Name and character prompt are required');
      return;
    }
    setBusy(true);
    const body = {
      name: form.name,
      description: form.description,
      systemPrompt: form.systemPrompt,
      style: form.style,
      voice: form.voice,
    };
    try {
      if (personality) await api.put(`/personalities/${personality.id}`, body);
      else await api.post('/personalities', body);
      toast.success('Personality saved');
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Drama className="size-5 text-primary" />
            {personality ? `Edit ${personality.name}` : 'New personality'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Voice</Label>
              <Select value={form.voice} onValueChange={(v) => setForm({ ...form, voice: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REALTIME_VOICES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>One-line description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Character prompt — how it behaves on calls</Label>
            <Textarea
              rows={5}
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              placeholder="You are calm and dry-witted. You listen carefully, speak in short sentences…"
            />
          </div>
          <div className="space-y-3">
            {STYLE_KEYS.map(({ key, label, low, high }) => (
              <div key={key}>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <Label>{label}</Label>
                  <span className="text-muted-foreground">
                    {low} ←{' '}
                    <span className="font-mono-nums text-foreground">
                      {Math.round(form.style[key] * 100)}
                    </span>{' '}
                    → {high}
                  </span>
                </div>
                <Slider
                  value={[form.style[key]]}
                  min={0}
                  max={1}
                  step={0.05}
                  onValueChange={([v]) =>
                    setForm({ ...form, style: { ...form.style, [key]: v } })
                  }
                />
              </div>
            ))}
          </div>
          <Button className="w-full" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save personality'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
