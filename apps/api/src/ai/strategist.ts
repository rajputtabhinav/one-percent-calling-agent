import { chatText } from './openai';
import { logger } from '../lib/logger';

/**
 * Live "AI thoughts" sidecar: a one-line tactical read of the conversation,
 * streamed to the live call screen. Never blocks the audio path.
 */
export async function generateStrategyThought(opts: {
  transcriptTail: string;
  goal: string | null;
  model: string;
}): Promise<string | null> {
  try {
    const text = await chatText({
      model: opts.model,
      system:
        'You are the inner voice of an AI making a phone call. Given the last few turns, produce ONE short tactical thought (max 18 words) about how to steer the next moment of the conversation. Plain text, no quotes, no preamble.',
      user: `Call goal: ${opts.goal ?? 'friendly conversation'}\n\nRecent turns:\n${opts.transcriptTail}`,
      temperature: 0.7,
      maxTokens: 50,
    });
    return text ? text.split('\n')[0].slice(0, 160) : null;
  } catch (err) {
    logger.debug({ err: (err as Error).message }, 'strategist failed');
    return null;
  }
}
