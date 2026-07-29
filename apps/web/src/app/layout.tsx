import type { Metadata } from 'next';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/instrument-sans';
import '@fontsource-variable/jetbrains-mono';
import './globals.css';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: '1% — Digital Human',
  description: 'Personal AI calling agent console',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="relative">
        <div className="relative z-10">{children}</div>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--popover)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
            },
          }}
        />
      </body>
    </html>
  );
}
