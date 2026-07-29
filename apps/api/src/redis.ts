import Redis from 'ioredis';
import { config } from './config';
import { logger } from './lib/logger';

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 2,
  lazyConnect: false,
});

redis.on('error', (err) => logger.warn({ err: err.message }, 'redis error'));

/** Separate connection factory for BullMQ (it requires maxRetriesPerRequest: null). */
export function createBullConnection(): Redis {
  return new Redis(config.redisUrl, { maxRetriesPerRequest: null });
}
