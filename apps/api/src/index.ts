import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import { logger } from './lib/logger';
import { migrate } from './db/migrate';
import { pool } from './db/pool';
import { redis } from './redis';
import { buildApp } from './app';
import { startWorkers, stopJobs } from './jobs/queue';
import { sessionManager } from './realtime/manager';

async function main(): Promise<void> {
  for (const dir of ['recordings', 'uploads']) {
    fs.mkdirSync(path.join(config.storageDir, dir), { recursive: true });
  }

  try {
    await migrate();
  } catch (err) {
    if (isConnectionError(err)) {
      const safeUrl = config.databaseUrl.replace(/:[^:@/]+@/, ':***@');
      logger.error(
        `Cannot reach PostgreSQL at ${safeUrl}. The API needs PostgreSQL 16 with the pgvector ` +
          `extension. Point DATABASE_URL in .env at a running instance (or start one with ` +
          `"docker compose up -d db redis"). See docs/DEPLOYMENT.md.`,
      );
      process.exit(1);
    }
    throw err;
  }

  try {
    await redis.ping();
  } catch {
    logger.error(
      `Cannot reach Redis at ${config.redisUrl}. Sessions, call prep, and the post-call ` +
        `pipeline need it. Point REDIS_URL in .env at a running instance (or start one with ` +
        `"docker compose up -d db redis"). See docs/DEPLOYMENT.md.`,
    );
    process.exit(1);
  }

  const app = await buildApp();
  await app.listen({ port: config.port, host: '0.0.0.0' });
  startWorkers();
  logger.info(
    { port: config.port, publicBaseUrl: config.publicBaseUrl, env: config.env },
    '1% api up',
  );
  if (config.authDisabled) {
    const exposed = !/localhost|127\.0\.0\.1/.test(config.publicBaseUrl);
    logger.warn(
      `AUTH DISABLED — open access, no login.${
        exposed
          ? ` PUBLIC_BASE_URL (${config.publicBaseUrl}) looks publicly reachable: anyone who finds it has full access. Set AUTH_DISABLED=false to require login.`
          : ''
      }`,
    );
  }

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    try {
      await sessionManager.shutdown();
      await app.close();
      await stopJobs();
      await redis.quit().catch(() => {});
      await pool.end();
    } catch (err) {
      logger.error({ err }, 'shutdown error');
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

function isConnectionError(err: unknown): boolean {
  if (err instanceof AggregateError) {
    return err.errors.some((e) => isConnectionError(e));
  }
  const code = (err as { code?: string })?.code ?? '';
  return ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH'].includes(code);
}

main().catch((err) => {
  logger.error({ err }, 'fatal boot error');
  process.exit(1);
});
