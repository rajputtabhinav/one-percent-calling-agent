'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { KeyRound, Save, ShieldCheck } from 'lucide-react';
import {
  REALTIME_VOICES,
  SECRET_KEYS,
  type AuditLogDto,
  type SecretStatusDto,
  type Settings,
} from '@onepct/shared';
import { api, fetcher } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { PageHeader } from '@/components/page-header';

export default function SettingsPage() {
  const { data, mutate } = useSWR<{ settings: Settings }>('/settings', fetcher);
  const [form, setForm] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data && !form) setForm(structuredClone(data.settings));
  }, [data, form]);

  const dirty = form && data ? JSON.stringify(form) !== JSON.stringify(data.settings) : false;

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      await api.put('/settings', form);
      toast.success('Settings saved');
      await mutate();
      setForm(null); // re-sync from server
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!form) {
    return (
      <>
        <PageHeader label="configuration" title="Settings" />
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </>
    );
  }

  const set = <S extends keyof Settings>(section: S, patch: Partial<Settings[S]>) =>
    setForm((f) => (f ? { ...f, [section]: { ...f[section], ...patch } } : f));

  return (
    <>
      <PageHeader
        label="configuration"
        title="Settings"
        description="Voice, telephony, memory behavior, and the agent's operating rules."
        actions={
          <Button onClick={save} disabled={!dirty || saving}>
            <Save /> {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
          </Button>
        }
      />

      <div className="space-y-5">
        {/* Telephony */}
        <Card className="rise rise-1">
          <CardHeader>
            <CardTitle>Telephony</CardTitle>
            <CardDescription>Which provider dials and answers, and what number it uses.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Select
                value={form.telephony.provider}
                onValueChange={(v) => set('telephony', { provider: v as 'twilio' | 'exotel' })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="twilio">Twilio</SelectItem>
                  <SelectItem value="exotel">Exotel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>From number (E.164 / exophone)</Label>
              <Input
                className="font-mono-nums"
                placeholder="+1415xxxxxxx"
                value={form.telephony.fromNumber}
                onChange={(e) => set('telephony', { fromNumber: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Default country code</Label>
              <Input
                className="font-mono-nums"
                placeholder="+91"
                value={form.telephony.defaultCountryCode}
                onChange={(e) => set('telephony', { defaultCountryCode: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Voice & AI */}
        <Card className="rise rise-2">
          <CardHeader>
            <CardTitle>Voice & AI</CardTitle>
            <CardDescription>The models and voice behind the digital human.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Default voice</Label>
                <Select
                  value={form.voice.voice}
                  onValueChange={(v) => set('voice', { voice: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REALTIME_VOICES.map((v) => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Realtime model</Label>
                <Input
                  value={form.voice.realtimeModel}
                  onChange={(e) => set('voice', { realtimeModel: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Analysis model</Label>
                <Input
                  value={form.ai.chatModel}
                  onChange={(e) => set('ai', { chatModel: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Fast model (emotion/thoughts)</Label>
                <Input
                  value={form.ai.miniModel}
                  onChange={(e) => set('ai', { miniModel: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Temperature</Label>
                  <span className="font-mono-nums text-xs text-muted-foreground">
                    {form.ai.temperature.toFixed(2)}
                  </span>
                </div>
                <Slider
                  value={[form.ai.temperature]}
                  min={0}
                  max={1.5}
                  step={0.05}
                  onValueChange={([v]) => set('ai', { temperature: v })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>“Are you an AI?” policy</Label>
                <Select
                  value={form.ai.disclosure}
                  onValueChange={(v) => set('ai', { disclosure: v as Settings['ai']['disclosure'] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="on_ask">Honest when asked (recommended)</SelectItem>
                    <SelectItem value="always">Disclose proactively</SelectItem>
                    <SelectItem value="never">Deflect once, honest if pressed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div>
                  <Label className="text-foreground">Live strategist</Label>
                  <p className="text-[11px] text-muted-foreground">Streams AI thoughts during calls</p>
                </div>
                <Switch
                  checked={form.ai.strategist}
                  onCheckedChange={(v) => set('ai', { strategist: v })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Calls & inbound */}
        <div className="rise rise-3 grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Calls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ToggleRow
                label="Record calls"
                hint="Dual-channel audio stored locally"
                checked={form.call.record}
                onChange={(v) => set('call', { record: v })}
              />
              <ToggleRow
                label="Announce recording"
                hint="Plays a notice before connecting (check your local law)"
                checked={form.call.announceRecording}
                onChange={(v) => set('call', { announceRecording: v })}
              />
              <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div>
                  <Label className="text-foreground">Max duration</Label>
                  <p className="text-[11px] text-muted-foreground">Hard cap per call, minutes</p>
                </div>
                <Input
                  type="number"
                  min={1}
                  max={180}
                  className="w-20 text-center font-mono-nums"
                  value={form.call.maxDurationMinutes}
                  onChange={(e) =>
                    set('call', { maxDurationMinutes: Math.max(1, Number(e.target.value) || 30) })
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Inbound</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ToggleRow
                label="Answer incoming calls"
                hint="The digital human picks up your number"
                checked={form.inbound.enabled}
                onChange={(v) => set('inbound', { enabled: v })}
              />
              <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div>
                  <Label className="text-foreground">Unknown callers</Label>
                  <p className="text-[11px] text-muted-foreground">Numbers not in contacts</p>
                </div>
                <Select
                  value={form.inbound.unknownPolicy}
                  onValueChange={(v) =>
                    set('inbound', { unknownPolicy: v as 'allow' | 'reject' })
                  }
                >
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="allow">Answer</SelectItem>
                    <SelectItem value="reject">Reject</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Greeting hint</Label>
                <Input
                  placeholder="e.g. Mention that Abhinav is travelling this week"
                  value={form.inbound.greetingHint}
                  onChange={(e) => set('inbound', { greetingHint: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Memory */}
        <Card className="rise rise-4">
          <CardHeader>
            <CardTitle>Memory behavior</CardTitle>
            <CardDescription>How aggressively the agent learns and recalls.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <ToggleRow
              label="Auto-capture"
              hint="Extract memories after each call"
              checked={form.memory.autoCapture}
              onChange={(v) => set('memory', { autoCapture: v })}
            />
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Injected per call</Label>
                <span className="font-mono-nums text-xs text-muted-foreground">
                  {form.memory.maxInjected}
                </span>
              </div>
              <Slider
                value={[form.memory.maxInjected]}
                min={0}
                max={30}
                step={1}
                onValueChange={([v]) => set('memory', { maxInjected: v })}
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Min importance</Label>
                <span className="font-mono-nums text-xs text-muted-foreground">
                  {form.memory.minImportance.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[form.memory.minImportance]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={([v]) => set('memory', { minImportance: v })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Recency half-life (days)</Label>
              <Input
                type="number"
                min={1}
                className="font-mono-nums"
                value={form.memory.halfLifeDays}
                onChange={(e) =>
                  set('memory', { halfLifeDays: Math.max(1, Number(e.target.value) || 90) })
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Prompt template */}
        <Card className="rise rise-4">
          <CardHeader>
            <CardTitle>Identity prompt template</CardTitle>
            <CardDescription>
              Optional override of the built-in system prompt skeleton. Placeholders:{' '}
              <code className="font-mono-nums text-xs">{'{{agentName}} {{ownerName}} {{personality}} {{context}}'}</code>.
              Leave empty to use the built-in template.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={6}
              className="font-mono text-xs"
              placeholder="You are {{agentName}}…&#10;&#10;{{context}}"
              value={form.prompt.identityTemplate}
              onChange={(e) => set('prompt', { identityTemplate: e.target.value })}
            />
          </CardContent>
        </Card>

        <SecretsSection />
        <AuditSection />
      </div>
    </>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
      <div>
        <Label className="text-foreground">{label}</Label>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

const SECRET_LABELS: Record<string, string> = {
  'openai.apiKey': 'OpenAI API key',
  'twilio.accountSid': 'Twilio Account SID',
  'twilio.authToken': 'Twilio Auth Token',
  'exotel.sid': 'Exotel SID',
  'exotel.apiKey': 'Exotel API key',
  'exotel.apiToken': 'Exotel API token',
  'exotel.subdomain': 'Exotel subdomain',
  'exotel.flowId': 'Exotel voicebot flow id',
};

function SecretsSection() {
  const { data, mutate } = useSWR<{ items: SecretStatusDto[] }>('/settings/secrets', fetcher);
  const [values, setValues] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function saveSecret(key: string) {
    setSavingKey(key);
    try {
      await api.put('/settings/secrets', { key, value: values[key] ?? '' });
      toast.success(values[key] ? `${SECRET_LABELS[key] ?? key} saved (encrypted)` : 'Secret cleared');
      setValues((v) => ({ ...v, [key]: '' }));
      void mutate();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <Card className="rise rise-5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4 text-primary" /> Integrations
        </CardTitle>
        <CardDescription>
          Provider credentials, AES-256-GCM encrypted at rest. Values set here override environment
          variables.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {SECRET_KEYS.map((key) => {
          const status = data?.items.find((s) => s.key === key);
          return (
            <div key={key} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-4 py-2.5">
              <div className="min-w-44">
                <p className="text-sm">{SECRET_LABELS[key] ?? key}</p>
                <p className="font-mono-nums text-[11px] text-muted-foreground">
                  {status?.configured ? (
                    <>
                      {status.preview} <span className="opacity-60">· {status.source}</span>
                    </>
                  ) : (
                    'not configured'
                  )}
                </p>
              </div>
              {status?.configured ? (
                <Badge variant="success" className="shrink-0">set</Badge>
              ) : (
                <Badge variant="secondary" className="shrink-0">missing</Badge>
              )}
              <Input
                type="password"
                placeholder="paste new value…"
                className="min-w-40 flex-1"
                value={values[key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={savingKey === key}
                onClick={() => void saveSecret(key)}
              >
                {savingKey === key ? 'Saving…' : 'Save'}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function AuditSection() {
  const { data } = useSWR<{ items: AuditLogDto[] }>('/settings/audit?limit=50', fetcher);
  return (
    <Card className="rise rise-5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" /> Audit log
        </CardTitle>
        <CardDescription>Every login and mutation, newest first.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card-solid">
              <tr className="border-b border-border text-left">
                <th className="console-label py-2 pr-4 font-normal">when</th>
                <th className="console-label py-2 pr-4 font-normal">action</th>
                <th className="console-label py-2 pr-4 font-normal">resource</th>
                <th className="console-label py-2 font-normal">ip</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((a) => (
                <tr key={a.id} className="border-b border-border/40 last:border-0">
                  <td className="font-mono-nums py-2 pr-4 text-muted-foreground">
                    {fmtDateTime(a.createdAt)}
                  </td>
                  <td className="py-2 pr-4">{a.action}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{a.resource}</td>
                  <td className="font-mono-nums py-2 text-muted-foreground">{a.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.items.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">No audit entries yet.</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
