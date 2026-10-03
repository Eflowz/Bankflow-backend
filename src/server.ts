import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { redis, isRedisReady } from './lib/redis.js';

async function main() {
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(`BankFlow API listening on http://localhost:${env.PORT}`);
    logger.info(`   API prefix:    ${env.API_PREFIX}`);
    logger.info(`   Environment:   ${env.NODE_ENV}`);
    logger.info(`   Redis ready:   ${isRedisReady()}`);
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down gracefully...');

    server.close(async (err) => {
      if (err) {
        logger.error({ err }, 'Error closing HTTP server');
      }

      try {
        await prisma.$disconnect();
        logger.info('Prisma disconnected');

        if (redis && isRedisReady()) {
          await redis.quit();
          logger.info('Redis disconnected');
        }
      } catch (e) {
        logger.error({ err: e }, 'Error during shutdown');
      }

      process.exit(err ? 1 : 0);
    });

    // Force-exit after 10s if graceful shutdown hangs
    setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // ─── Unhandled errors ───────────────────────────────────
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception — shutting down');
    process.exit(1);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});