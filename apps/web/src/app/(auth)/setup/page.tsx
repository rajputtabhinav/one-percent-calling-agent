'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function SetupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    username: '',
    password: '',
    displayName: '',
    agentName: 'Aarav',
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<{ needsSetup: boolean }>('/auth/status')
      .then((s) => {
        if (!s.needsSetup) router.replace('/login');
      })
      .catch(() => {});
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/setup', {
        username: form.username,
        password: form.password,
        displayName: form.displayName || undefined,
        agentName: form.agentName || undefined,
      });
      toast.success('Welcome. Your digital human is alive.');
      router.push('/dashboard');
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="rise mb-8 text-center">
          <span className="font-display text-5xl font-bold tracking-tight">
            1<span className="text-primary">%</span>
          </span>
          <p className="mt-4 font-display text-xl font-semibold">Bring your digital human to life</p>
          <p className="mt-1 text-sm text-muted-foreground">
            One owner. One agent. This setup runs exactly once.
          </p>
        </div>
        <form onSubmit={submit} className="surface rise rise-2 space-y-4 p-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="displayName">Your name</Label>
              <Input id="displayName" placeholder="Abhinav" value={form.displayName} onChange={set('displayName')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agentName">Agent&apos;s name</Label>
              <Input id="agentName" placeholder="Aarav" value={form.agentName} onChange={set('agentName')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input id="username" autoComplete="username" value={form.username} onChange={set('username')} required minLength={3} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={set('password')}
              required
              minLength={8}
            />
            <p className="text-[11px] text-muted-foreground">At least 8 characters.</p>
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy ? 'Creating…' : 'Create owner account'}
          </Button>
        </form>
      </div>
    </main>
  );
}
