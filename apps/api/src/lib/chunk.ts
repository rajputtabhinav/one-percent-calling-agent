// Paragraph-aware text chunking for the knowledge base.

export interface Chunk {
  content: string;
  tokenEstimate: number;
}

const TARGET_CHARS = 1800;
const OVERLAP_CHARS = 300;

export function chunkText(text: string): Chunk[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  if (!clean) return [];

  // Split into paragraphs; fall back to sentence-ish splits for giant blocks.
  const paragraphs = clean
    .split(/\n{2,}/)
    .flatMap((p) => (p.length > TARGET_CHARS ? splitLong(p) : [p]))
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: Chunk[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (current && current.length + para.length + 2 > TARGET_CHARS) {
      chunks.push(makeChunk(current));
      current = overlapTail(current) + para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current.trim()) chunks.push(makeChunk(current));
  return chunks;
}

function splitLong(block: string): string[] {
  const sentences = block.split(/(?<=[.!?।])\s+/);
  const parts: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && cur.length + s.length + 1 > TARGET_CHARS) {
      parts.push(cur);
      cur = s;
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  if (cur) parts.push(cur);
  // Hard-split anything still oversized (no sentence boundaries at all).
  return parts.flatMap((p) =>
    p.length > TARGET_CHARS * 1.5
      ? (p.match(new RegExp(`.{1,${TARGET_CHARS}}`, 'gs')) ?? [p])
      : [p],
  );
}

function overlapTail(text: string): string {
  if (text.length <= OVERLAP_CHARS) return `${text}\n\n`;
  const tail = text.slice(-OVERLAP_CHARS);
  const firstSpace = tail.indexOf(' ');
  return `…${tail.slice(firstSpace + 1)}\n\n`;
}

function makeChunk(content: string): Chunk {
  const trimmed = content.trim();
  return { content: trimmed, tokenEstimate: Math.ceil(trimmed.length / 4) };
}
