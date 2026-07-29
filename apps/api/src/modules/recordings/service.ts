import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { RecordingDto } from '@onepct/shared';
import { query, queryOne } from '../../db/pool';
import { config } from '../../config';
import { logger } from '../../lib/logger';

export interface RecordingRow {
  id: string;
  call_id: string;
  provider_recording_sid: string | null;
  file_path: string | null;
  duration_seconds: number;
  size_bytes: number;
  channels: number;
  format: string;
  status: 'pending' | 'ready' | 'failed';
  created_at: Date;
  // joined
  direction?: 'inbound' | 'outbound' | null;
  contact_name?: string | null;
  to_number?: string | null;
  from_number?: string | null;
  call_started_at?: Date | null;
}

export function toRecordingDto(r: RecordingRow): RecordingDto {
  return {
    id: r.id,
    callId: r.call_id,
    durationSeconds: r.duration_seconds,
    sizeBytes: r.size_bytes,
    channels: r.channels,
    format: r.format,
    status: r.status,
    createdAt: new Date(r.created_at).toISOString(),
    direction: r.direction ?? null,
    contactName: r.contact_name ?? null,
    toNumber: r.to_number ?? null,
    fromNumber: r.from_number ?? null,
    callStartedAt: r.call_started_at ? new Date(r.call_started_at).toISOString() : null,
  };
}

const JOINED = `
  SELECT r.*, cl.direction, cl.to_number, cl.from_number, cl.started_at AS call_started_at,
         c.name AS contact_name
  FROM recordings r
  JOIN calls cl ON cl.id = r.call_id
  LEFT JOIN contacts c ON c.id = cl.contact_id`;

export async function listRecordings(
  limit: number,
  offset: number,
): Promise<{ rows: RecordingRow[]; total: number }> {
  const totalRow = await queryOne<{ count: number }>(
    `SELECT count(*)::int AS count FROM recordings`,
  );
  const rows = await query<RecordingRow>(
    `${JOINED} ORDER BY r.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return { rows, total: totalRow?.count ?? 0 };
}

export async function getRecording(id: string): Promise<RecordingRow | null> {
  return queryOne<RecordingRow>(`${JOINED} WHERE r.id = $1`, [id]);
}

export async function getRecordingByCall(callId: string): Promise<RecordingRow | null> {
  return queryOne<RecordingRow>(`${JOINED} WHERE r.call_id = $1`, [callId]);
}

export async function upsertPendingRecording(
  callId: string,
  providerRecordingSid: string,
): Promise<void> {
  await query(
    `INSERT INTO recordings (call_id, provider_recording_sid, status)
     VALUES ($1, $2, 'pending')
     ON CONFLICT (call_id) DO UPDATE SET provider_recording_sid = EXCLUDED.provider_recording_sid`,
    [callId, providerRecordingSid],
  );
}

export async function deleteRecording(id: string): Promise<boolean> {
  const row = await queryOne<RecordingRow>(
    'DELETE FROM recordings WHERE id = $1 RETURNING *',
    [id],
  );
  if (!row) return false;
  if (row.file_path) await fsp.unlink(row.file_path).catch(() => {});
  return true;
}

/** Download a completed recording from the telephony provider to local storage. */
export async function storeRecordingFromUrl(opts: {
  callId: string;
  providerRecordingSid: string;
  url: string;
  durationSeconds: number;
  channels: number;
  authHeader?: string;
  format?: 'wav' | 'mp3';
}): Promise<void> {
  const format = opts.format ?? 'wav';
  const dir = path.join(config.storageDir, 'recordings');
  await fsp.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${opts.callId}.${format}`);
  try {
    const res = await fetch(opts.url, {
      headers: opts.authHeader ? { Authorization: opts.authHeader } : undefined,
    });
    if (!res.ok) throw new Error(`recording download failed: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await fsp.writeFile(filePath, buf);
    await query(
      `INSERT INTO recordings (call_id, provider_recording_sid, file_path, duration_seconds, size_bytes, channels, format, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'ready')
       ON CONFLICT (call_id) DO UPDATE SET
         provider_recording_sid = EXCLUDED.provider_recording_sid,
         file_path = EXCLUDED.file_path, duration_seconds = EXCLUDED.duration_seconds,
         size_bytes = EXCLUDED.size_bytes, channels = EXCLUDED.channels,
         format = EXCLUDED.format, status = 'ready'`,
      [
        opts.callId,
        opts.providerRecordingSid,
        filePath,
        opts.durationSeconds,
        buf.length,
        opts.channels,
        format,
      ],
    );
    logger.info({ callId: opts.callId, bytes: buf.length }, 'recording stored');
  } catch (err) {
    logger.error({ err, callId: opts.callId }, 'recording download failed');
    await query(
      `INSERT INTO recordings (call_id, provider_recording_sid, status)
       VALUES ($1,$2,'failed')
       ON CONFLICT (call_id) DO UPDATE SET status = 'failed'`,
      [opts.callId, opts.providerRecordingSid],
    );
  }
}

export function openRecordingStream(
  filePath: string,
  range?: string,
): {
  stream: fs.ReadStream;
  start: number;
  end: number;
  size: number;
} | null {
  const stat = fs.statSync(filePath);
  let start = 0;
  let end = stat.size - 1;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      if (m[1]) start = parseInt(m[1], 10);
      if (m[2]) end = parseInt(m[2], 10);
      if (Number.isNaN(start) || start > end || end >= stat.size) return null;
    }
  }
  return { stream: fs.createReadStream(filePath, { start, end }), start, end, size: stat.size };
}
