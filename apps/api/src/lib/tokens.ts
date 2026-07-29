import { constantTimeEqual, hmacSha256 } from './crypto';

// Short-lived HMAC tokens for telephony media WebSockets — providers can't
// send cookies, so the stream URL carries `?callId=…&token=…`.

const MEDIA_TOKEN_TTL_MS = 4 * 3600 * 1000;

export function mintCallToken(callId: string, now = Date.now()): string {
  const exp = now + MEDIA_TOKEN_TTL_MS;
  const sig = hmacSha256(`media:${callId}:${exp}`);
  return `${exp}.${sig}`;
}

export function verifyCallToken(callId: string, token: string, now = Date.now()): boolean {
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  const sig = token.slice(dot + 1);
  if (!Number.isFinite(exp) || exp < now) return false;
  return constantTimeEqual(hmacSha256(`media:${callId}:${exp}`), sig);
}
