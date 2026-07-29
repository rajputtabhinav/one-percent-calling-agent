import { Pool, types } from 'pg';
import { config } from '../config';
import { logger } from '../lib/logger';

// Return bigint/numeric counts as JS numbers (safe for our ranges).
types.setTypeParser(20, (v) => Number(v));
types.setTypeParser(1700, (v) => Number(v));

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => logger.error({ err }, 'pg pool error'));

export async function query<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query(text, params as any[]);
  return res.rows as T[];
}

export async function queryOne<T = any>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function withTx<T>(fn: (q: typeof query) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const txQuery = async <R = any>(text: string, params: unknown[] = []) => {
      const res = await client.query(text, params as any[]);
      return res.rows as R[];
    };
    const result = await fn(txQuery as typeof query);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** pgvector literal — pass with `$n::vector` casts. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
