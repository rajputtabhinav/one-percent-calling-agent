import { describe, expect, it } from 'vitest';
import { pcm16ToUlaw, ulawBytesToMs, ulawToPcm16 } from '../src/lib/g711';

describe('g711 μ-law codec', () => {
  it('round-trips silence near zero', () => {
    const pcm = Buffer.alloc(320); // 160 samples of 0
    const ulaw = pcm16ToUlaw(pcm);
    expect(ulaw.length).toBe(160);
    const back = ulawToPcm16(ulaw);
    for (let i = 0; i < back.length / 2; i++) {
      expect(Math.abs(back.readInt16LE(i * 2))).toBeLessThanOrEqual(8);
    }
  });

  it('round-trips a sine wave with telephony-grade error', () => {
    const samples = 800;
    const pcm = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i++) {
      pcm.writeInt16LE(Math.round(12000 * Math.sin((i / 8000) * 2 * Math.PI * 440)), i * 2);
    }
    const back = ulawToPcm16(pcm16ToUlaw(pcm));
    let maxErr = 0;
    for (let i = 0; i < samples; i++) {
      maxErr = Math.max(maxErr, Math.abs(pcm.readInt16LE(i * 2) - back.readInt16LE(i * 2)));
    }
    // μ-law quantization error grows with amplitude; ~3% of peak is in spec.
    expect(maxErr).toBeLessThan(500);
  });

  it('clips extreme samples instead of wrapping', () => {
    const pcm = Buffer.alloc(4);
    pcm.writeInt16LE(32767, 0);
    pcm.writeInt16LE(-32768, 2);
    const back = ulawToPcm16(pcm16ToUlaw(pcm));
    expect(back.readInt16LE(0)).toBeGreaterThan(28000);
    expect(back.readInt16LE(2)).toBeLessThan(-28000);
  });

  it('converts byte counts to playback milliseconds at 8 kHz', () => {
    expect(ulawBytesToMs(8000)).toBe(1000);
    expect(ulawBytesToMs(160)).toBe(20);
  });
});
