import OpenAI from 'openai';
import { getSecret, getSettings } from '../modules/settings/service';
import { unavailable } from '../lib/errors';
import { logger } from '../lib/logger';

let cached: { key: string; client: OpenAI } | null = null;

export async function getOpenAIKey(): Promise<string> {
  const key = await getSecret('openai.apiKey');
  if (!key) {
    throw unavailable('OpenAI API key is not configured — add it in Settings → Integrations');
  }
  return key;
}

export async function getOpenAI(): Promise<OpenAI> {
  const key = await getOpenAIKey();
  if (cached?.key === key) return cached.client;
  const client = new OpenAI({ apiKey: key });
  cached = { key, client };
  return client;
}

// ── Embeddings ───────────────────────────────────────────────────────────────

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const [client, settings] = await Promise.all([getOpenAI(), getSettings()]);
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 64) {
    const batch = texts.slice(i, i + 64).map((t) => t.slice(0, 8000));
    const res = await client.embeddings.create({
      model: settings.ai.embeddingModel,
      input: batch,
    });
    for (const item of res.data) out.push(item.embedding);
  }
  return out;
}

export async function embedText(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v;
}

/** Embed, but never throw — used on write paths where a missing key/outage
 *  should degrade (row saved without vector) rather than fail the operation. */
export async function tryEmbedText(text: string): Promise<number[] | null> {
  try {
    return await embedText(text);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'embedding failed — storing without vector');
    return null;
  }
}

// ── JSON-mode chat helper ────────────────────────────────────────────────────

export interface ChatJsonOptions {
  model: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}

export async function chatJSON<T>(opts: ChatJsonOptions): Promise<T> {
  const client = await getOpenAI();
  const res = await client.chat.completions.create({
    model: opts.model,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 1500,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
  });
  const content = res.choices[0]?.message?.content ?? '';
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(`Model returned non-JSON output: ${content.slice(0, 200)}`);
  }
}

export async function chatText(opts: ChatJsonOptions): Promise<string> {
  const client = await getOpenAI();
  const res = await client.chat.completions.create({
    model: opts.model,
    temperature: opts.temperature ?? 0.6,
    max_tokens: opts.maxTokens ?? 400,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
  });
  return res.choices[0]?.message?.content?.trim() ?? '';
}
