import { describe, expect, it } from 'vitest';
import { chunkText } from '../src/lib/chunk';

describe('knowledge chunker', () => {
  it('returns nothing for empty input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n  ')).toEqual([]);
  });

  it('keeps short documents as a single chunk', () => {
    const chunks = chunkText('Hello world.\n\nSecond paragraph.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain('Second paragraph.');
    expect(chunks[0].tokenEstimate).toBeGreaterThan(0);
  });

  it('splits long documents into bounded chunks with overlap', () => {
    const para = 'This is a sentence about servers and validation testing. '.repeat(8);
    const doc = Array.from({ length: 30 }, (_, i) => `Para ${i}. ${para}`).join('\n\n');
    const chunks = chunkText(doc);
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) {
      expect(c.content.length).toBeLessThanOrEqual(2400);
    }
    // Overlap: the tail of chunk N reappears at the head of chunk N+1.
    expect(chunks[1].content.startsWith('…')).toBe(true);
  });

  it('hard-splits pathological text without sentence boundaries', () => {
    const blob = 'x'.repeat(6000);
    const chunks = chunkText(blob);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(2400);
  });
});
