'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
  BarChart3,
  BookOpen,
  Brain,
  Disc3,
  Drama,
  FileText,
  LayoutDashboard,
  LogOut,
  Phone,
  Settings,
} from 'lucide-react';
import type { OwnerDto } from '@onepct/shared';
import { api, fetcher } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ActiveCallPill } from '@/components/active-call-pill';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/calls', label: 'Calls', icon: Phone },
  { href: '/recordings', label: 'Recordings', icon: Disc3 },
  { href: '/transcripts', label: 'Transcripts', icon: FileText },
  { href: '/memories', label: 'Memories', icon: Brain },
  { href: '/knowledge', label: 'Knowledge', icon: BookOpen },
  { href: '/personalities', label: 'Personalities', icon: Drama },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me } = useSWR<{ owner: OwnerDto; authDisabled?: boolean }>('/auth/me', fetcher);
  const { data: health } = useSWR<{ ok: boolean }>('/health', fetcher, {
    refreshInterval: 30000,
  });

  async function logout() {
    await api.post('/auth/logout').catch(() => {});
    router.push('/login');
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Sidebar ── */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-[218px] flex-col border-r border-border bg-black/25 backdrop-blur-xl">
        <div className="px-5 pb-4 pt-6">
          <Link href="/dashboard" className="block">
            <span className="font-display text-2xl font-bold tracking-tight">
              1<span className="text-primary">%</span>
            </span>
            <div className="filament mt-2" />
            <p className="console-label mt-2">digital human console</p>
          </Link>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-white/8 text-foreground'
                    : 'text-muted-foreground hover:bg-white/4 hover:text-foreground',
                )}
              >
                <Icon
                  className={cn('size-4', active ? 'text-primary' : 'group-hover:text-primary/70')}
                />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{me?.owner.agentName ?? '—'}</p>
              <p className="truncate text-xs text-muted-foreground">
                for {me?.owner.displayName ?? '…'}
              </p>
            </div>
            {me?.authDisabled ? null : (
              <button
                onClick={logout}
                title="Log out"
                className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground cursor-pointer"
              >
                <LogOut className="size-4" />
              </button>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className={cn(
                'inline-block size-2 rounded-full',
                health?.ok ? 'bg-emerald-400' : 'bg-destructive',
              )}
            />
            {health?.ok ? 'all systems live' : 'degraded'}
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="ml-[218px] flex-1">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-end gap-3 border-b border-border bg-background/70 px-6 backdrop-blur-xl">
          <ActiveCallPill />
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
