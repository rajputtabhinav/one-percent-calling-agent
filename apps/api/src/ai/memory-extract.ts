import { MEMORY_KINDS, type MemoryKind } from '@onepct/shared';
import { chatJSON } from './openai';

export interface ExtractedMemory {
  content: string;
  kind: MemoryKind;
  importance: number;
  supersedesId: string | null;
}

const SYSTEM = `You extract LASTING memories about a person from a phone call transcript, for a personal AI that will talk to them again.
Extract only durable facts: identity details, preferences, relationships, life events, commitments made, plans. NOT small talk, NOT one-time logistics that expire immediately.
You are given existing memories with ids. If a new fact UPDATES or CONTRADICTS an existing memory, set "supersedesId" to that memory's id.
Return STRICT JSON: {"memories": [{"content": "concise standalone sentence (who + fact)", "kind": "${MEMORY_KINDS.join('|')}", "importance": 0..1, "supersedesId": "existing-id-or-null"}]}
Max 8 memories. Empty list is fine — quality over quantity.`;

export async function extractMemories(opts: {
  transcriptText: string;
  contactName: string | null;
  existing: Array<{ id: string; content: string }>;
  model: string;
}): Promise<ExtractedMemory[]> {
  const existingBlock = opts.existing.length
    ? opts.existing.map((m) => `- [${m.id}] ${m.content}`).join('\n')
    : '(none)';
  const result = await chatJSON<{ memories: unknown[] }>({
    model: opts.model,
    system: SYSTEM,
    user: `Person: ${opts.contactName ?? 'unknown'}\n\nExisting memories:\n${existingBlock}\n\nTranscript:\n${opts.transcriptText}`,
    temperature: 0.1,
    maxTokens: 900,
  });
  if (!Array.isArray(result.memories)) return [];
  const existingIds = new Set(opts.existing.map((m) => m.id));
  const out: ExtractedMemory[] = [];
  for (const raw of result.memories.slice(0, 8)) {
    const m = raw as Record<string, unknown>;
    const content = typeof m.content === 'string' ? m.content.trim().slice(0, 600) : '';
    if (!content) continue;
    const kind = MEMORY_KINDS.includes(m.kind as MemoryKind) ? (m.kind as MemoryKind) : 'fact';
    const importance = Math.max(0, Math.min(1, Number(m.importance) || 0.5));
    const supersedesId =
      typeof m.supersedesId === 'string' && existingIds.has(m.supersedesId)
        ? m.supersedesId
        : null;
    out.push({ content, kind, importance, supersedesId });
  }
  return out;
}
