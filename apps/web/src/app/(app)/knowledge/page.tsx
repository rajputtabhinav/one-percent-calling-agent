'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { BookOpen, FileUp, Search, Trash2 } from 'lucide-react';
import type { DocumentDto, KnowledgeSearchHit } from '@onepct/shared';
import { api, fetcher } from '@/lib/api';
import { fmtBytes, fmtDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';

export default function KnowledgePage() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<KnowledgeSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  const { data, mutate } = useSWR<{ items: DocumentDto[] }>('/knowledge', fetcher, {
    refreshInterval: (latest) =>
      latest?.items.some((d) => d.status === 'processing') ? 2500 : 0,
  });

  async function upload(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    try {
      await api.upload('/knowledge/upload', form);
      toast.success(`Processing ${file.name}…`);
      void mutate();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function remove(id: string) {
    if (!confirm('Remove this document and its knowledge?')) return;
    await api.del(`/knowledge/${id}`).catch((e) => toast.error(e.message));
    void mutate();
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setSearching(true);
    try {
      const r = await api.get<{ items: KnowledgeSearchHit[] }>(
        `/knowledge/search?q=${encodeURIComponent(q.trim())}`,
      );
      setHits(r.items);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSearching(false);
    }
  }

  return (
    <>
      <PageHeader
        label="retrieval corpus"
        title="Knowledge base"
        description="Documents the agent can consult mid-call with the search_knowledge tool."
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.txt,.md,.markdown"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
              <FileUp /> {uploading ? 'Uploading…' : 'Upload document'}
            </Button>
          </>
        }
      />

      {/* Test retrieval */}
      <form onSubmit={search} className="rise rise-1 relative mb-6">
        <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Test what the agent would find — ask a question… (press Enter)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-11 pl-11"
        />
      </form>

      {searching ? <Skeleton className="mb-6 h-24" /> : null}
      {hits !== null && !searching ? (
        <div className="mb-8 space-y-2">
          {hits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No relevant passages found.</p>
          ) : (
            hits.map((h) => (
              <Card key={h.chunkId} className="p-4">
                <p className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-primary">{h.documentTitle}</span>
                  <span className="font-mono-nums text-muted-foreground">
                    {(h.score * 100).toFixed(0)}% relevant
                  </span>
                </p>
                <p className="line-clamp-3 text-sm leading-relaxed text-foreground/85">{h.content}</p>
              </Card>
            ))
          )}
        </div>
      ) : null}

      {/* Documents */}
      {!data ? (
        <Skeleton className="h-48" />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No documents"
          description="Upload PDFs, Word files, text, or Markdown. They get chunked, embedded, and become searchable in calls."
        />
      ) : (
        <div className="rise rise-2 surface overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="console-label px-4 py-3 font-normal">document</th>
                <th className="console-label px-4 py-3 font-normal">status</th>
                <th className="console-label px-4 py-3 font-normal">chunks</th>
                <th className="console-label px-4 py-3 font-normal">size</th>
                <th className="console-label px-4 py-3 font-normal">added</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((d) => (
                <tr key={d.id} className="border-b border-border/50 last:border-0 hover:bg-white/3">
                  <td className="px-4 py-3">
                    <p className="font-medium">{d.title}</p>
                    <p className="text-xs text-muted-foreground">{d.filename}</p>
                  </td>
                  <td className="px-4 py-3">
                    {d.status === 'ready' ? (
                      <Badge variant="success">ready</Badge>
                    ) : d.status === 'processing' ? (
                      <Badge>processing…</Badge>
                    ) : (
                      <Badge variant="destructive" title={d.error ?? ''}>
                        failed
                      </Badge>
                    )}
                    {d.status === 'failed' && d.error ? (
                      <p className="mt-1 max-w-56 truncate text-[11px] text-destructive/80" title={d.error}>
                        {d.error}
                      </p>
                    ) : null}
                  </td>
                  <td className="font-mono-nums px-4 py-3 text-muted-foreground">{d.chunkCount}</td>
                  <td className="font-mono-nums px-4 py-3 text-muted-foreground">{fmtBytes(d.sizeBytes)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(d.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => void remove(d.id)}
                      className="rounded p-1.5 text-muted-foreground hover:text-destructive cursor-pointer"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
