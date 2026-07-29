'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<{ needsSetup: boolean; authenticated: boolean }>('/auth/status')
      .then((s) => {
        if (s.needsSetup) router.replace('/setup');
        else if (s.authenticated) router.replace('/dashboard');
      })
      .catch(() => {});
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/login', { username, password });
      router.push('/dashboard');
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="rise mb-8 text-center">
          <span className="font-display text-5xl font-bold tracking-tight">
            1<span className="text-primary">%</span>
          </span>
          <div className="filament mx-auto mt-4 w-40" />
          <p className="console-label mt-3">digital human console</p>
        </div>
        <form onSubmit={submit} className="surface rise rise-2 space-y-4 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy ? 'Signing in…' : 'Enter console'}
          </Button>
        </form>
        <p className="rise rise-3 mt-6 text-center text-xs text-muted-foreground">
          Single-owner system. Your digital human answers to you alone.
        </p>
      </div>
    </main>
  );
}
