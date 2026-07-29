'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Client-side hop keeps `/` a 200 (probe/health friendly); middleware still
// guards the destination.
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);
  return (
    <main className="flex min-h-screen items-center justify-center">
      <span className="font-display text-3xl font-bold tracking-tight">
        1<span className="text-primary">%</span>
      </span>
    </main>
  );
}
