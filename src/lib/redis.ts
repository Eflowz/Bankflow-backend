import { createClient, type RedisClientType } from 'redis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

// ─────────────────────────────────────────────────────────────
// Redis is OPTIONAL. If REDIS_URL is missing or unreachable,
// the app still runs — cache/rate-limit features just no-op.
// ─────────────────────────────────────────────────────────────

let client: RedisClientType | null = null;
let connected = false;

if (env.REDIS_URL) {
  client = createClient({
    url: env.REDIS_URL,
    socket: {
      // Don't block boot if Upstash is slow
      connectTimeout: 5000,
      reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
    },
  });

  client.on('error', (err) => {
    logger.warn({ err }, 'Redis client error');
    connected = false;
  });

  client.on('connect', () => {
    logger.info('Redis connected');
    connected = true;
  });

  client.on('end', () => {
    connected = false;
  });

  // Fire-and-forget connect. Do NOT await at module load.
  client.connect().catch((err) => {
    logger.warn({ err }, 'Redis failed to connect — running without cache');
  });
} else {
  logger.warn('REDIS_URL not set — running without Redis');
}

export const redis = client;
export const isRedisReady = () => connected && client !== null;

/**
 * Safe wrapper: returns null if Redis is down, never throws.
 * Use this when Redis is a fast-path optimization, not a hard dependency.
 */
export async function safeRedisGet(key: string): Promise<string | null> {
  if (!isRedisReady() || !client) return null;
  try {
    return await client.get(key);
  } catch (err) {
    logger.warn({ err, key }, 'redis GET failed');
    return null;
  }
}

export async function safeRedisSet(
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<void> {
  if (!isRedisReady() || !client) return;
  try {
    await client.set(key, value, { EX: ttlSeconds });
  } catch (err) {
    logger.warn({ err, key }, 'redis SET failed');
  }
}