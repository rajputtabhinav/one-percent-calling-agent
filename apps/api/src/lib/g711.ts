// G.711 μ-law ⇄ 16-bit linear PCM (8 kHz telephony audio).
// Used for the Exotel media bridge (Exotel speaks 16-bit PCM, the voice
// engine speaks g711_ulaw). Table-driven for speed — no per-sample branching.

const BIAS = 0x84;
const CLIP = 32635;

const encodeTable = new Uint8Array(65536);
const decodeTable = new Int16Array(256);

(function buildTables() {
  // μ-law decode table
  for (let i = 0; i < 256; i++) {
    const u = ~i & 0xff;
    const sign = u & 0x80;
    const exponent = (u >> 4) & 0x07;
    const mantissa = u & 0x0f;
    let sample = ((mantissa << 3) + BIAS) << exponent;
    sample -= BIAS;
    decodeTable[i] = sign ? -sample : sample;
  }
  // μ-law encode table (indexed by unsigned 16-bit reinterpretation)
  for (let i = 0; i < 65536; i++) {
    let sample = (i << 16) >> 16; // reinterpret as signed
    const sign = sample < 0 ? 0x80 : 0;
    if (sample < 0) sample = -sample;
    if (sample > CLIP) sample = CLIP;
    sample += BIAS;
    let exponent = 7;
    for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
    const mantissa = (sample >> (exponent + 3)) & 0x0f;
    encodeTable[i] = ~(sign | (exponent << 4) | mantissa) & 0xff;
  }
})();

/** μ-law bytes → 16-bit LE PCM buffer */
export function ulawToPcm16(ulaw: Buffer): Buffer {
  const out = Buffer.allocUnsafe(ulaw.length * 2);
  for (let i = 0; i < ulaw.length; i++) {
    out.writeInt16LE(decodeTable[ulaw[i]], i * 2);
  }
  return out;
}

/** 16-bit LE PCM buffer → μ-law bytes */
export function pcm16ToUlaw(pcm: Buffer): Buffer {
  const samples = Math.floor(pcm.length / 2);
  const out = Buffer.allocUnsafe(samples);
  for (let i = 0; i < samples; i++) {
    out[i] = encodeTable[pcm.readUInt16LE(i * 2)];
  }
  return out;
}

/** Duration of a μ-law byte count at 8 kHz (1 byte = 1 sample = 0.125 ms). */
export function ulawBytesToMs(bytes: number): number {
  return Math.round(bytes / 8);
}
